/**
 * Rich-text nhẹ cho nội dung hoạt động lịch trình: hỗ trợ **đậm**, *nghiêng* và
 * xuống dòng (\n). Dùng chung cho hiển thị preview (React) và bản xuất (Word).
 */
export interface RichRun {
  text: string;
  bold?: boolean;
  italic?: boolean;
}

/** Tách một dòng thành các đoạn theo `**đậm**` và `*nghiêng*`. */
export function parseInlineRich(line: string): RichRun[] {
  const runs: RichRun[] = [];
  const re = /(\*\*[^*]+\*\*|\*[^*]+\*)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(line)) !== null) {
    if (m.index > last) runs.push({ text: line.slice(last, m.index) });
    const tok = m[0];
    if (tok.startsWith('**')) runs.push({ text: tok.slice(2, -2), bold: true });
    else runs.push({ text: tok.slice(1, -1), italic: true });
    last = m.index + tok.length;
  }
  if (last < line.length) runs.push({ text: line.slice(last) });
  return runs.length ? runs : [{ text: line }];
}

/** Tách text nhiều dòng thành mảng dòng (giữ cả dòng trống). */
export function splitLines(text: string | undefined): string[] {
  return (text ?? '').split('\n');
}
