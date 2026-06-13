import { useEffect, useState } from 'react';
import { useItineraryStore } from '@/stores/itineraryStore';
import { useAuthStore } from '@/stores/authStore';
import { useLinkNavStore } from '@/stores/linkNavStore';
import { ItineraryHome } from './ItineraryHome';
import { ItineraryBuilder } from './ItineraryBuilder';
import type { Itinerary } from '@/types';

type Props = { onExit: () => void };

export function ItineraryApp({ onExit }: Props) {
  const [mode, setMode] = useState<'list' | 'edit'>('list');
  const [current, setCurrent] = useState<Itinerary | null>(null);
  const user = useAuthStore((s) => s.currentUser);

  // Mở sâu một chương trình khi điều hướng từ hub "🔗 Liên kết" của báo giá.
  useEffect(() => {
    const id = useLinkNavStore.getState().consume('itinerary');
    if (!id) return;
    void useItineraryStore.getState().load(id).then((full) => {
      if (full) { setCurrent(full); setMode('edit'); }
    });
  }, []);

  const openNew = () => { setCurrent(null); setMode('edit'); };
  const openEdit = async (id: string) => {
    const full = await useItineraryStore.getState().load(id);
    if (full) {
      setCurrent(full);
      setMode('edit');
    } else {
      window.alert('Không tải được chương trình.');
    }
  };

  if (!user) return null;

  if (mode === 'edit') {
    return (
      <ItineraryBuilder
        initial={current}
        user={user}
        onBack={() => setMode('list')}
      />
    );
  }
  return (
    <ItineraryHome
      onNew={openNew}
      onOpen={(id) => void openEdit(id)}
      onBack={onExit}
    />
  );
}
