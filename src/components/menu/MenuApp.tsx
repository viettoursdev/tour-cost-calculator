import { useState } from 'react';
import { useAuthStore } from '@/stores/authStore';
import { useMenuStore } from '@/stores/menuStore';
import { MenuBuilder } from './MenuBuilder';
import { MenuHome } from './MenuHome';
import { RestaurantLibrary } from './RestaurantLibrary';
import type { Menu } from '@/types';

type Mode = 'list' | 'edit' | 'restaurants';

type Props = { onExit: () => void };

export function MenuApp({ onExit }: Props) {
  const [mode, setMode] = useState<Mode>('list');
  const [current, setCurrent] = useState<Menu | null>(null);
  const user = useAuthStore((s) => s.currentUser);

  if (!user) return null;

  const openNew = () => { setCurrent(null); setMode('edit'); };
  const openEdit = async (id: string) => {
    const full = await useMenuStore.getState().load(id);
    if (full) {
      setCurrent(full);
      setMode('edit');
    } else {
      window.alert('Không tải được thực đơn.');
    }
  };

  if (mode === 'edit') {
    return <MenuBuilder initial={current} user={user} onBack={() => setMode('list')} />;
  }
  if (mode === 'restaurants') {
    return <RestaurantLibrary onBack={() => setMode('list')} />;
  }
  return (
    <MenuHome
      onNew={openNew}
      onOpen={(id) => void openEdit(id)}
      onRestaurants={() => setMode('restaurants')}
      onBack={onExit}
    />
  );
}
