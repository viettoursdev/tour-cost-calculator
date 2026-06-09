/**
 * Cloudflare Worker proxy for Claude + Google Maps.
 * Source: public/legacy.html:6603-6613.
 *
 * The worker URL is configured by the user in localStorage. The worker holds the
 * upstream API keys (ANTHROPIC_API_KEY, GOOGLE_MAPS_API_KEY) so the client only
 * needs the worker URL.
 */

const LS_KEY = 'vte_ai_worker';

export function getAIWorker(): string {
  try {
    return localStorage.getItem(LS_KEY) || '';
  } catch {
    return '';
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
}

export interface AIWorkerResponse {
  text?: string;
  distance?: string;
  duration?: string;
  error?: string;
}

export async function callAIWorker(
  path: '/ai' | '/distance',
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
