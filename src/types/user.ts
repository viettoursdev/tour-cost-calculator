export type Role =
  | 'CEO'
  | 'Trưởng Phòng'
  | 'Sales'
  | 'Operations'
  | 'Marketing'
  | 'Admin'
  | 'Accountant'
  | 'Standard';

export type User = {
  u: string;          // username
  p: string;          // password (plaintext, per existing app)
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
