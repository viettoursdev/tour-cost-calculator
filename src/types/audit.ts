/** Một dòng nhật ký hoạt động cấp hệ thống (audit log). */
export type AuditAction = 'create' | 'update' | 'delete';

export type AuditEntry = {
  id: string;
  at: string;       // ISO timestamp
  byU: string;      // username
  byName: string;   // tên hiển thị
  action: AuditAction;
  entity: string;   // loại đối tượng: "Báo giá", "Hợp đồng", "Rate card"…
  name: string;     // tên/mã đối tượng
  note?: string;
};
