/**
 * Thống kê danh sách khách đoàn cho dashboard: tổng khách, Nam/Nữ, và số phòng
 * theo từng loại (Twin/Double/Single/Triple/VIP/Upgrade). Hàm thuần — dùng chung
 * cho màn báo giá, màn Visa và file xuất manifest.
 */
import type { Passenger } from '@/types';

export const ROOM_KEYS = ['twin', 'double', 'single', 'triple', 'vip', 'upgrade'] as const;
export type RoomKey = (typeof ROOM_KEYS)[number];

export const ROOM_LABELS: Record<RoomKey, string> = {
  twin: 'Twin', double: 'Đôi', single: 'Đơn', triple: 'Triple', vip: 'VIP', upgrade: 'Nâng hạng',
};

const emptyTally = (): Record<RoomKey, number> =>
  ({ twin: 0, double: 0, single: 0, triple: 0, vip: 0, upgrade: 0 });

export interface GuestSummary {
  total: number;
  male: number;
  female: number;
  unspecifiedGender: number;
  /** Số KHÁCH gán mỗi loại phòng. */
  guestsByRoom: Record<RoomKey, number>;
  /** Số PHÒNG riêng biệt mỗi loại (gộp theo số phòng `roomNo`). */
  roomsByRoom: Record<RoomKey, number>;
  totalRooms: number;
  /** Khách chưa xếp phòng (không loại, không số phòng). */
  unassigned: number;
}

const isRoomKey = (v: unknown): v is RoomKey => ROOM_KEYS.includes(v as RoomKey);

export function summarizeGuests(pax: Passenger[]): GuestSummary {
  const guestsByRoom = emptyTally();
  const roomsByRoom = emptyTally();
  let male = 0, female = 0, unspecifiedGender = 0, unassigned = 0;

  // Gom phòng: khách cùng `roomNo` = 1 phòng; khách có loại nhưng chưa đánh số =
  // mỗi người 1 phòng riêng. Loại của phòng lấy giá trị non-empty đầu tiên thấy.
  const roomMap = new Map<string, RoomKey | ''>();

  for (const g of pax) {
    if (g.gender === 'M') male++;
    else if (g.gender === 'F') female++;
    else unspecifiedGender++;

    if (isRoomKey(g.roomType)) guestsByRoom[g.roomType]++;

    const no = g.roomNo?.trim();
    const hasRoom = !!no || isRoomKey(g.roomType);
    if (!hasRoom) { unassigned++; continue; }
    const key = no ? `n:${no}` : `s:${g.id}`;
    const t = isRoomKey(g.roomType) ? g.roomType : (roomMap.get(key) || '');
    roomMap.set(key, t);
  }

  for (const t of roomMap.values()) if (isRoomKey(t)) roomsByRoom[t]++;

  return {
    total: pax.length,
    male, female, unspecifiedGender,
    guestsByRoom, roomsByRoom,
    totalRooms: roomMap.size,
    unassigned,
  };
}
