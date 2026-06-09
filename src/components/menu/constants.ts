import type {
  ItineraryType, Menu, MenuDay, MenuMeal, Restaurant, RestaurantMenu,
} from '@/types';

// Source: public/legacy.html:7239.
export const MENU_CUR = [
  'VND', 'USD', 'EUR', 'GBP', 'CNY', 'JPY', 'KRW', 'THB',
  'SGD', 'TWD', 'HKD', 'AUD', 'CAD', 'CHF', 'MYR',
] as const;

export const MEAL_TYPES = ['Ăn sáng', 'Ăn trưa', 'Ăn tối', 'Tiệc Gala', 'Ăn nhẹ'] as const;

// Source: public/legacy.html:7246.
export function newRestMenu(name = 'Set mới'): RestaurantMenu {
  return {
    id: 'rm' + Date.now() + Math.random().toString(36).slice(2, 5),
    name,
    dishes: '',
    price: 0,
    cur: 'VND',
    rating: 0,
    review: '',
  };
}

// Source: public/legacy.html:7247.
export function newMenuMeal(type = 'Ăn trưa'): MenuMeal {
  return {
    id: 'm' + Date.now() + Math.random().toString(36).slice(2, 5),
    mealType: type,
    restaurantId: '',
    restaurantName: '',
    city: '',
    suggestedDishes: '',
    suggestedPrice: 0,
    suggestedCur: 'VND',
    adjustedDishes: '',
    adjustedPrice: 0,
    adjustedCur: 'VND',
    cur: 'VND',
    note: '',
  };
}

// Source: public/legacy.html:7248.
export function newMenuDay(n: number): MenuDay {
  return {
    id: 'md' + Date.now() + Math.random().toString(36).slice(2, 5),
    dayNum: n,
    date: '',
    city: '',
    meals: [newMenuMeal('Ăn trưa')],
  };
}

// Source: public/legacy.html:7249.
export function newRestaurant(): Restaurant {
  return {
    id: 'r' + Date.now() + Math.random().toString(36).slice(2, 5),
    name: '',
    continent: '',
    country: '',
    city: '',
    website: '',
    menuLink: '',
    contact: '',
    note: '',
    rating: 0,
    review: '',
    menus: [newRestMenu('Set thực đơn 1')],
  };
}

// Source: public/legacy.html:1667. Code format: TD-{type}-{continent}-{country}-{seq:3}
export function generateMenuCode(
  type: ItineraryType | string,
  continent: string,
  country: string,
  seq: number,
): string {
  const t = type || 'NN';
  const c = continent || 'CA';
  const ct = country || 'TQ';
  return `TD-${t}-${c}-${ct}-${String(seq || 1).padStart(3, '0')}`;
}

export function freshMenu(): Menu {
  return {
    id: 'mn' + Date.now(),
    type: 'NN',
    continent: 'CA',
    country: 'TQ',
    seq: 1,
    title: 'THỰC ĐƠN CHƯƠNG TRÌNH',
    destination: '',
    days: 4,
    linkedItineraryId: null,
    linkedItineraryName: '',
    linkedQuoteId: null,
    linkedQuoteName: '',
    schedule: [newMenuDay(1), newMenuDay(2), newMenuDay(3), newMenuDay(4)],
  };
}
