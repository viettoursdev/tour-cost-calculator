import { useAuthStore } from '@/stores/authStore';
import { useVisaProcStore } from '@/stores/visaProcStore';
import { newVisaProcDoc } from './constants';
import { VisaProcHome } from './VisaProcHome';
import type { VisaProcDoc } from '@/types';

type Props = {
  onOpenEditor: (doc: VisaProcDoc) => void;
};

export function VisaProcManager({ onOpenEditor }: Props) {
  const list = useVisaProcStore((s) => s.list);
  const loading = useVisaProcStore((s) => s.loading);
  const user = useAuthStore((s) => s.currentUser);

  if (!user) return null;

  const visible = list.filter((x) =>
    x.createdByUsername === user.u
    || (x.collaborators ?? []).includes(user.u)
    || user.role === 'CEO',
  );

  const openNew = () => onOpenEditor(newVisaProcDoc(user));
  const openExisting = async (id: string) => {
    const full = await useVisaProcStore.getState().load(id);
    if (full) onOpenEditor(full);
    else window.alert('Không tải được hồ sơ.');
  };

  return (
    <VisaProcHome
      list={visible}
      loading={loading}
      currentUsername={user.u}
      onNew={openNew}
      onOpen={(id) => void openExisting(id)}
    />
  );
}
