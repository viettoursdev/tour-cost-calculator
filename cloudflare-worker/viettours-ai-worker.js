/**
 * Viettours AI Worker — Cloudflare Worker
 * --------------------------------------------------------------------------
 * Backend proxy giữ API key, phục vụ cho app tour-cost-calculator.
 *
 * Endpoints:
 *   POST /ocr        { image: "<base64 không tiền tố data:>" }  -> { text }
 *   POST /translate  { text:  "<văn bản tiếng Việt>" }          -> { text }   (dịch sang tiếng Anh)
 *   POST /ai         { prompt: "<prompt>" }                      -> { text }   (Chương trình tour)
 *   POST /upload?name=<tên>&type=<mime>  (body = file nhị phân)  -> { key, name }   (lưu lên R2)
 *   GET  /file/<key>                                              -> nội dung file  (tải/xem từ R2)
 *
 * Cấu hình trong Cloudflare:
 *   - Secret:  ANTHROPIC_API_KEY = sk-ant-...   (Settings → Variables and Secrets)
 *   - R2 bind: tạo R2 bucket rồi bind với Variable name = FILES  (Settings → Bindings → R2)
 *
 * Sau khi Deploy, copy URL (vd https://tour-cost-calculator.<tên>.workers.dev) và dán
 * vào ô "AI Worker URL" trong app, bấm Lưu.
 */

const MODEL = 'claude-haiku-4-5-20251001'; // Rẻ & nhanh — dùng cho /ocr, /ai
const MODEL_TRANSLATE = 'claude-sonnet-4-6'; // Dịch hồ sơ visa cần chính xác thuật ngữ pháp lý
const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';

// Prompt dịch hồ sơ visa Việt→Anh chuẩn lãnh sự (chắt lọc từ skill visa-translation).
const VISA_TRANSLATE_PROMPT = [
  'Bạn là biên dịch viên hồ sơ visa Việt → Anh nộp lãnh sự. Bản dịch được chấm theo 3 tiêu chí:',
  'CHÍNH XÁC DỮ KIỆN tuyệt đối · ĐÚNG THUẬT NGỮ hành chính/pháp lý · GIỐNG BỐ CỤC bản gốc để viên',
  'chức đối chiếu. KHÔNG dịch cho "mượt" — ưu tiên trung thực với bản gốc.',
  '',
  'ĐẦU RA: CHỈ tiếng Anh, mô phỏng đúng bố cục bản gốc (giữ thứ tự, xuống dòng, bảng ra bảng, đúng',
  'số cột). KHÔNG song ngữ, KHÔNG thêm tiêu đề/ghi chú/giải thích ngoài bản dịch.',
  '',
  'QUY TẮC BẤT DI BẤT DỊCH:',
  '• Tên người: GIỮ NGUYÊN, không dịch, giữ đủ dấu tiếng Việt (vd "Nguyễn Văn Anh" giữ nguyên).',
  '  Nếu nguồn ghi không dấu thì theo nguồn — tên phải khớp hộ chiếu.',
  '• Địa danh: giữ tên riêng tiếng Việt CÓ DẤU, chỉ dịch danh từ đơn vị: phường=Ward, xã=Commune,',
  '  quận=District, huyện=District, tỉnh=Province, thành phố=City. Vd "Phường Bến Nghé, Quận 1," +',
  '  " TP. Hồ Chí Minh" → "Ben Nghe Ward, District 1, Ho Chi Minh City".',
  '• Ngày tháng: GIỮ NGUYÊN giá trị, viết tháng bằng CHỮ để khỏi nhầm: "03/02/2024" → "February 3, 2024".',
  '• Số tiền/số liệu: copy CHÍNH XÁC từng chữ số, giữ đơn vị gốc (VND), KHÔNG quy đổi ngoại tệ.',
  '  Sao kê/bảng lương: từng dòng, số dư phải khớp tuyệt đối.',
  '• Con dấu/chữ ký/ô trống/ảnh: mô tả trong [ngoặc vuông], KHÔNG bịa nội dung. Vd:',
  '  [Round red seal: People\'s Committee of Ben Nghe Ward] · [Signed] · [No signature] · [Photo] · [QR code].',
  '• Chỗ không đọc được: ghi [illegible], không đoán.',
  '• KHÔNG thêm, KHÔNG bớt, KHÔNG biên tập kể cả khi bản gốc có lỗi.',
  '',
  'QUỐC HIỆU (nếu có) đặt đầu, căn giữa:',
  '  SOCIALIST REPUBLIC OF VIETNAM / Independence – Freedom – Happiness',
  '',
  'GLOSSARY CHUẨN (bắt buộc dùng đúng):',
  'Ủy ban nhân dân=People\'s Committee · Công an=Public Security/Police · Cục Quản lý xuất nhập cảnh=',
  'Immigration Department · Sở=Department · Phòng=Division/Office · Chủ tịch=Chairman · Giám đốc=Director.',
  'Giấy khai sinh=Birth Certificate · Giấy chứng nhận kết hôn=Marriage Certificate · Giấy xác nhận tình',
  'trạng hôn nhân=Certificate of Marital Status · Sổ hộ khẩu=Household Registration Book · Giấy xác nhận',
  'thông tin về cư trú (CT07)=Certificate of Residence Information (Form CT07) · Căn cước công dân=Citizen',
  'Identity Card · Chứng minh nhân dân=People\'s Identity Card · Hộ chiếu=Passport. Họ và tên=Full name ·',
  'Giới tính=Sex · Ngày sinh=Date of birth · Nơi sinh=Place of birth · Quê quán=Place of origin · Nguyên',
  'quán=Native place · Dân tộc=Ethnicity · Quốc tịch=Nationality · Nơi thường trú=Permanent residence ·',
  'Nơi tạm trú=Temporary residence · Số định danh cá nhân=Personal identification number · Chủ hộ=Head of',
  'household · Quan hệ với chủ hộ=Relationship to head of household. Tình trạng hôn nhân: Độc thân/Đã kết',
  'hôn/Đã ly hôn/Góa=Single/Married/Divorced/Widowed. Sao kê tài khoản=Account Statement · Giấy xác nhận',
  'số dư=Balance Confirmation Letter · Sổ tiết kiệm=Savings Book · Số tài khoản=Account number · Chủ tài',
  'khoản=Account holder · Số dư đầu kỳ/cuối kỳ=Opening/Closing balance · Hợp đồng lao động=Labor Contract ·',
  'Giấy xác nhận công tác=Employment Confirmation · Quyết định bổ nhiệm=Appointment Decision · Giấy chứng',
  'nhận quyền sử dụng đất=Land Use Right Certificate · Giấy phép kinh doanh=Business Registration Certificate.',
  '',
  'NẾU đầu vào ở dạng Markdown (bảng "|...|", dòng tiêu đề "#", dòng kẻ "---"): GIỮ NGUYÊN',
  'cấu trúc Markdown đó trong bản dịch — bảng vẫn là bảng đúng số cột & thứ tự cột, chỉ dịch',
  'phần chữ trong ô. Giữ nguyên các ký hiệu trong [ngoặc vuông] (dịch nội dung bên trong).',
  '',
  'Chỉ trả về BẢN DỊCH TIẾNG ANH.',
].join('\n');

// Prompt OCR tái dựng BỐ CỤC bằng Markdown (giữ tiếng Việt, chưa dịch).
const OCR_STRUCTURE_PROMPT = [
  'Trích xuất TOÀN BỘ chữ trong ảnh, GIỮ NGUYÊN tiếng Việt (KHÔNG dịch). Tái dựng đúng BỐ CỤC',
  'bản gốc bằng Markdown để dùng làm bản dịch nộp lãnh sự:',
  '• Bảng (sao kê, bảng lương, danh sách…) → BẢNG Markdown đúng số cột & thứ tự cột, mỗi dòng 1 hàng.',
  '• Quốc hiệu / tiêu đề căn giữa → để trên đầu, mỗi phần một dòng.',
  '• Giữ ĐÚNG thứ tự khối thông tin và xuống dòng như bản gốc; KHÔNG gộp, KHÔNG sắp xếp lại.',
  '• Con dấu → [Con dấu: <nội dung đọc được>]; chữ ký tay → [Chữ ký]; ô không ký → [Không có chữ ký];',
  '  ảnh chân dung → [Ảnh]; mã QR → [QR]; vân tay → [Vân tay]; chỗ không đọc được → [không đọc được].',
  '• Số liệu, ngày tháng, tên riêng, số tài khoản: chép CHÍNH XÁC từng ký tự, KHÔNG sửa, KHÔNG bịa.',
  '',
  'Chỉ trả về nội dung trích xuất (Markdown tiếng Việt), không thêm lời giải thích.',
].join('\n');

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

async function callClaude(env, content, maxTokens = 8000, model = MODEL) {
  if (!env.ANTHROPIC_API_KEY) throw new Error('Worker chưa cấu hình ANTHROPIC_API_KEY');
  const r = await fetch(ANTHROPIC_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model,
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

    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, '');

    // ── GET /file/<key> — tải/xem file từ R2 ──
    if (request.method === 'GET' && path.startsWith('/file/')) {
      if (!env.FILES) return json({ error: 'Worker chưa bind R2 bucket (Variable name FILES)' }, 500);
      const key = decodeURIComponent(path.slice('/file/'.length));
      const obj = await env.FILES.get(key);
      if (!obj) return json({ error: 'Không tìm thấy file' }, 404);
      const headers = new Headers(CORS);
      obj.writeHttpMetadata(headers);
      headers.set('etag', obj.httpEtag);
      return new Response(obj.body, { headers });
    }

    if (request.method !== 'POST') return json({ error: 'Chỉ hỗ trợ POST' }, 405);

    // ── POST /upload?name=&type= — lưu file lên R2 (body nhị phân) ──
    if (path.endsWith('/upload')) {
      if (!env.FILES) return json({ error: 'Worker chưa bind R2 bucket (Variable name FILES)' }, 500);
      const name = url.searchParams.get('name') || 'file';
      const type = url.searchParams.get('type') || 'application/octet-stream';
      const key = crypto.randomUUID();
      await env.FILES.put(key, await request.arrayBuffer(), {
        httpMetadata: {
          contentType: type,
          contentDisposition: `inline; filename*=UTF-8''${encodeURIComponent(name)}`,
        },
        customMetadata: { name },
      });
      return json({ key, name });
    }

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
          { type: 'text', text: OCR_STRUCTURE_PROMPT },
        ], 8000, MODEL_TRANSLATE);
        return json({ text });
      }

      if (path.endsWith('/translate')) {
        if (!body.text) return json({ error: "Thiếu trường 'text'" }, 400);
        const text = await callClaude(env, [
          { type: 'text', text: VISA_TRANSLATE_PROMPT + '\n\n=== VĂN BẢN GỐC (TIẾNG VIỆT) ===\n' + body.text },
        ], 8000, MODEL_TRANSLATE);
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
