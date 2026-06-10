/**
 * Viettours AI Worker — Cloudflare Worker
 * --------------------------------------------------------------------------
 * Backend proxy giữ API key, phục vụ cho app tour-cost-calculator.
 *
 * Endpoints (đều POST, body JSON):
 *   POST /ocr        { image: "<base64 không có tiền tố data:>" }  -> { text }
 *   POST /translate  { text:  "<văn bản tiếng Việt>" }             -> { text }  (dịch sang tiếng Anh)
 *   POST /ai         { prompt: "<prompt>" }                         -> { text }  (dùng cho Chương trình tour)
 *
 * Secret cần thêm trong Cloudflare (Settings → Variables and Secrets):
 *   ANTHROPIC_API_KEY = sk-ant-...   (loại "Secret")
 *
 * Sau khi Deploy, copy URL (vd https://tour-cost-calculator.<tên>.workers.dev) và dán
 * vào ô "AI Worker URL" trong app, bấm Lưu.
 */

const MODEL = 'claude-sonnet-4-6'; // Cân bằng chất lượng/chi phí. Đổi 'claude-haiku-4-5' (rẻ hơn) hoặc 'claude-opus-4-8' (cao nhất) nếu cần
const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS },
  });
}

// Đoán media type từ vài byte đầu của base64 (Claude vision cần đúng media_type).
function mediaTypeFromB64(b64) {
  if (b64.startsWith('/9j/')) return 'image/jpeg';
  if (b64.startsWith('iVBORw0KGgo')) return 'image/png';
  if (b64.startsWith('R0lGOD')) return 'image/gif';
  if (b64.startsWith('UklGR')) return 'image/webp';
  return 'image/png';
}

async function callClaude(env, content, maxTokens = 8000) {
  if (!env.ANTHROPIC_API_KEY) throw new Error('Worker chưa cấu hình ANTHROPIC_API_KEY');
  const r = await fetch(ANTHROPIC_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: maxTokens,
      messages: [{ role: 'user', content }],
    }),
  });
  const data = await r.json();
  if (!r.ok) throw new Error(data?.error?.message || `Anthropic ${r.status}`);
  return (data.content || [])
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('')
    .trim();
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') return new Response(null, { headers: CORS });
    if (request.method !== 'POST') return json({ error: 'Chỉ hỗ trợ POST' }, 405);

    const path = new URL(request.url).pathname.replace(/\/+$/, '');
    let body;
    try {
      body = await request.json();
    } catch {
      return json({ error: 'Body JSON không hợp lệ' }, 400);
    }

    try {
      if (path.endsWith('/ocr')) {
        if (!body.image) return json({ error: "Thiếu trường 'image'" }, 400);
        const text = await callClaude(env, [
          {
            type: 'image',
            source: { type: 'base64', media_type: mediaTypeFromB64(body.image), data: body.image },
          },
          {
            type: 'text',
            text:
              'Trích xuất TOÀN BỘ chữ trong ảnh này (chủ yếu tiếng Việt). ' +
              'Giữ nguyên thứ tự, xuống dòng và bố cục. ' +
              'Chỉ trả về văn bản trích xuất, không thêm bất kỳ lời giải thích nào.',
          },
        ]);
        return json({ text });
      }

      if (path.endsWith('/translate')) {
        if (!body.text) return json({ error: "Thiếu trường 'text'" }, 400);
        const text = await callClaude(env, [
          {
            type: 'text',
            text:
              'Dịch đoạn văn bản sau từ TIẾNG VIỆT sang TIẾNG ANH. ' +
              'Giữ nguyên định dạng, xuống dòng và thuật ngữ chuyên ngành du lịch/sự kiện. ' +
              'Chỉ trả về bản dịch tiếng Anh, không thêm chú thích.\n\n---\n' +
              body.text,
          },
        ]);
        return json({ text });
      }

      if (path.endsWith('/ai')) {
        if (!body.prompt) return json({ error: "Thiếu trường 'prompt'" }, 400);
        const text = await callClaude(env, [{ type: 'text', text: body.prompt }]);
        return json({ text });
      }

      return json({ error: 'Endpoint không hỗ trợ: ' + path }, 404);
    } catch (e) {
      return json({ error: e.message || String(e) }, 500);
    }
  },
};
