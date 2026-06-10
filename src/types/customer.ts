export type CustomerContact = {
  name: string;
  phone: string;
  email: string;
  position: string;
};

export type Customer = {
  id: string;
  name: string;
  type: 'company' | 'individual';
  address?: string;   // địa chỉ
  taxCode?: string;   // mã số thuế
  contacts: CustomerContact[];
  note: string;
  createdAt: string;
  createdBy: string;
  updatedAt?: string;
  updatedBy?: string;
};
