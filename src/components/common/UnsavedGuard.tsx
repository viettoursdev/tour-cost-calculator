import { useEffect } from 'react';
import { useQuoteStore } from '@/stores/quoteStore';

/** Cảnh báo trình duyệt khi rời/đóng tab lúc báo giá có thay đổi chưa lưu cloud. */
export function UnsavedGuard() {
  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (useQuoteStore.getState().cloudDirty) {
        e.preventDefault();
        e.returnValue = ''; // trình duyệt hiện hộp xác nhận mặc định
      }
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, []);
  return null;
}
