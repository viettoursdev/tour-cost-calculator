export type Role =
  | 'CEO'
  | 'Ban Giám Đốc'
  | 'Trưởng Phòng'
  | 'Sales'
  | 'Operations'
  | 'Marketing'
  | 'Admin'
  | 'Accountant'
  | 'Standard';

/** Phòng ban (trục CHỨC NĂNG, độc lập với cấp bậc `role`). */
export type Department =
  | 'dh_noidia'     // Điều hành nội địa
  | 'dh_nuocngoai'  // Điều hành nước ngoài
  | 'ketoan'        // Kế toán
  | 'visa'          // Visa
  | 'hdv'           // Hướng dẫn viên
  | 'muahang'       // Mua hàng
  | 'sukien';       // Sự kiện

export type User = {
  u: string;          // username — canonical app-level identifier
  email?: string;     // company email (@viettours.com.vn). Required for new
                      // users from Phase 1 onward; optional in the type so
                      // pre-migration records still load. Migration to
                      // required happens in Phase 4 cleanup.
  phone?: string;     // contact phone shown on exported quotes
  /** @deprecated Mật khẩu plaintext (di sản). KHÔNG còn lưu lên Supabase —
   *  sbPushUsers loại bỏ; sbPurgeLegacyPasswords là no-op (cột không tồn tại). */
  p?: string;
  role: Role;
  department?: Department;  // phòng ban — quyết định mảng được TẠO/SỬA
  name: string;
  color: string;      // hex
};

export type PermissionKey =
  | 'manageUsers'
  | 'editRateCard'
  | 'exportQuote'
  | 'importQuote'
  | 'viewHistory'
  | 'syncRateCard'
  | 'manageNCC'
  | 'manageCustomers'
  | 'manageContracts'
  | 'viewContracts'
  | 'manageMenu'
  | 'manageVisa'
  | 'viewHR'
  | 'manageHR';

export type Permissions = Record<PermissionKey, boolean>;
