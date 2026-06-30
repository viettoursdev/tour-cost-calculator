import { useTourProfileStore } from '@/stores/tourProfileStore';
import { useQuoteStore } from '@/stores/quoteStore';

/**
 * Điều hướng tới tab "Hồ sơ tour" (cockpit) và focus đúng hồ sơ.
 * Các app thay thế (Thực đơn/Chương trình/Visa) chạy trên template riêng → phải đưa
 * draft về template tiêu chuẩn 'intl' (và XOÁ currentQuoteId để không vô tình ghi đè
 * báo giá nào — cùng lý do chống dời sheet Báo giá↔DMC) trước khi setView('cockpit').
 */
export function openTourProfile(profileId: string) {
  useQuoteStore.setState((s) => ({ draft: { ...s.draft, template: 'intl', currentQuoteId: null } }));
  useTourProfileStore.getState().requestFocus(profileId);
  useQuoteStore.getState().setView('cockpit');
}
