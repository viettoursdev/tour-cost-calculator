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

export interface AIWorkerBody {
  prompt?: string;
  origin?: string;
  destination?: string;
  mode?: 'driving' | 'walking' | 'bicycling' | 'transit';
  image?: string; // base64 (no data URL prefix) — for /ocr
  text?: string;  // VI source text — for /translate
}

export interface AIWorkerResponse {
  text?: string;
  distance?: string;
  duration?: string;
  error?: string;
}

export type AIWorkerPath = '/ai' | '/distance' | '/ocr' | '/translate';

/** Upload a file to R2 via the worker `/upload`. Returns the stored { key, name }. */
export async function uploadFileToWorker(file: File): Promise<{ key: string; name: string }> {
  const base = getAIWorker();
  if (!base) throw new Error('Chưa cấu hình AI Worker URL (bấm ⚙️ AI để nhập)');
  const url =
    base.replace(/\/+$/, '') +
    `/upload?name=${encodeURIComponent(file.name)}&type=${encodeURIComponent(file.type || 'application/octet-stream')}`;
  const r = await fetch(url, { method: 'POST', body: file });
  const d = (await r.json().catch(() => ({}))) as { key?: string; name?: string; error?: string };
  if (!r.ok || d.error) throw new Error(d.error || 'Upload lỗi ' + r.status);
  if (!d.key) throw new Error('Worker không trả về key');
  return { key: d.key, name: d.name || file.name };
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
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error('Worker lỗi ' + r.status);
  const d = (await r.json()) as AIWorkerResponse;
  if (d.error) throw new Error(d.error);
  return d;
}
