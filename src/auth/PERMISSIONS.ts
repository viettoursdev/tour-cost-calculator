import type { Permissions, Role, User, PermissionKey } from '@/types';

export const PERMISSIONS: Record<Role, Permissions> = {
  CEO:           { manageUsers:true,  editRateCard:true,  exportQuote:true,  importQuote:true,  viewHistory:true,  syncRateCard:true,  manageNCC:true,  manageCustomers:true,  manageContracts:true,  viewContracts:true,  manageMenu:true,  manageVisa:true,  viewHR:true,  manageHR:true,  manageInventory:true  },
  'Ban Giám Đốc':{ manageUsers:true,  editRateCard:true,  exportQuote:true,  importQuote:true,  viewHistory:true,  syncRateCard:true,  manageNCC:true,  manageCustomers:true,  manageContracts:true,  viewContracts:true,  manageMenu:true,  manageVisa:true,  viewHR:true,  manageHR:true,  manageInventory:true  },
  'Trưởng Phòng':{ manageUsers:false, editRateCard:true,  exportQuote:true,  importQuote:true,  viewHistory:true,  syncRateCard:true,  manageNCC:true,  manageCustomers:true,  manageContracts:true,  viewContracts:true,  manageMenu:true,  manageVisa:true,  viewHR:true,  manageHR:true,  manageInventory:true  },
  'Phó Phòng':   { manageUsers:false, editRateCard:true,  exportQuote:true,  importQuote:true,  viewHistory:true,  syncRateCard:true,  manageNCC:true,  manageCustomers:true,  manageContracts:true,  viewContracts:true,  manageMenu:true,  manageVisa:true,  viewHR:true,  manageHR:false, manageInventory:true  },
  Sales:         { manageUsers:false, editRateCard:true,  exportQuote:true,  importQuote:true,  viewHistory:true,  syncRateCard:true,  manageNCC:true,  manageCustomers:true,  manageContracts:true,  viewContracts:true,  manageMenu:true,  manageVisa:true,  viewHR:false, manageHR:false, manageInventory:true  },
  Operations:    { manageUsers:false, editRateCard:true,  exportQuote:true,  importQuote:true,  viewHistory:true,  syncRateCard:true,  manageNCC:true,  manageCustomers:true,  manageContracts:true,  viewContracts:true,  manageMenu:true,  manageVisa:true,  viewHR:false, manageHR:false, manageInventory:true  },
  Marketing:     { manageUsers:false, editRateCard:true,  exportQuote:true,  importQuote:true,  viewHistory:true,  syncRateCard:true,  manageNCC:true,  manageCustomers:true,  manageContracts:true,  viewContracts:true,  manageMenu:true,  manageVisa:true,  viewHR:false, manageHR:false, manageInventory:true  },
  Admin:         { manageUsers:false, editRateCard:false, exportQuote:false, importQuote:false, viewHistory:true,  syncRateCard:false, manageNCC:false, manageCustomers:false, manageContracts:false, viewContracts:true,  manageMenu:false, manageVisa:false, viewHR:false, manageHR:false, manageInventory:true  },
  Accountant:    { manageUsers:false, editRateCard:false, exportQuote:false, importQuote:false, viewHistory:true,  syncRateCard:false, manageNCC:false, manageCustomers:false, manageContracts:false, viewContracts:false, manageMenu:false, manageVisa:false, viewHR:false, manageHR:false, manageInventory:false },
  Standard:      { manageUsers:false, editRateCard:false, exportQuote:false, importQuote:false, viewHistory:false, syncRateCard:false, manageNCC:false, manageCustomers:false, manageContracts:false, viewContracts:false, manageMenu:false, manageVisa:false, viewHR:false, manageHR:false, manageInventory:false },
};

export function hasPerm(user: User | null, key: PermissionKey): boolean {
  if (!user) return false;
  const p = PERMISSIONS[user.role];
  return p ? !!p[key] : false;
}
