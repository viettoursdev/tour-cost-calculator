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
 * Header xác thực gửi kèm mọi lời gọi Worker: Firebase ID token của người đang đăng
 * nhập. Worker (sau khi redeploy bản có auth) sẽ verify token + domain @viettours
 * trước khi gọi Anthropic / ghi R2 — chặn lạm dụng API key & file từ bên ngoài.
 * Worker CŨ (chưa auth) bỏ qua header này nên không ảnh hưởng.
 */
async function authHeaders(): Promise<Record<string, string>> {
  try {
    const { auth } = await import('@/lib/firebase'); // lazy — tránh khởi tạo Firebase khi import module
    const token = await auth.currentUser?.getIdToken();
    return token ? { Authorization: `Bearer ${token}` } : {};
  } catch {
    return {};
  }
}

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
}

export type AIWorkerPath = '/ai' | '/distance' | '/ocr' | '/translate' | '/chat';

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
    xhr.onerror = () => reject(new Error('Lỗi mạng khi tải file'));
    xhr.ontimeout = () => reject(new Error('Hết thời gian tải file'));
    xhr.send(file);
  });
}

/** Public URL to view/download a file stored on R2 via the worker `/file/<key>`. */
export function workerFileUrl(key: string): string {
  return getAIWorker().replace(/\/+$/, '') + '/file/' + encodeURIComponent(key);
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
