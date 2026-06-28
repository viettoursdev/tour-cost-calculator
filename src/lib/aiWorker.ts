/**
 * Cloudflare Worker proxy for Claude + Google Maps.
 * Source: public/legacy.html:6603-6613.
 *
 * The worker URL is configured by the user in localStorage. The worker holds the
 * upstream API keys (ANTHROPIC_API_KEY, GOOGLE_MAPS_API_KEY) so the client only
 * needs the worker URL.
 */

const LS_KEY = 'vte_ai_worker';

/**
 * Header xác thực gửi kèm mọi lời gọi Worker: Supabase access token.
 * Worker (sau khi redeploy bản có auth) sẽ verify token + domain @viettours
 * trước khi gọi Anthropic / ghi R2 — chặn lạm dụng API key & file từ bên ngoài.
 * Worker CŨ (chưa auth) bỏ qua header này nên không ảnh hưởng.
 */
async function authHeaders(): Promise<Record<string, string>> {
  try {
    const { authBackend } = await import('@/auth/backend'); // lazy — tránh khởi tạo IdP khi import module
    const token = await authBackend.getAccessToken();
    return token ? { Authorization: `Bearer ${token}` } : {};
  } catch {
    return {};
  }
}

// Test seam.
export const __getAuthHeadersForTest = authHeaders;

/**
 * Default deployed Cloudflare Worker (holds upstream keys + R2 bucket).
 * Used when the user hasn't set a custom URL via ⚙️ AI, so file upload and
 * translation work out of the box.
 */
export const DEFAULT_AI_WORKER = 'https://tour-cost-calculator.developer-9f9.workers.dev';

export function getAIWorker(): string {
  try {
    return localStorage.getItem(LS_KEY) || DEFAULT_AI_WORKER;
  } catch {
    return DEFAULT_AI_WORKER;
  }
}

export function setAIWorker(url: string): void {
  try {
    localStorage.setItem(LS_KEY, url);
  } catch {
    /* ignore */
  }
}

/**
 * Marker đứng đầu system prompt cho các tác vụ TRÍCH XUẤT có cấu trúc
 * (text/ảnh → JSON theo schema cố định: danh thiếp, báo giá, chuyến bay…).
 * Worker dùng marker này để CHO QUA cổng chủ đề (`/chat`): đây không phải hội
 * thoại tự do nên không bị coi là "LLM vạn năng". Trợ lý ảo KHÔNG gắn marker →
 * vẫn bị cổng chủ đề kiểm soát như cũ. PHẢI khớp hằng `EXTRACT_MARKER` trong
 * `cloudflare-worker/viettours-ai-worker.js`.
 */
export const EXTRACT_MARKER = '[VTE:EXTRACT]';
export const markExtract = (system: string): string => `${EXTRACT_MARKER} ${system}`;

// ── Trợ lý ảo (Anthropic Messages, tool-use) ──
export interface Citation { type?: string; url?: string; title?: string; cited_text?: string }
export interface ContentBlock {
  type: string;
  text?: string;
  id?: string;
  name?: string;
  input?: Record<string, unknown>;
  tool_use_id?: string;
  content?: unknown;
  citations?: Citation[];
  [k: string]: unknown;
}
export interface ChatMessage { role: 'user' | 'assistant'; content: string | ContentBlock[] }

export interface AIWorkerBody {
  prompt?: string;
  origin?: string;
  destination?: string;
  mode?: 'driving' | 'walking' | 'bicycling' | 'transit';
  image?: string; // base64 (no data URL prefix) — for /ocr
  text?: string;  // VI source text — for /translate
  // /chat
  system?: string;
  messages?: ChatMessage[];
  tools?: unknown[];
  web?: boolean;
  stream?: boolean;
  // /kb/embed
  texts?: string[];
  input_type?: 'document' | 'query';
  // /kb/ask
  question?: string;
  chunks?: { title?: string; content?: string }[];
  // /kb/fetch
  url?: string;
  // /kb/related
  answer?: string;
}

export interface AIWorkerResponse {
  text?: string;
  distance?: string;
  duration?: string;
  error?: string;
  // /chat — message của Claude
  content?: ContentBlock[];
  stop_reason?: string;
  usage?: Record<string, unknown>;
  // /kb/embed
  embeddings?: number[][];
  // /kb/fetch
  title?: string;
  // /kb/suggest
  category?: string;
  tags?: string[];
  // /kb/related
  questions?: string[];
}

export type AIWorkerPath =
  | '/ai' | '/distance' | '/ocr' | '/translate' | '/chat'
  | '/kb/embed' | '/kb/ask' | '/kb/fetch' | '/kb/suggest' | '/kb/related';

/**
 * Upload a file to R2 via the worker `/upload`. Returns the stored { key, name }.
 * `onProgress(pct)` (0–100) báo tiến trình tải lên (dùng XHR để có upload progress).
 */
export async function uploadFileToWorker(
  file: File,
  onProgress?: (pct: number) => void,
): Promise<{ key: string; name: string }> {
  const base = getAIWorker();
  if (!base) throw new Error('Chưa cấu hình AI Worker URL (bấm ⚙️ AI để nhập)');
  const url =
    base.replace(/\/+$/, '') +
    `/upload?name=${encodeURIComponent(file.name)}&type=${encodeURIComponent(file.type || 'application/octet-stream')}`;
  const headers = await authHeaders();

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', url);
    for (const [k, v] of Object.entries(headers)) xhr.setRequestHeader(k, v);
    if (onProgress) {
      onProgress(0);
      xhr.upload.onprogress = (e) => { if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100)); };
    }
    xhr.onload = () => {
      let d: { key?: string; name?: string; error?: string } = {};
      try { d = JSON.parse(xhr.responseText || '{}'); } catch { /* ignore */ }
      if (xhr.status < 200 || xhr.status >= 300 || d.error) { reject(new Error(d.error || 'Upload lỗi ' + xhr.status)); return; }
      if (!d.key) { reject(new Error('Worker không trả về key')); return; }
      resolve({ key: d.key, name: d.name || file.name });
    };
    xhr.onerror = () => reject(new Error('Lỗi mạng khi tải file (worker không phản hồi / chặn CORS — kiểm tra worker đã deploy chưa)'));
    // Tránh treo im lặng nếu worker không phản hồi (vd bản worker cũ chưa xử lý CORS preflight).
    xhr.timeout = 120000;
    xhr.ontimeout = () => reject(new Error('Hết thời gian tải file — worker không phản hồi'));
    xhr.send(file);
  });
}

/** Public URL to view/download a file stored on R2 via the worker `/file/<key>`. */
export function workerFileUrl(key: string): string {
  return getAIWorker().replace(/\/+$/, '') + '/file/' + encodeURIComponent(key);
}

/**
 * Gọi `/chat` ở chế độ STREAMING (SSE). Đọc luồng sự kiện của Anthropic, dựng lại
 * message đầy đủ (content blocks gồm text/tool_use, stop_reason, usage) để vòng lặp
 * tool-use chạy như cũ, đồng thời gọi `onText(delta)` để hiện chữ dần.
 *
 * Tương thích ngược: nếu worker CHƯA hỗ trợ stream (trả JSON thường), tự fallback —
 * phát toàn bộ text một lần rồi trả message như `callAIWorker('/chat')`.
 */
export async function streamAIChat(
  body: AIWorkerBody,
  onText?: (delta: string) => void,
): Promise<AIWorkerResponse> {
  const url = getAIWorker();
  if (!url) throw new Error('Chưa cấu hình AI Worker URL (bấm ⚙️ AI để nhập)');
  const r = await fetch(url.replace(/\/+$/, '') + '/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
    body: JSON.stringify({ ...body, stream: true }),
  });

  const ctype = r.headers.get('content-type') || '';
  // Worker cũ / lỗi → JSON thường. Đọc, ném lỗi nếu có, fallback phát text 1 lần.
  if (!r.body || !ctype.includes('text/event-stream')) {
    const d = (await r.json().catch(() => ({}))) as AIWorkerResponse;
    if (!r.ok || d.error) throw new Error(d.error || `Worker lỗi ${r.status}`);
    const txt = (d.content ?? []).filter((b) => b.type === 'text').map((b) => b.text ?? '').join('\n').trim();
    if (txt && onText) onText(txt);
    return d;
  }

  const blocks: ContentBlock[] = [];
  const jsonBuf: Record<number, string> = {};
  let stopReason: string | undefined;
  let usage: Record<string, unknown> | undefined;

  const handle = (evt: Record<string, unknown>) => {
    const t = evt.type;
    if (t === 'message_start') {
      usage = (evt.message as { usage?: Record<string, unknown> })?.usage;
    } else if (t === 'content_block_start') {
      const i = evt.index as number;
      blocks[i] = { ...(evt.content_block as ContentBlock) };
      if (blocks[i].type === 'tool_use') jsonBuf[i] = '';
    } else if (t === 'content_block_delta') {
      const i = evt.index as number;
      const d = evt.delta as Record<string, unknown>;
      const b = blocks[i]; if (!b) return;
      if (d.type === 'text_delta') { b.text = (b.text ?? '') + (d.text as string); onText?.(d.text as string); }
      else if (d.type === 'input_json_delta') { jsonBuf[i] = (jsonBuf[i] ?? '') + (d.partial_json as string); }
      else if (d.type === 'thinking_delta') { b.thinking = ((b.thinking as string) ?? '') + (d.thinking as string); }
      else if (d.type === 'citations_delta') { (b.citations ??= []).push(d.citation as Citation); }
    } else if (t === 'content_block_stop') {
      const i = evt.index as number;
      const b = blocks[i];
      if (b && b.type === 'tool_use') { try { b.input = JSON.parse(jsonBuf[i] || '{}'); } catch { b.input = {}; } }
    } else if (t === 'message_delta') {
      const d = evt.delta as { stop_reason?: string } | undefined;
      if (d?.stop_reason) stopReason = d.stop_reason;
      if (evt.usage) usage = { ...usage, ...(evt.usage as Record<string, unknown>) };
    } else if (t === 'error') {
      throw new Error((evt.error as { message?: string })?.message || 'Lỗi luồng AI');
    }
  };

  const reader = r.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let nl: number;
    while ((nl = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (!line.startsWith('data:')) continue;
      const payload = line.slice(5).trim();
      if (!payload || payload === '[DONE]') continue;
      let evt: Record<string, unknown>;
      try { evt = JSON.parse(payload); } catch { continue; }
      handle(evt);
    }
  }

  return { content: blocks.filter(Boolean), stop_reason: stopReason, usage };
}

export async function callAIWorker(
  path: AIWorkerPath,
  body: AIWorkerBody,
): Promise<AIWorkerResponse> {
  const url = getAIWorker();
  if (!url) {
    throw new Error('Chưa cấu hình AI Worker URL (bấm ⚙️ AI để nhập)');
  }
  const r = await fetch(url.replace(/\/+$/, '') + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
    body: JSON.stringify(body),
  });
  // Đọc body trước để giữ lại thông báo lỗi thật từ worker (vd "Request not allowed"),
  // thay vì chỉ báo mã HTTP chung chung.
  const d = (await r.json().catch(() => ({}))) as AIWorkerResponse;
  if (!r.ok || d.error) {
    const raw = d.error || `Worker lỗi ${r.status}`;
    // "Request not allowed" là lỗi 403 Anthropic trả về khi API key của worker sai
    // (thường do dùng Admin key thay vì key chuẩn, hoặc workspace không có quyền model).
    if (/request not allowed|unauthorized|invalid x-api-key|authentication_error/i.test(raw)) {
      throw new Error(
        'AI Worker không gọi được Claude — Anthropic từ chối API key ("' + raw + '"). '
        + 'Kiểm tra biến ANTHROPIC_API_KEY của Cloudflare Worker: phải là API key CHUẨN '
        + '(sk-ant-api…), KHÔNG phải Admin key (sk-ant-admin…), và workspace có quyền dùng model. '
        + 'Hướng dẫn: cloudflare-worker/README.md.',
      );
    }
    throw new Error(raw);
  }
  return d;
}

// ── Thư viện Viettours (kho kiến thức RAG) ──

/** Tạo embedding cho các đoạn text qua Workers AI bge-m3 (worker `/kb/embed`). */
export async function embedTexts(
  texts: string[],
  inputType: 'document' | 'query' = 'document',
): Promise<number[][]> {
  const d = await callAIWorker('/kb/embed', { texts, input_type: inputType });
  if (!Array.isArray(d.embeddings)) throw new Error('Worker không trả về embeddings');
  return d.embeddings;
}

/** Tải 1 URL qua worker `/kb/fetch`, trả tiêu đề + văn bản đã lọc HTML. */
export async function fetchLink(url: string): Promise<{ title: string; text: string }> {
  const d = await callAIWorker('/kb/fetch', { url });
  return { title: d.title ?? url, text: d.text ?? '' };
}

/** Gợi ý chủ đề + thẻ cho một mẩu kiến thức qua worker `/kb/suggest`. */
export async function suggestMeta(text: string): Promise<{ category: string; tags: string[] }> {
  const d = await callAIWorker('/kb/suggest', { text });
  return { category: d.category ?? '', tags: Array.isArray(d.tags) ? d.tags : [] };
}

/** Gợi ý 3 câu hỏi tiếp theo sau một đáp án qua worker `/kb/related`. */
export async function relatedQuestions(question: string, answer: string): Promise<string[]> {
  const d = await callAIWorker('/kb/related', { question, answer });
  return Array.isArray(d.questions) ? d.questions : [];
}

/**
 * Gọi `/kb/ask` ở chế độ STREAMING — trả lời câu hỏi dựa trên các khối ngữ cảnh đã
 * truy hồi, hiện chữ dần qua `onText(delta)`. Trả về toàn văn câu trả lời.
 * Fallback: worker cũ/lỗi trả JSON → phát text một lần.
 */
export async function streamKbAsk(
  question: string,
  chunks: { title?: string; content?: string }[],
  onText?: (delta: string) => void,
): Promise<string> {
  const url = getAIWorker();
  if (!url) throw new Error('Chưa cấu hình AI Worker URL (bấm ⚙️ AI để nhập)');
  const r = await fetch(url.replace(/\/+$/, '') + '/kb/ask', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
    body: JSON.stringify({ question, chunks, stream: true }),
  });

  const ctype = r.headers.get('content-type') || '';
  if (!r.body || !ctype.includes('text/event-stream')) {
    const d = (await r.json().catch(() => ({}))) as AIWorkerResponse;
    if (!r.ok || d.error) throw new Error(d.error || `Worker lỗi ${r.status}`);
    const txt = (d.text ?? '').trim();
    if (txt && onText) onText(txt);
    return txt;
  }

  let answer = '';
  const reader = r.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let nl: number;
    while ((nl = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (!line.startsWith('data:')) continue;
      const payload = line.slice(5).trim();
      if (!payload || payload === '[DONE]') continue;
      let evt: Record<string, unknown>;
      try { evt = JSON.parse(payload); } catch { continue; }
      if (evt.type === 'content_block_delta') {
        const d = evt.delta as Record<string, unknown>;
        if (d?.type === 'text_delta') { answer += d.text as string; onText?.(d.text as string); }
      } else if (evt.type === 'error') {
        throw new Error((evt.error as { message?: string })?.message || 'Lỗi luồng AI');
      }
    }
  }
  return answer.trim();
}
