/**
 * Dịch file .docx "tại chỗ" — giữ NGUYÊN bố cục (bảng, định dạng, header/footer)
 * bằng cách chỉ thay nội dung chữ trong từng <w:t>, không dựng lại file.
 *
 * Cách map kết quả: dịch theo lô các đoạn (ngăn bằng dòng trống). Nếu số đoạn
 * dịch ra khớp số đoạn gốc → map 1:1; nếu lệch → dịch lại từng đoạn riêng (đảm
 * bảo đúng map, chậm hơn chút).
 */
import JSZip from 'jszip';

export type TranslateFn = (vnText: string) => Promise<string>;

const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const MAX_CHUNK = 3000;

/** Các phần XML có chứa chữ thân bài / header / footer. */
function textParts(zip: JSZip): string[] {
  return Object.keys(zip.files).filter(
    (n) => n === 'word/document.xml' || /^word\/(header|footer)\d*\.xml$/.test(n),
  );
}

/** Đưa cả bản dịch vào <w:t> đầu, xoá phần còn lại; giữ khoảng trắng. */
function writeBack(tNodes: Element[], text: string): void {
  if (!tNodes.length) return;
  tNodes[0].setAttribute('xml:space', 'preserve');
  tNodes[0].textContent = text;
  for (let i = 1; i < tNodes.length; i += 1) tNodes[i].textContent = '';
}

/** Dịch danh sách đoạn, giữ đúng số phần tử (có fallback từng đoạn). */
async function translateParagraphs(
  paras: string[],
  translate: TranslateFn,
  onProgress: (m: string) => void,
): Promise<string[]> {
  const out: string[] = new Array(paras.length).fill('');
  let i = 0;
  let done = 0;
  while (i < paras.length) {
    const idxs: number[] = [];
    let len = 0;
    while (i < paras.length && (idxs.length === 0 || len + paras[i].length + 2 <= MAX_CHUNK)) {
      idxs.push(i); len += paras[i].length + 2; i += 1;
    }
    onProgress(`Dịch giữ layout: ${Math.min(done + idxs.length, paras.length)}/${paras.length} đoạn…`);
    const src = idxs.map((k) => paras[k]).join('\n\n');
    const blocks = (await translate(src)).trim().split(/\n{2,}/).map((s) => s.trim()).filter(Boolean);
    if (blocks.length === idxs.length) {
      idxs.forEach((k, j) => { out[k] = blocks[j]; });
    } else {
      // Lệch số đoạn → dịch riêng từng đoạn để map chắc chắn.
      for (const k of idxs) out[k] = (await translate(paras[k])).trim();
    }
    done += idxs.length;
  }
  return out;
}

/**
 * Dịch .docx giữ layout. Trả về Blob .docx mới (chỉ tiếng Anh, bố cục như gốc).
 */
export async function translateDocxInPlace(
  file: File,
  translate: TranslateFn,
  onProgress: (m: string) => void = () => {},
): Promise<Blob> {
  const zip = await JSZip.loadAsync(await file.arrayBuffer());
  const parser = new DOMParser();
  const serializer = new XMLSerializer();

  for (const name of textParts(zip)) {
    const f = zip.file(name);
    if (!f) continue;
    const xml = await f.async('string');
    const dom = parser.parseFromString(xml, 'application/xml');

    // Mỗi <w:p> (kể cả trong ô bảng) là một đoạn; gom chữ từ các <w:t> của nó.
    const ps = Array.from(dom.getElementsByTagName('w:p'));
    const items = ps.map((p) => {
      const tNodes = Array.from(p.getElementsByTagName('w:t'));
      return { tNodes, text: tNodes.map((n) => n.textContent ?? '').join('') };
    });
    const nonEmpty = items.filter((it) => it.text.trim().length > 0);
    if (!nonEmpty.length) continue;

    const translations = await translateParagraphs(nonEmpty.map((it) => it.text), translate, onProgress);
    nonEmpty.forEach((it, idx) => writeBack(it.tNodes, translations[idx] || it.text));

    zip.file(name, serializer.serializeToString(dom));
  }

  return zip.generateAsync({ type: 'blob', mimeType: DOCX_MIME });
}
