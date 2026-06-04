export type NccContact = {
  name: string;
  phone: string;
  email: string;
  position: string;
};

export type Ncc = {
  id: string;
  name: string;
  sectors: string[];
  location: string;
  contacts: NccContact[];
  note: string;
  createdAt: string;
  createdBy: string;
  updatedAt?: string;
  updatedBy?: string;
};
