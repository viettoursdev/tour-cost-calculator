/**
 * "Bản tin sáng" inline — gộp các con số trong ngày thành 1–2 câu tóm tắt tiếng Việt.
 * Thuần để test; HomeView truyền các đếm đã tính sẵn.
 */
export interface DigestCounts {
  overdue: number;     // việc quá hạn của tôi
  deadlines: number;   // deadline 2 tuần
  departing: number;   // tour sắp khởi hành
  nccDue: number;      // đến hạn trả NCC
  docs: number;        // giấy tờ khách sắp hết hạn
  leaves: number;      // nghỉ phép chờ duyệt
  followups: number;   // hẹn liên hệ khách hôm nay
}

/** Trả câu tóm tắt; rỗng nếu không có gì cần lưu ý. */
export function buildDigest(c: DigestCounts): string {
  const parts: string[] = [];
  if (c.overdue) parts.push(`${c.overdue} việc quá hạn`);
  if (c.deadlines) parts.push(`${c.deadlines} deadline sắp tới`);
  if (c.departing) parts.push(`${c.departing} tour sắp khởi hành`);
  if (c.nccDue) parts.push(`${c.nccDue} khoản đến hạn trả NCC`);
  if (c.docs) parts.push(`${c.docs} giấy tờ khách sắp hết hạn`);
  if (c.followups) parts.push(`${c.followups} khách cần liên hệ`);
  if (c.leaves) parts.push(`${c.leaves} đơn nghỉ phép chờ duyệt`);
  if (parts.length === 0) return 'Hôm nay chưa có việc nào cần lưu ý. Chúc một ngày tốt lành! 🎉';
  const last = parts.pop()!;
  const joined = parts.length ? `${parts.join(', ')} và ${last}` : last;
  return `Hôm nay bạn có ${joined}.`;
}
