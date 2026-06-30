import { Chip } from '@mui/material';
import FolderSpecialOutlinedIcon from '@mui/icons-material/FolderSpecialOutlined';
import { useTourProfileStore } from '@/stores/tourProfileStore';
import { openTourProfile } from '@/lib/tourProfileNav';

/**
 * Chip "📁 Hồ sơ: <CODE>" hiển thị trên đầu trình soạn thảo của các thực thể
 * (thực đơn / chương trình / visa / hợp đồng) đã gắn vào một hồ sơ tour. Bấm để mở
 * hồ sơ — điều hướng NGƯỢC từ thực thể về hồ sơ trung tâm (chọn qua lại được).
 * Không render gì nếu thực thể chưa gắn hồ sơ.
 */
export function TourProfileLinkChip({
  tourProfileId,
  confirmLeave = true,
  light = false,
  beforeNavigate,
}: {
  tourProfileId?: string | null;
  confirmLeave?: boolean;
  /** Kiểu sáng (viền/chữ trắng) cho thanh header nền tối (teal). */
  light?: boolean;
  /** Gọi ngay trước khi điều hướng (vd đóng modal đang mở). */
  beforeNavigate?: () => void;
}) {
  const profile = useTourProfileStore((s) =>
    tourProfileId ? s.profiles.find((p) => p.id === tourProfileId) : undefined,
  );
  if (!tourProfileId) return null;
  const label = profile ? `Hồ sơ: ${profile.code}` : 'Hồ sơ tour';
  const onClick = () => {
    if (confirmLeave && !window.confirm('Rời màn hình hiện tại để mở hồ sơ tour? Thay đổi chưa lưu có thể mất.')) return;
    beforeNavigate?.();
    openTourProfile(tourProfileId);
  };
  return (
    <Chip
      size="small"
      color="primary"
      variant="outlined"
      clickable
      icon={<FolderSpecialOutlinedIcon sx={light ? { color: '#fff !important' } : undefined} />}
      label={label}
      onClick={onClick}
      title="Mở hồ sơ tour liên kết"
      sx={light ? { color: '#fff', borderColor: 'rgba(255,255,255,0.7)', '&:hover': { borderColor: '#fff', background: 'rgba(255,255,255,0.14)' } } : undefined}
    />
  );
}
