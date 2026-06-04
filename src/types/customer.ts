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
  contacts: CustomerContact[];
  note: string;
  createdAt: string;
  createdBy: string;
  updatedAt?: string;
  updatedBy?: string;
};
