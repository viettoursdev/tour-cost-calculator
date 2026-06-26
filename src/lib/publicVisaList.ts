import { VISA_EXPORT_COLUMNS } from '@/lib/exports/visaExportColumns';
import type { Passenger, PublicVisaColumn, PublicVisaListDoc, VisaProjectDoc } from '@/types';

const COL_BY_KEY = new Map(VISA_EXPORT_COLUMNS.map((c) => [c.key, c]));

/** Token ngẫu nhiên cho link xem danh sách visa (khó đoán). */
export function genVisaListToken(): string {
  try {
    const a = new Uint8Array(12);
    crypto.getRandomValues(a);
    return Array.from(a, (b) => b.toString(16).padStart(2, '0')).join('');
  } catch {
    const rnd = () => Math.random().toString(36).slice(2);
    return (rnd() + rnd() + rnd()).slice(0, 24);
  }
}

/** URL link xem danh sách visa (tôn trọng base path GitHub Pages). */
export function visaListUrl(token: string): string {
  const base = `${window.location.origin}${import.meta.env.BASE_URL}`;
  return `${base.replace(/\/$/, '/')}?visa=${token}`;
}

/**
 * Dựng bản HƯỚNG KHÁCH từ dự án + danh sách khách (đã ở dạng Passenger) theo các
 * cột được chọn. Mỗi dòng là mảng ô theo đúng thứ tự `columnKeys`. Cột không hợp lệ
 * bị bỏ qua (reconcile với danh mục cột hiện tại).
 */
export function buildPublicVisaList(opts: {
  project: VisaProjectDoc;
  applicants: Passenger[];
  columnKeys: string[];
  token: string;
  publishedBy: string;
  note?: string;
}): PublicVisaListDoc {
  const { project, applicants, columnKeys, token } = opts;
  const cols = columnKeys.map((k) => COL_BY_KEY.get(k)).filter((c): c is NonNullable<typeof c> => !!c);
  const columns: PublicVisaColumn[] = cols.map((c) => ({ key: c.key, label: c.label, align: c.align }));
  const rows: (string | number)[][] = applicants.map((p, i) => cols.map((c) => c.value(p, i, project)));
  return {
    token,
    projectId: project.id,
    projectName: project.name || project.code,
    country: project.country || undefined,
    columns,
    rows,
    count: applicants.length,
    note: opts.note?.trim() || undefined,
    publishedBy: opts.publishedBy,
    publishedAt: new Date().toISOString(),
  };
}
