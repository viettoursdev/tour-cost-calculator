/**
 * Thư viện Viettours — kho kiến thức nội bộ (RAG), tầng dữ liệu + điều phối.
 *
 * Luồng NẠP:   text → chunkText() → embedTexts() (Voyage) → lưu kb_sources/kb_chunks.
 * Luồng HỎI:   câu hỏi → embedTexts(query) → RPC kb_search (RLS áp quyền) →
 *              streamKbAsk() (Claude trả lời có trích dẫn, hiện chữ dần).
 *
 * Embedding & trả lời đi qua Cloudflare Worker (giữ VOYAGE_API_KEY + ANTHROPIC_API_KEY);
 * truy hồi qua Supabase với JWT của người dùng nên RLS tự lọc theo quyền (xem 0067).
 */
import { sb } from '@/lib/supabase';
import { embedTexts, streamKbAsk } from '@/lib/aiWorker';

export type KbKind = 'chat' | 'file' | 'link';
export type KbStatus = 'processing' | 'ready' | 'error';

export interface KbSource {
  id: string;
  title: string;
  kind: KbKind;
  raw_ref: string | null;
  department: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  status: KbStatus;
}

export interface KbSearchHit {
  chunk_id: string;
  source_id: string;
  title: string;
  kind: KbKind;
  content: string;
  source_updated_at: string;
  similarity: number;
}

const MAX_WORDS = 400;
const OVERLAP_WORDS = 60;
const EMBED_BATCH = 96; // < 128 (giới hạn worker /kb/embed)

/**
 * Chia văn bản thành các khối ~400 từ, gối nhau ~60 từ, ưu tiên cắt theo đoạn.
 * Đoạn quá dài bị cắt theo cửa sổ từ. Khối gối nhau giúp không mất ngữ cảnh ở mép.
 */
export function chunkText(text: string, maxWords = MAX_WORDS, overlap = OVERLAP_WORDS): string[] {
  const clean = text.replace(/\r\n/g, '\n').trim();
  if (!clean) return [];
  const paras = clean
    .split(/\n\s*\n/)
    .map((p) => p.replace(/[ \t]+/g, ' ').trim())
    .filter(Boolean);

  // Bung đoạn quá dài thành các mảnh cửa sổ từ (mỗi mảnh ≤ maxWords).
  const units: string[] = [];
  for (const p of paras) {
    const w = p.split(' ');
    if (w.length <= maxWords) {
      units.push(p);
    } else {
      for (let i = 0; i < w.length; i += maxWords - overlap) units.push(w.slice(i, i + maxWords).join(' '));
    }
  }

  // Gói các đoạn liên tiếp đến ~maxWords; mỗi khối mới mở đầu bằng phần gối của khối trước.
  const chunks: string[] = [];
  let cur = '';
  let curWords = 0;
  for (const u of units) {
    const uWords = u.split(' ').length;
    if (curWords && curWords + uWords > maxWords) {
      chunks.push(cur);
      const tail = cur.split(/\s+/).slice(-overlap).join(' ');
      cur = `${tail}\n${u}`;
      curWords = tail.split(' ').length + uWords;
    } else {
      cur = cur ? `${cur}\n${u}` : u;
      curWords += uWords;
    }
  }
  if (cur.trim()) chunks.push(cur.trim());
  return chunks;
}

async function embedInBatches(texts: string[]): Promise<number[][]> {
  const out: number[][] = [];
  for (let i = 0; i < texts.length; i += EMBED_BATCH) {
    const batch = texts.slice(i, i + EMBED_BATCH);
    const vecs = await embedTexts(batch, 'document');
    out.push(...vecs);
  }
  return out;
}

export interface IngestParams {
  title: string;
  text: string;
  createdBy: string;
  kind?: KbKind;
  rawRef?: string | null;
  department?: string | null;
}

/**
 * Nạp một nguồn vào kho: tạo kb_sources (processing) → embedding các khối → lưu
 * kb_chunks → đánh dấu ready. Lỗi giữa chừng → đánh dấu source 'error' (không để rác
 * dở dang; chunk đã chèn sẽ bị dọn khi xoá nguồn nhờ on delete cascade).
 */
export async function ingestText(params: IngestParams): Promise<KbSource> {
  const { title, text, createdBy, kind = 'chat', rawRef = null, department = null } = params;
  const parts = chunkText(text);
  if (!parts.length) throw new Error('Nội dung rỗng — không có gì để lưu.');

  const { data: src, error: e1 } = await sb
    .from('kb_sources')
    .insert({ title, kind, raw_ref: rawRef, department, created_by: createdBy, status: 'processing' })
    .select()
    .single();
  if (e1 || !src) throw new Error(e1?.message || 'Không tạo được nguồn');

  try {
    const embeddings = await embedInBatches(parts);
    const rows = parts.map((content, i) => ({
      source_id: (src as KbSource).id,
      chunk_index: i,
      content,
      embedding: embeddings[i],
    }));
    const { error: e2 } = await sb.from('kb_chunks').insert(rows);
    if (e2) throw new Error(e2.message);

    const { error: e3 } = await sb
      .from('kb_sources')
      .update({ status: 'ready', updated_at: new Date().toISOString() })
      .eq('id', (src as KbSource).id);
    if (e3) throw new Error(e3.message);

    return { ...(src as KbSource), status: 'ready' };
  } catch (err) {
    await sb.from('kb_sources').update({ status: 'error' }).eq('id', (src as KbSource).id);
    throw err;
  }
}

/** Truy hồi top-K khối gần câu hỏi nhất (ngữ nghĩa). RLS lọc theo quyền người gọi. */
export async function searchKnowledge(question: string, k = 6): Promise<KbSearchHit[]> {
  const [vec] = await embedTexts([question], 'query');
  const { data, error } = await sb.rpc('kb_search', { query_embedding: vec, match_count: k });
  if (error) throw new Error(error.message);
  return (data ?? []) as KbSearchHit[];
}

export async function listSources(): Promise<KbSource[]> {
  const { data, error } = await sb.from('kb_sources').select('*').order('updated_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as KbSource[];
}

export async function deleteSource(id: string): Promise<void> {
  const { error } = await sb.from('kb_sources').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

export interface AskResult {
  answer: string;
  hits: KbSearchHit[];
  /** Các nguồn duy nhất được trích (gộp theo source_id, giữ thứ tự liên quan). */
  sources: { id: string; title: string; kind: KbKind; updatedAt: string }[];
}

/**
 * Hỏi thư viện: truy hồi ngữ cảnh rồi để Claude trả lời có trích dẫn (stream qua onText).
 * Trả về cả câu trả lời lẫn danh sách nguồn để UI hiện trích dẫn bấm-mở.
 */
export async function askKnowledge(
  question: string,
  onText?: (delta: string) => void,
  k = 6,
): Promise<AskResult> {
  const hits = await searchKnowledge(question, k);
  const chunks = hits.map((h) => ({ title: h.title, content: h.content }));
  const answer = await streamKbAsk(question, chunks, onText);

  const seen = new Set<string>();
  const sources: AskResult['sources'] = [];
  for (const h of hits) {
    if (seen.has(h.source_id)) continue;
    seen.add(h.source_id);
    sources.push({ id: h.source_id, title: h.title, kind: h.kind, updatedAt: h.source_updated_at });
  }
  return { answer, hits, sources };
}
