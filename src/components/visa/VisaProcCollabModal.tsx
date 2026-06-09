// Stub — full implementation in PR Visa Task 7.
import type { VisaProcDoc } from '@/types';

type Props = {
  doc: VisaProcDoc;
  onClose: () => void;
  onChange: (collabs: string[]) => void;
};

export function VisaProcCollabModal({ onClose }: Props) {
  return (
    <div onClick={onClose} style={{ display: 'none' }} />
  );
}
