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
import { embedTexts, fetchLink, streamKbAsk, uploadFileToWorker } from '@/lib/aiWorker';

export { suggestMeta, relatedQuestions } from '@/lib/aiWorker';

export type KbKind = 'chat' | 'file' | 'link';
export type KbStatus = 'processing' | 'ready' | 'error';

/** Chủ đề lớn để phân loại nguồn (khớp KB_CATEGORIES trong worker /kb/suggest). */
export const KB_CATEGORIES = [
  'Điểm đến',
  'Quy trình tour',
  'Xử lý sự cố',
  'NCC/Đối tác',
  'Visa',
  'Bán hàng',
  'Khác',
] as const;

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
  category: string | null;
  tags: string[];
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
  category?: string | null;
  tags?: string[];
}

/**
 * Nạp một nguồn vào kho: tạo kb_sources (processing) → embedding các khối → lưu
 * kb_chunks → đánh dấu ready. Lỗi giữa chừng → đánh dấu source 'error' (không để rác
 * dở dang; chunk đã chèn sẽ bị dọn khi xoá nguồn nhờ on delete cascade).
 */
export async function ingestText(params: IngestParams): Promise<KbSource> {
  const {
    title, text, createdBy,
    kind = 'chat', rawRef = null, department = null, category = null, tags = [],
  } = params;
  const parts = chunkText(text);
  if (!parts.length) throw new Error('Nội dung rỗng — không có gì để lưu.');

  const { data: src, error: e1 } = await sb
    .from('kb_sources')
    .insert({
      title, kind, raw_ref: rawRef, department, category, tags,
      created_by: createdBy, status: 'processing',
    })
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

export interface IngestFileParams {
  file: File;
  createdBy: string;
  title?: string;
  department?: string | null;
  category?: string | null;
  tags?: string[];
  onProgress?: (msg: string) => void;
}

/**
 * Nạp một FILE: trích text (ảnh→OCR, PDF/Word/Excel/text qua docExtract) → tải bản gốc
 * lên R2 (raw_ref = key để xem lại) → ingestText kind='file'. Lưu bản gốc thất bại
 * không chặn việc nạp text. Tiêu đề mặc định = tên file.
 */
export async function ingestFile(params: IngestFileParams): Promise<KbSource> {
  const { file, createdBy, department = null, category = null, tags = [], onProgress = () => {} } = params;
  onProgress('Đang trích nội dung…');
  // Dynamic import: tránh kéo pdfjs/mammoth (nặng) vào mọi consumer của knowledge.ts.
  const { extractFile } = await import('@/lib/docExtract');
  const text = (await extractFile(file, onProgress)).trim();
  if (!text) throw new Error('Không trích được nội dung từ file này.');

  onProgress('Đang lưu bản gốc…');
  let rawRef: string | null = null;
  try {
    rawRef = (await uploadFileToWorker(file)).key;
  } catch {
    rawRef = null;
  }

  onProgress('Đang tạo embedding & lưu kho…');
  return ingestText({
    title: params.title?.trim() || file.name,
    text,
    createdBy,
    kind: 'file',
    rawRef,
    department,
    category,
    tags,
  });
}

export interface IngestLinkParams {
  url: string;
  createdBy: string;
  title?: string;
  department?: string | null;
  category?: string | null;
  tags?: string[];
}

/** Nạp một LINK: worker tải trang + lọc HTML → ingestText kind='link', raw_ref=url. */
export async function ingestLink(params: IngestLinkParams): Promise<KbSource> {
  const { url, createdBy, department = null, category = null, tags = [] } = params;
  const { title, text } = await fetchLink(url.trim());
  if (!text.trim()) throw new Error('Trang không có nội dung đọc được.');
  return ingestText({
    title: params.title?.trim() || title || url,
    text,
    createdBy,
    kind: 'link',
    rawRef: url.trim(),
    department,
    category,
    tags,
  });
}

export interface SimilarSource {
  sourceId: string;
  title: string;
  similarity: number;
}

/**
 * Tìm các nguồn ĐÃ CÓ gần giống nội dung sắp nạp (cảnh báo trùng/mâu thuẫn). Lấy đoạn
 * đầu làm đại diện, embed rồi kb_search; trả các nguồn duy nhất có similarity ≥ threshold.
 */
export async function findSimilarSources(text: string, threshold = 0.82, k = 5): Promise<SimilarSource[]> {
  const sample = text.trim().slice(0, 1500);
  if (!sample) return [];
  const [vec] = await embedTexts([sample], 'query');
  const { data, error } = await sb.rpc('kb_search', { query_embedding: vec, match_count: k });
  if (error) return [];
  const hits = (data ?? []) as KbSearchHit[];
  const seen = new Set<string>();
  const out: SimilarSource[] = [];
  for (const h of hits) {
    if (h.similarity < threshold || seen.has(h.source_id)) continue;
    seen.add(h.source_id);
    out.push({ sourceId: h.source_id, title: h.title, similarity: h.similarity });
  }
  return out;
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

// ── Đợt 3: gợi ý câu hỏi (log + FAQ) + trích dẫn bấm-mở ──

export interface QuestionLog {
  question: string;
  askedBy?: string | null;
  department?: string | null;
  sourceCount?: number;
}

/** Ghi log câu hỏi (để gợi ý/FAQ). Lỗi không chặn trải nghiệm hỏi đáp. */
export async function logQuestion(p: QuestionLog): Promise<void> {
  const q = p.question.trim();
  if (!q) return;
  try {
    await sb.from('kb_questions').insert({
      question: q,
      asked_by: p.askedBy ?? null,
      department: p.department ?? null,
      source_count: p.sourceCount ?? 0,
    });
  } catch {
    /* im lặng */
  }
}

/** Câu hỏi hay gặp nhất (gộp trùng) — cho khối FAQ. */
export async function topQuestions(k = 6): Promise<string[]> {
  const { data, error } = await sb.rpc('kb_top_questions', { match_count: k });
  if (error) return [];
  return ((data ?? []) as { question: string }[]).map((r) => r.question).filter(Boolean);
}

/** Câu hỏi gần đây (đã khử trùng) — cho gợi ý gõ (type-ahead). */
export async function recentQuestions(k = 50): Promise<string[]> {
  const { data, error } = await sb
    .from('kb_questions')
    .select('question')
    .order('created_at', { ascending: false })
    .limit(k * 3);
  if (error) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const r of (data ?? []) as { question: string }[]) {
    const q = (r.question || '').trim();
    const key = q.toLowerCase();
    if (!q || seen.has(key)) continue;
    seen.add(key);
    out.push(q);
    if (out.length >= k) break;
  }
  return out;
}

export interface KbChunkRow {
  id: string;
  chunk_index: number;
  content: string;
}

/** Lấy toàn bộ khối nội dung của một nguồn (cho hộp thoại xem chi tiết / trích dẫn). */
export async function getSourceChunks(sourceId: string): Promise<KbChunkRow[]> {
  const { data, error } = await sb
    .from('kb_chunks')
    .select('id, chunk_index, content')
    .eq('source_id', sourceId)
    .order('chunk_index', { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as KbChunkRow[];
}

// ── Đợt 4: phản hồi đáp án · quản lý nguồn · độ tươi ──

export type FeedbackKind = 'up' | 'down' | 'missing';

export interface FeedbackInput {
  question: string;
  answer: string;
  sourceIds: string[];
  kind: FeedbackKind;
  note?: string;
  createdBy?: string | null;
}

/** Ghi phản hồi đáp án (👍/👎/báo thiếu). Lỗi không chặn UX. */
export async function logFeedback(p: FeedbackInput): Promise<void> {
  try {
    await sb.from('kb_feedback').insert({
      question: p.question,
      answer: p.answer,
      source_ids: p.sourceIds,
      kind: p.kind,
      note: p.note ?? null,
      created_by: p.createdBy ?? null,
    });
  } catch {
    /* im lặng */
  }
}

export interface SourceMetaPatch {
  title?: string;
  category?: string | null;
  tags?: string[];
  department?: string | null;
}

/** Cập nhật metadata nguồn (tiêu đề/chủ đề/thẻ/phạm vi) — KHÔNG đụng embedding. */
export async function updateSourceMeta(id: string, patch: SourceMetaPatch): Promise<void> {
  const row: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.title !== undefined) row.title = patch.title;
  if (patch.category !== undefined) row.category = patch.category;
  if (patch.tags !== undefined) row.tags = patch.tags;
  if (patch.department !== undefined) row.department = patch.department;
  const { error } = await sb.from('kb_sources').update(row).eq('id', id);
  if (error) throw new Error(error.message);
}

/** Tạo lại embedding cho mọi khối của một nguồn (vd khi đổi model/chiều vector). */
export async function reEmbedSource(id: string, onProgress: (msg: string) => void = () => {}): Promise<void> {
  onProgress('Đang tải nội dung…');
  const chunks = await getSourceChunks(id);
  if (!chunks.length) throw new Error('Nguồn không có nội dung để tạo lại embedding.');
  onProgress('Đang tạo embedding…');
  const vecs = await embedInBatches(chunks.map((c) => c.content));
  for (let i = 0; i < chunks.length; i += 1) {
    const { error } = await sb.from('kb_chunks').update({ embedding: vecs[i] }).eq('id', chunks[i].id);
    if (error) throw new Error(error.message);
  }
  await sb.from('kb_sources').update({ updated_at: new Date().toISOString() }).eq('id', id);
}

export const STALE_MONTHS = 12;

/** Nguồn "cũ" nếu lần cập nhật gần nhất quá `months` tháng — để cảnh báo độ tươi. */
export function isStale(iso: string, months = STALE_MONTHS): boolean {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return false;
  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - months);
  return d < cutoff;
}
