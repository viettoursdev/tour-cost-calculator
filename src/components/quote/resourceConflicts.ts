/**
 * #F — Bắt trùng nguồn lực (bản gọn). Bộ phát hiện chồng-khoảng-thời-gian TỔNG QUÁT
 * cho mọi nguồn lực có lịch giữ chỗ (tài sản, sau này xe/khách sạn). Thuần (pure) để
 * test. HDV đã có bộ bắt trùng riêng (guideSchedule.detectConflicts) — panel gộp cả hai.
 */

export type ResourceKind = 'asset' | 'vehicle' | 'hotel';

export type ResourceAllocation = {
  resourceId: string;
  resourceName: string;
  kind: ResourceKind;
  refId: string;     // tour/hồ sơ giữ nguồn lực
  refLabel: string;  // nhãn tour
  start: number;     // epoch ms
  end: number;       // epoch ms
};

export type ResourceConflict = {
  resourceId: string;
  resourceName: string;
  kind: ResourceKind;
  a: { refId: string; refLabel: string; start: number; end: number };
  b: { refId: string; refLabel: string; start: number; end: number };
  overlapMs: number; // độ chồng (>0)
};

/**
 * Tìm các cặp phân bổ CHỒNG NHAU của cùng một nguồn lực nhưng cho HAI tour khác nhau.
 * Gom theo nguồn lực, sắp theo `start`, so cặp liền kề (dừng sớm khi hết khả năng chồng).
 */
export function findResourceConflicts(allocations: ResourceAllocation[]): ResourceConflict[] {
  const byRes = new Map<string, ResourceAllocation[]>();
  for (const a of allocations) {
    const arr = byRes.get(a.resourceId) ?? [];
    arr.push(a);
    byRes.set(a.resourceId, arr);
  }
  const out: ResourceConflict[] = [];
  for (const arr of byRes.values()) {
    const sorted = [...arr].sort((x, y) => x.start - y.start);
    for (let i = 0; i < sorted.length - 1; i++) {
      const a = sorted[i];
      for (let j = i + 1; j < sorted.length; j++) {
        const b = sorted[j];
        if (b.start >= a.end) break; // đã sắp theo start → các phần sau còn xa hơn
        if (a.refId === b.refId) continue; // cùng tour → không tính trùng
        out.push({
          resourceId: a.resourceId,
          resourceName: a.resourceName,
          kind: a.kind,
          a: { refId: a.refId, refLabel: a.refLabel, start: a.start, end: a.end },
          b: { refId: b.refId, refLabel: b.refLabel, start: b.start, end: b.end },
          overlapMs: Math.min(a.end, b.end) - b.start,
        });
      }
    }
  }
  return out;
}

const DAY_MS = 86_400_000;

export type AssetLogLike = {
  assetId: string;
  action: string;          // 'checkout' | 'checkin' | …
  occurredAt: string;      // ISO
  tourProfileId?: string;
  tourCode?: string;
};

/**
 * Dựng các khoảng GIỮ tài sản từ nhật ký: mỗi `checkout` (có tour) mở một khoảng,
 * `checkin` kế tiếp đóng nó; khoảng còn mở → kết thúc sau `defaultDurationDays`.
 * Bỏ qua checkout không gắn tour. Trả về danh sách phân bổ để đưa vào findResourceConflicts.
 */
export function assetAllocationsFromLogs(
  logs: AssetLogLike[],
  resName: (assetId: string) => string,
  opts: { defaultDurationDays?: number } = {},
): ResourceAllocation[] {
  const dur = (opts.defaultDurationDays ?? 5) * DAY_MS;
  const byAsset = new Map<string, AssetLogLike[]>();
  for (const l of logs) {
    const arr = byAsset.get(l.assetId) ?? [];
    arr.push(l);
    byAsset.set(l.assetId, arr);
  }
  const out: ResourceAllocation[] = [];
  for (const [assetId, arr] of byAsset) {
    const sorted = [...arr].sort((x, y) => x.occurredAt.localeCompare(y.occurredAt));
    let open: { start: number; refId: string; refLabel: string } | null = null;
    const close = (end: number) => {
      if (!open) return;
      out.push({ resourceId: assetId, resourceName: resName(assetId), kind: 'asset', refId: open.refId, refLabel: open.refLabel, start: open.start, end });
      open = null;
    };
    for (const l of sorted) {
      const t = Date.parse(l.occurredAt);
      if (Number.isNaN(t)) continue;
      if (l.action === 'checkout' && l.tourProfileId) {
        if (open) close(t); // checkout mới khi chưa checkin → đóng khoảng cũ tại đây
        open = { start: t, refId: l.tourProfileId, refLabel: l.tourCode || l.tourProfileId };
      } else if (l.action === 'checkin') {
        close(t);
      }
    }
    if (open) close(open.start + dur);
  }
  return out;
}

export type OverdueAsset = {
  assetId: string;
  assetName: string;
  refId: string;     // tour đang giữ
  refLabel: string;
  since: number;     // epoch ms checkout
  daysHeld: number;  // số ngày đã giữ
};

/**
 * Tài sản CHƯA HOÀN TRẢ quá hạn: còn một `checkout` (gắn tour) chưa có `checkin`, và
 * đã giữ quá `graceDays`. Tín hiệu vận hành thực tế từ nhật ký (log vốn tuần tự — một
 * tài sản chỉ một người giữ, nên đây là dấu hiệu hữu dụng thay vì "đặt trùng tương lai").
 */
export function overdueAssetHoldings(
  logs: AssetLogLike[],
  resName: (assetId: string) => string,
  opts: { now?: number; graceDays?: number } = {},
): OverdueAsset[] {
  const now = opts.now ?? Date.now();
  const grace = (opts.graceDays ?? 7) * DAY_MS;
  const byAsset = new Map<string, AssetLogLike[]>();
  for (const l of logs) {
    const arr = byAsset.get(l.assetId) ?? [];
    arr.push(l);
    byAsset.set(l.assetId, arr);
  }
  const out: OverdueAsset[] = [];
  for (const [assetId, arr] of byAsset) {
    const sorted = [...arr].sort((x, y) => x.occurredAt.localeCompare(y.occurredAt));
    let open: { start: number; refId: string; refLabel: string } | null = null;
    for (const l of sorted) {
      const t = Date.parse(l.occurredAt);
      if (Number.isNaN(t)) continue;
      if (l.action === 'checkout' && l.tourProfileId) open = { start: t, refId: l.tourProfileId, refLabel: l.tourCode || l.tourProfileId };
      else if (l.action === 'checkin') open = null;
    }
    if (open && now - open.start > grace) {
      out.push({ assetId, assetName: resName(assetId), refId: open.refId, refLabel: open.refLabel, since: open.start, daysHeld: Math.floor((now - open.start) / DAY_MS) });
    }
  }
  return out.sort((a, b) => b.daysHeld - a.daysHeld);
}
