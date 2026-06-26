import type { Permissions, Role, User, PermissionKey } from '@/types';

export const PERMISSIONS: Record<Role, Permissions> = {
  CEO:           { manageUsers:true,  editRateCard:true,  exportQuote:true,  importQuote:true,  viewHistory:true,  syncRateCard:true,  manageNCC:true,  manageCustomers:true,  manageContracts:true,  viewContracts:true,  manageMenu:true,  manageVisa:true,  viewHR:true,  manageHR:true,  manageInventory:true,  viewTraining:true,  manageTraining:true  },
  'Ban Giám Đốc':{ manageUsers:true,  editRateCard:true,  exportQuote:true,  importQuote:true,  viewHistory:true,  syncRateCard:true,  manageNCC:true,  manageCustomers:true,  manageContracts:true,  viewContracts:true,  manageMenu:true,  manageVisa:true,  viewHR:true,  manageHR:true,  manageInventory:true,  viewTraining:true,  manageTraining:true  },
  'Trưởng Phòng':{ manageUsers:false, editRateCard:true,  exportQuote:true,  importQuote:true,  viewHistory:true,  syncRateCard:true,  manageNCC:true,  manageCustomers:true,  manageContracts:true,  viewContracts:true,  manageMenu:true,  manageVisa:true,  viewHR:true,  manageHR:true,  manageInventory:true,  viewTraining:true,  manageTraining:true  },
  'Phó Phòng':   { manageUsers:false, editRateCard:true,  exportQuote:true,  importQuote:true,  viewHistory:true,  syncRateCard:true,  manageNCC:true,  manageCustomers:true,  manageContracts:true,  viewContracts:true,  manageMenu:true,  manageVisa:true,  viewHR:true,  manageHR:false, manageInventory:true,  viewTraining:true,  manageTraining:true  },
  Sales:         { manageUsers:false, editRateCard:true,  exportQuote:true,  importQuote:true,  viewHistory:true,  syncRateCard:true,  manageNCC:true,  manageCustomers:true,  manageContracts:true,  viewContracts:true,  manageMenu:true,  manageVisa:true,  viewHR:false, manageHR:false, manageInventory:true,  viewTraining:true,  manageTraining:false },
  Operations:    { manageUsers:false, editRateCard:true,  exportQuote:true,  importQuote:true,  viewHistory:true,  syncRateCard:true,  manageNCC:true,  manageCustomers:true,  manageContracts:true,  viewContracts:true,  manageMenu:true,  manageVisa:true,  viewHR:false, manageHR:false, manageInventory:true,  viewTraining:true,  manageTraining:false },
  Marketing:     { manageUsers:false, editRateCard:true,  exportQuote:true,  importQuote:true,  viewHistory:true,  syncRateCard:true,  manageNCC:true,  manageCustomers:true,  manageContracts:true,  viewContracts:true,  manageMenu:true,  manageVisa:true,  viewHR:false, manageHR:false, manageInventory:true,  viewTraining:true,  manageTraining:false },
  Admin:         { manageUsers:false, editRateCard:false, exportQuote:false, importQuote:false, viewHistory:true,  syncRateCard:false, manageNCC:false, manageCustomers:false, manageContracts:false, viewContracts:true,  manageMenu:false, manageVisa:false, viewHR:false, manageHR:false, manageInventory:true,  viewTraining:true,  manageTraining:false },
  Accountant:    { manageUsers:false, editRateCard:false, exportQuote:false, importQuote:false, viewHistory:true,  syncRateCard:false, manageNCC:false, manageCustomers:false, manageContracts:false, viewContracts:false, manageMenu:false, manageVisa:false, viewHR:false, manageHR:false, manageInventory:false, viewTraining:true,  manageTraining:false },
  Standard:      { manageUsers:false, editRateCard:false, exportQuote:false, importQuote:false, viewHistory:false, syncRateCard:false, manageNCC:false, manageCustomers:false, manageContracts:false, viewContracts:false, manageMenu:false, manageVisa:false, viewHR:false, manageHR:false, manageInventory:false, viewTraining:false, manageTraining:false },
};

export function hasPerm(user: User | null, key: PermissionKey): boolean {
  if (!user) return false;
  const p = PERMISSIONS[user.role];
  return p ? !!p[key] : false;
}
