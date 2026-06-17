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

export type User = {
  u: string;          // username — canonical app-level identifier
  email?: string;     // company email (@viettours.com.vn). Required for new
                      // users from Phase 1 onward; optional in the type so
                      // pre-migration records still load. Migration to
                      // required happens in Phase 4 cleanup.
  phone?: string;     // contact phone shown on exported quotes
  /** @deprecated Mật khẩu plaintext (di sản). KHÔNG còn lưu lên Firestore —
   *  fbPushUsers/fbPullUsers loại bỏ; fbPurgeLegacyPasswords xoá bản ghi cũ. */
  p?: string;
  role: Role;
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
  | 'manageVisa';

export type Permissions = Record<PermissionKey, boolean>;
