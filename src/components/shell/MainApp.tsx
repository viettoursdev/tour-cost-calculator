import { useEffect } from 'react';
import { useAuthStore } from '@/stores/authStore';
import { useRateCardStore } from '@/stores/rateCardStore';
import { AppShell } from './AppShell';
import { LoginScreen } from './LoginScreen';

export function MainApp() {
  const currentUser = useAuthStore((s) => s.currentUser);
  const authInit = useAuthStore((s) => s.init);

  useEffect(() => {
    void authInit();
  }, [authInit]);

  useEffect(() => {
    if (!currentUser) return;
    const unsub = useRateCardStore.getState().init();
    return () => unsub?.();
  }, [currentUser]);

  if (!currentUser) return <LoginScreen />;
  return <AppShell />;
}
