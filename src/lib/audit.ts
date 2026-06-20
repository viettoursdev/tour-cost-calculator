/**
 * Ghi nhật ký hoạt động cấp hệ thống (audit log) — không chặn UI, lỗi bỏ qua.
 * Gọi tại các thao tác quan trọng: tạo/sửa/xoá báo giá, hợp đồng, rate card…
 */
import { fbLogAudit } from '@/lib/dataBackend';
import { useAuthStore } from '@/stores/authStore';
import type { AuditAction } from '@/types';

let seq = 0;
const uid = () => 'a' + Date.now().toString(36) + (seq++).toString(36) + Math.random().toString(36).slice(2, 4);

export function logAudit(action: AuditAction, entity: string, name: string, note?: string): void {
  const u = useAuthStore.getState().currentUser;
  if (!u) return; // không có người dùng → bỏ qua
  void fbLogAudit({
    id: uid(),
    at: new Date().toISOString(),
    byU: u.u,
    byName: u.name,
    action,
    entity,
    name: name || '(không tên)',
    ...(note ? { note } : {}),
  }).catch(() => { /* audit không được chặn nghiệp vụ */ });
}
