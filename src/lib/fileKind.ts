/** Phân loại file để chọn cách xem trước phù hợp. */
export type FileKind = 'image' | 'pdf' | 'office' | 'text' | 'other';

const ext = (name: string): string => (name.split('.').pop() ?? '').toLowerCase();

export function fileKind(name: string, mime?: string): FileKind {
  const m = (mime ?? '').toLowerCase();
  const e = ext(name);
  if (m.startsWith('image/') || /^(png|jpe?g|gif|webp|bmp|svg|heic|avif)$/.test(e)) return 'image';
  if (m === 'application/pdf' || e === 'pdf') return 'pdf';
  if (/(msword|ms-excel|ms-powerpoint|officedocument|opendocument)/.test(m) || /^(docx?|xlsx?|pptx?|odt|ods|odp)$/.test(e)) return 'office';
  if (m.startsWith('text/') || /^(txt|csv|tsv|json|md|log|xml|yaml|yml)$/.test(e)) return 'text';
  return 'other';
}

/** Có xem trước được ngay trong app không (image/pdf/office/text). */
export function canPreview(name: string, mime?: string): boolean {
  return fileKind(name, mime) !== 'other';
}
