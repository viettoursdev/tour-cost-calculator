import { useState } from 'react';
import { useItineraryStore } from '@/stores/itineraryStore';
import { useAuthStore } from '@/stores/authStore';
import { ItineraryHome } from './ItineraryHome';
import { ItineraryBuilder } from './ItineraryBuilder';
import type { Itinerary } from '@/types';

type Props = { onExit: () => void };

export function ItineraryApp({ onExit }: Props) {
  const [mode, setMode] = useState<'list' | 'edit'>('list');
  const [current, setCurrent] = useState<Itinerary | null>(null);
  const user = useAuthStore((s) => s.currentUser);

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
