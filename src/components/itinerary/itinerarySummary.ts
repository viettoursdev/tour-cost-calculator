import type { Itinerary, Day } from '@/types';

const realActs = (d: Day) => d.segments.flatMap((s) => s.activities).filter((a) => a.text.trim());

export type ItinSummary = {
  scheduleDays: number;
  declaredDays: number;
  declaredNights: number;
  activities: number;
  meals: { B: number; L: number; D: number };
  daysWithDate: number;
  daysEmpty: number;
};

/** Thống kê nhanh chương trình để hiển thị tóm tắt trước khi xuất. */
export function itinerarySummary(it: Itinerary): ItinSummary {
  const sched = it.schedule ?? [];
  let activities = 0, B = 0, L = 0, D = 0, daysWithDate = 0, daysEmpty = 0;
  for (const d of sched) {
    const n = realActs(d).length;
    activities += n;
    if (n === 0) daysEmpty += 1;
    if (d.date.trim()) daysWithDate += 1;
    if (d.meals.B) B += 1;
    if (d.meals.L) L += 1;
    if (d.meals.D) D += 1;
  }
  return { scheduleDays: sched.length, declaredDays: it.days || 0, declaredNights: it.nights || 0, activities, meals: { B, L, D }, daysWithDate, daysEmpty };
}

/** Cảnh báo những điểm cần xem lại trước khi gửi chương trình cho khách. */
export function itineraryIssues(it: Itinerary): string[] {
  const w: string[] = [];
  const sched = it.schedule ?? [];
  if (!it.title?.trim()) w.push('Chưa có tiêu đề chương trình');
  if (!it.destination?.trim()) w.push('Chưa có điểm đến');
  if (sched.length === 0) w.push('Chưa có ngày nào trong lịch trình');
  if (it.days && sched.length && it.days !== sched.length) w.push(`Số ngày khai báo (${it.days}) khác số ngày trong lịch (${sched.length})`);
  for (const d of sched) {
    if (realActs(d).length === 0) w.push(`Ngày ${d.dayNum}: chưa có hoạt động`);
    if (!d.date.trim()) w.push(`Ngày ${d.dayNum}: chưa có ngày tháng`);
    if (!d.title.trim()) w.push(`Ngày ${d.dayNum}: chưa có tiêu đề/tuyến`);
  }
  if ((it.includes ?? []).filter((x) => x.trim()).length === 0) w.push('Chưa có mục "Bao gồm"');
  return w;
}
