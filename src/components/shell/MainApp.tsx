import { useEffect } from 'react';
import { useAuthStore } from '@/stores/authStore';
import { AppShell } from './AppShell';
import { LoginScreen } from './LoginScreen';

export function MainApp() {
  const currentUser = useAuthStore((s) => s.currentUser);
  const init = useAuthStore((s) => s.init);

  useEffect(() => {
    void init();
  }, [init]);

  if (!currentUser) return <LoginScreen />;
  return <AppShell />;
}
