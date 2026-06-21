import type { ElementType } from 'react';
import PlaceOutlinedIcon from '@mui/icons-material/PlaceOutlined';
import PublicOutlinedIcon from '@mui/icons-material/PublicOutlined';
import AnalyticsOutlinedIcon from '@mui/icons-material/AnalyticsOutlined';
import RouteOutlinedIcon from '@mui/icons-material/RouteOutlined';
import RestaurantMenuOutlinedIcon from '@mui/icons-material/RestaurantMenuOutlined';
import BadgeOutlinedIcon from '@mui/icons-material/BadgeOutlined';
import TranslateOutlinedIcon from '@mui/icons-material/TranslateOutlined';
import ConnectingAirportsOutlinedIcon from '@mui/icons-material/ConnectingAirportsOutlined';
import type { Template } from '@/types';

/** Màu nhấn + gradient + icon hiện đại riêng cho từng loại hồ sơ (dùng chung
 *  cho thẻ chọn hồ sơ và badge/pill trên header báo giá). */
export const TPL_ACCENT: Record<Template, { accent: string; grad: string; Icon: ElementType }> = {
  domestic:    { accent: '#e11d48', grad: 'linear-gradient(135deg,#fb7185,#e11d48 55%,#be123c)', Icon: PlaceOutlinedIcon },
  intl:        { accent: '#2563eb', grad: 'linear-gradient(135deg,#60a5fa,#2563eb 55%,#1d4ed8)', Icon: PublicOutlinedIcon },
  dmc:         { accent: '#7c3aed', grad: 'linear-gradient(135deg,#c084fc,#8b5cf6 55%,#7c3aed)', Icon: AnalyticsOutlinedIcon },
  itinerary:   { accent: '#0d9488', grad: 'linear-gradient(135deg,#2dd4bf,#14b8a6 55%,#0d9488)', Icon: RouteOutlinedIcon },
  menu:        { accent: '#ea580c', grad: 'linear-gradient(135deg,#fdba74,#f97316 55%,#ea580c)', Icon: RestaurantMenuOutlinedIcon },
  visa:        { accent: '#0891b2', grad: 'linear-gradient(135deg,#67e8f9,#22d3ee 50%,#0891b2)', Icon: BadgeOutlinedIcon },
  doctranslate:{ accent: '#475569', grad: 'linear-gradient(135deg,#94a3b8,#64748b 55%,#475569)', Icon: TranslateOutlinedIcon },
  guideschedule:{ accent: '#0369a1', grad: 'linear-gradient(135deg,#38bdf8,#0ea5e9 55%,#0369a1)', Icon: ConnectingAirportsOutlinedIcon },
};
