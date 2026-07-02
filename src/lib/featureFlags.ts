import { isBoard } from '@/auth/ROLES';
import type { Department, User } from '@/types';

/**
 * FEATURE FLAG cấp tổ chức: BGĐ+ bật/tắt các module TÙY CHỌN cho toàn công ty
 * hoặc theo phòng ban — lưu `app_config` key `module_flags` (JSON), ghi qua RPC
 * `set_org_pref` (migration 0096). Ban Giám Đốc luôn thấy đủ module (để bật lại).
 * Chỉ gate ĐIỂM VÀO giao diện (thẻ/nút/tab) — không đụng dữ liệu hay quyền RLS.
 */

export type ModuleFlag = {
  /** Tắt toàn công ty. */
  off?: boolean;
  /** Tắt cho các phòng ban này (khi không tắt toàn công ty). */
  offDepts?: Department[];
};
export type ModuleFlags = Record<string, ModuleFlag>;

/** Các module gate ĐƯỢC (đừng thêm mạch cốt lõi: báo giá, hồ sơ tour, thanh toán…). */
export const GATEABLE_MODULES: { key: string; label: string; desc: string }[] = [
  { key: 'assistant', label: 'Trợ lý ảo', desc: 'Nút 🤖 trên header (hỏi đáp AI trên dữ liệu)' },
  { key: 'chat', label: 'Tin nhắn nội bộ', desc: 'Nút 💬 chat giữa nhân viên trên header' },
  { key: 'library', label: 'Thư viện kiến thức', desc: 'Kho kiến thức nội bộ + hỏi đáp AI có trích dẫn' },
  { key: 'guideschedule', label: 'Lịch đi tour HDV', desc: 'Lịch bay & điều phối Hướng dẫn viên' },
  { key: 'inventory', label: 'Quản lý kho', desc: 'Tồn kho, lô hàng & tài sản theo tour' },
  { key: 'training', label: 'Đào tạo nhân viên', desc: 'Onboarding 30-60-90 & nghiệp vụ' },
];

const GATEABLE_KEYS = new Set(GATEABLE_MODULES.map((m) => m.key));

/** Chuẩn hoá blob thô từ app_config (JSON có thể cũ/sai hình dạng). */
export function normalizeModuleFlags(raw: unknown): ModuleFlags {
  if (!raw || typeof raw !== 'object') return {};
  const out: ModuleFlags = {};
  for (const [key, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!GATEABLE_KEYS.has(key) || !v || typeof v !== 'object') continue;
    const f = v as ModuleFlag;
    const flag: ModuleFlag = {};
    if (f.off === true) flag.off = true;
    if (Array.isArray(f.offDepts)) {
      const depts = f.offDepts.filter((d): d is Department => typeof d === 'string');
      if (depts.length) flag.offDepts = depts;
    }
    if (flag.off || flag.offDepts) out[key] = flag;
  }
  return out;
}

/**
 * Module có bật cho user này không? BGĐ+ (CEO/BGĐ/Trợ lý GĐ) LUÔN thấy đủ;
 * user chưa đăng nhập không gate (màn công khai tự giới hạn sẵn).
 */
export function isModuleEnabled(flags: ModuleFlags, key: string, user: User | null | undefined): boolean {
  const f = flags[key];
  if (!f) return true;
  if (!user || isBoard(user.role)) return true;
  if (f.off) return false;
  if (f.offDepts && user.department && f.offDepts.includes(user.department)) return false;
  return true;
}
