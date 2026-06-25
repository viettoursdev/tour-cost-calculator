import type { ItineraryType } from './itinerary';
import type { FileAttachment } from './quote';

export interface RestaurantMenu {
  id: string;
  name: string;
  dishes: string;
  price: number;
  cur: string;
  rating: number;
  review: string;
}

export interface Restaurant {
  id: string;
  name: string;
  continent: string;
  country: string;
  city: string;
  address?: string;       // địa chỉ cụ thể
  website?: string;
  menuLink?: string;
  contact?: string;
  note?: string;          // thông tin / ghi chú
  files?: FileAttachment[]; // file đính kèm (thực đơn, ảnh… trên R2)
  rating: number;
  review: string;
  menus: RestaurantMenu[];
}

export interface MenuMeal {
  id: string;
  mealType: string;
  restaurantId: string;
  restaurantName: string;
  city: string;
  restMenuId?: string;
  suggestedDishes: string;
  suggestedPrice: number;
  suggestedCur: string;
  adjustedDishes: string;
  adjustedPrice: number;
  adjustedCur: string;
  cur: string;
  note: string;
}

export interface MenuDay {
  id: string;
  dayNum: number;
  date: string;
  city: string;
  meals: MenuMeal[];
}

export interface Menu {
  id: string;
  code?: string;
  type: ItineraryType;
  continent: string;
  country: string;
  seq: number;
  title: string;
  destination: string;
  days: number;
  linkedItineraryId: string | null;
  linkedItineraryName: string;
  linkedQuoteId: string | null;
  linkedQuoteName: string;
  tourProfileId?: string | null;
  schedule: MenuDay[];
  createdAt?: string;
  createdBy?: string;
  updatedAt?: string;
  updatedBy?: string;
}

/** Một tour (menu) đang dùng một nhà hàng — để hiện "nhà hàng này gắn với tour nào". */
export interface RestaurantTourLink {
  menuId: string;       // Menu.id (legacy_id)
  title: string;        // tên menu/tour
  destination: string;
}

export interface MenuIndexEntry {
  id: string;
  code: string;
  title: string;
  destination: string;
  days: number;
  linkedItineraryId?: string | null;
  linkedItineraryName: string;
  linkedQuoteId?: string | null;
  linkedQuoteName: string;
  tourProfileId?: string | null;
  createdAt?: string;
  createdBy?: string;
  updatedAt: string;
  updatedBy: string;
}
