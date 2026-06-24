import type { Permissions, Role, User, PermissionKey } from '@/types';

export const PERMISSIONS: Record<Role, Permissions> = {
  CEO:           { manageUsers:true,  editRateCard:true,  exportQuote:true,  importQuote:true,  viewHistory:true,  syncRateCard:true,  manageNCC:true,  manageCustomers:true,  manageContracts:true,  viewContracts:true,  manageMenu:true,  manageVisa:true,  viewHR:true,  manageHR:true  },
  'Ban Giám Đốc':{ manageUsers:true,  editRateCard:true,  exportQuote:true,  importQuote:true,  viewHistory:true,  syncRateCard:true,  manageNCC:true,  manageCustomers:true,  manageContracts:true,  viewContracts:true,  manageMenu:true,  manageVisa:true,  viewHR:true,  manageHR:true  },
  'Trưởng Phòng':{ manageUsers:false, editRateCard:true,  exportQuote:true,  importQuote:true,  viewHistory:true,  syncRateCard:true,  manageNCC:true,  manageCustomers:true,  manageContracts:true,  viewContracts:true,  manageMenu:true,  manageVisa:true,  viewHR:true,  manageHR:true  },
  'Phó Phòng':   { manageUsers:false, editRateCard:true,  exportQuote:true,  importQuote:true,  viewHistory:true,  syncRateCard:true,  manageNCC:true,  manageCustomers:true,  manageContracts:true,  viewContracts:true,  manageMenu:true,  manageVisa:true,  viewHR:true,  manageHR:false },
  Sales:         { manageUsers:false, editRateCard:true,  exportQuote:true,  importQuote:true,  viewHistory:true,  syncRateCard:true,  manageNCC:true,  manageCustomers:true,  manageContracts:true,  viewContracts:true,  manageMenu:true,  manageVisa:true,  viewHR:false, manageHR:false },
  Operations:    { manageUsers:false, editRateCard:true,  exportQuote:true,  importQuote:true,  viewHistory:true,  syncRateCard:true,  manageNCC:true,  manageCustomers:true,  manageContracts:true,  viewContracts:true,  manageMenu:true,  manageVisa:true,  viewHR:false, manageHR:false },
  Marketing:     { manageUsers:false, editRateCard:true,  exportQuote:true,  importQuote:true,  viewHistory:true,  syncRateCard:true,  manageNCC:true,  manageCustomers:true,  manageContracts:true,  viewContracts:true,  manageMenu:true,  manageVisa:true,  viewHR:false, manageHR:false },
  Admin:         { manageUsers:false, editRateCard:false, exportQuote:false, importQuote:false, viewHistory:true,  syncRateCard:false, manageNCC:false, manageCustomers:false, manageContracts:false, viewContracts:true,  manageMenu:false, manageVisa:false, viewHR:false, manageHR:false },
  Accountant:    { manageUsers:false, editRateCard:false, exportQuote:false, importQuote:false, viewHistory:true,  syncRateCard:false, manageNCC:false, manageCustomers:false, manageContracts:false, viewContracts:false, manageMenu:false, manageVisa:false, viewHR:false, manageHR:false },
  Standard:      { manageUsers:false, editRateCard:false, exportQuote:false, importQuote:false, viewHistory:false, syncRateCard:false, manageNCC:false, manageCustomers:false, manageContracts:false, viewContracts:false, manageMenu:false, manageVisa:false, viewHR:false, manageHR:false },
};

export function hasPerm(user: User | null, key: PermissionKey): boolean {
  if (!user) return false;
  const p = PERMISSIONS[user.role];
  return p ? !!p[key] : false;
}
