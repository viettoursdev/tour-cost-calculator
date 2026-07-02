import { useEffect, useState } from 'react';
import {
  AppBar, Avatar, Badge, Box, IconButton, Menu, MenuItem, Stack,
  Toolbar, Tooltip, Typography,
} from '@mui/material';
import ChatBubbleOutlineIcon from '@mui/icons-material/ChatBubbleOutline';
import PeopleIcon from '@mui/icons-material/People';
import CloudSyncIcon from '@mui/icons-material/CloudSync';
import PowerSettingsNewIcon from '@mui/icons-material/PowerSettingsNew';
import SettingsOutlinedIcon from '@mui/icons-material/SettingsOutlined';
import SearchIcon from '@mui/icons-material/Search';
import SupportAgentIcon from '@mui/icons-material/SupportAgent';
import MenuBookOutlinedIcon from '@mui/icons-material/MenuBookOutlined';
import { QuoteView } from '@/components/quote/QuoteView';
import { GlobalSearch } from '@/components/search/GlobalSearch';
import { AssistantPanel } from '@/components/assistant/AssistantPanel';
import { ChatPanel } from '@/components/chat/ChatPanel';
import { FilePreviewHost } from '@/components/common/FilePreviewHost';
import { OnboardingDialog } from '@/components/shell/OnboardingDialog';
import { WhatsNewDialog } from '@/components/shell/WhatsNewDialog';
import { unseenWhatsNew, markWhatsNewSeen, type WhatsNewEntry } from '@/lib/whatsNew';
import { useChatStore, chatUnread } from '@/stores/chatStore';
import HelpOutlineIcon from '@mui/icons-material/HelpOutline';
import { NotificationBell } from '@/components/notifications/NotificationBell';
import { NotificationCenter } from '@/components/notifications/NotificationCenter';
import { NotificationToaster } from '@/components/notifications/NotificationToaster';
import { UserManagementModal } from '@/components/admin/UserManagementModal';
import { RateCardSyncModal } from '@/components/admin/RateCardSyncModal';
import { SettingsDialog } from '@/components/settings/SettingsDialog';
import { useAuthStore } from '@/stores/authStore';
import { useNotificationStore } from '@/stores/notificationStore';
import { useQuoteStore } from '@/stores/quoteStore';
import { tagForContext } from '@/components/shell/guideSteps';
import { hasPerm } from '@/auth/PERMISSIONS';
import { canViewStaffRole } from '@/auth/ROLES';
import { DEPT_LABEL } from '@/auth/departments';
import { VTE_LOGO } from '@/lib/exports/vteLogo';
import { LEGACY } from '@/theme';

/** Viết tắt chữ cái đầu mỗi từ trong tên (tối đa 3 ký tự). VD "Hoàng Anh Tuấn" → "HAT". */
function initialsOf(name: string): string {
  return name.trim().split(/\s+/).filter(Boolean).map((w) => w[0]).join('').toUpperCase().slice(0, 3) || '?';
}

// Navigation is a single unified tab bar inside QuoteToolbar (legacy layout):
// Chi phí · Tổng kết & Định giá · Dashboard · Thanh toán · Lịch sử · Hợp đồng ·
// Khách hàng · NCC — so AppShell just renders the global account bar + QuoteView.

export function AppShell() {
  const currentUser = useAuthStore((s) => s.currentUser);
  const signOut = useAuthStore((s) => s.signOut);
  const [userMgrOpen, setUserMgrOpen] = useState(false);
  const [rateSyncOpen, setRateSyncOpen] = useState(false);
  const canManageUsers = hasPerm(currentUser, 'manageUsers');
  const centerOpen = useNotificationStore((s) => s.centerOpen);
  const setCenterOpen = useNotificationStore((s) => s.setCenterOpen);
  const [searchOpen, setSearchOpen] = useState(false);
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [helpAnchor, setHelpAnchor] = useState<HTMLElement | null>(null);
  const chats = useChatStore((s) => s.chats);
  const chatUnreadCount = currentUser ? chats.filter((c) => chatUnread(c, currentUser.u)).length : 0;

  const onboardKey = currentUser ? `vte_onboarded_${currentUser.u}` : '';
  const [onboardOpen, setOnboardOpen] = useState(false);
  const [onboardContext, setOnboardContext] = useState<string | undefined>(undefined);
  const tplForGuide = useQuoteStore((s) => s.draft.template);
  const viewForGuide = useQuoteStore((s) => s.view);
  // ⚙️ Cài đặt cá nhân — gom theme/mật độ + tùy biến nav + trang Hôm nay về một chỗ.
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [whatsNewOpen, setWhatsNewOpen] = useState(false);
  const [whatsNewEntries, setWhatsNewEntries] = useState<WhatsNewEntry[] | undefined>(undefined);
  const [unseenNew, setUnseenNew] = useState(0);
  useEffect(() => {
    if (!currentUser) return;
    let onboarded = true;
    try { onboarded = !!localStorage.getItem(`vte_onboarded_${currentUser.u}`); } catch { /* ignore */ }
    if (!onboarded) { setOnboardOpen(true); return; }
    // Đã onboard rồi → hiện "Có gì mới" nếu có cập nhật chưa xem.
    const unseen = unseenWhatsNew(currentUser.u);
    setUnseenNew(unseen.length);
    if (unseen.length) { setWhatsNewEntries(unseen); setWhatsNewOpen(true); }
  }, [currentUser?.u]); // eslint-disable-line react-hooks/exhaustive-deps
  const closeOnboard = () => {
    try { localStorage.setItem(onboardKey, '1'); } catch { /* ignore */ }
    // User mới: đánh dấu đã xem các cập nhật hiện có để không bị dồn ngay sau onboarding.
    if (currentUser) { markWhatsNewSeen(currentUser.u); setUnseenNew(0); }
    setOnboardOpen(false);
  };
  const closeWhatsNew = () => {
    if (currentUser) { markWhatsNewSeen(currentUser.u); setUnseenNew(0); }
    setWhatsNewOpen(false);
  };
  const openWhatsNew = () => { setWhatsNewEntries(undefined); setWhatsNewOpen(true); };

  // Logo Viettours trên header = nút về màn "Bạn muốn tạo gì hôm nay?" (hiện trên MỌI màn hình).
  const goHome = () => useQuoteStore.getState().openSelector();

  // Mở Thư viện kiến thức nội bộ từ header. Cần có draft để QuoteView render view 'library' —
  // chưa có thì tạo nháp nội địa (dữ liệu thư viện độc lập), giống gotoManage ở màn chọn hồ sơ.
  const goLibrary = () => {
    const st = useQuoteStore.getState();
    if (st.draft.template === null) st.newDraft('domestic');
    st.setView('library');
  };

  // Phím tắt ⌘K / Ctrl+K mở tìm kiếm toàn cục.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault();
        setSearchOpen((v) => !v);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Nút icon đồng bộ trên thanh header teal — gọn, đều, có tooltip tên đầy đủ.
  const headBtnSx = {
    color: '#fff', width: 36, height: 36, borderRadius: 2,
    background: 'rgba(255,255,255,0.14)', border: '1px solid rgba(255,255,255,0.28)',
    '&:hover': { background: 'rgba(255,255,255,0.26)' },
  } as const;
  const headDivider = (
    <Box sx={{ width: '1px', alignSelf: 'stretch', my: 0.75, background: 'rgba(255,255,255,0.25)' }} />
  );

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <AppBar position="static" color="primary" sx={{ background: LEGACY.headerGradient }}>
        <Toolbar variant="dense" sx={{ gap: 1, minHeight: 52 }}>
          <Stack direction="row" alignItems="center" spacing={1.25} sx={{ flexGrow: 1, minWidth: 0 }}>
            <Tooltip title="Về Trang chủ">
              <Box
                component="img" src={VTE_LOGO} alt="Về Trang chủ" role="button" tabIndex={0}
                onClick={goHome}
                onKeyDown={(e: React.KeyboardEvent) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); goHome(); } }}
                sx={{
                  height: 36, width: 'auto', display: 'block', flexShrink: 0,
                  filter: 'brightness(0) invert(1)', cursor: 'pointer',
                  transition: 'opacity .15s, transform .15s',
                  '&:hover': { opacity: 0.82, transform: 'scale(1.03)' },
                }}
              />
            </Tooltip>
            <Typography variant="h6" sx={{ fontWeight: 800, display: { xs: 'none', sm: 'block' } }} noWrap>
              Phần mềm quản lý - Viettours
            </Typography>
          </Stack>
          {currentUser && (
            <Stack direction="row" alignItems="center" spacing={0.75} flexWrap="wrap" useFlexGap>
              {/* Tài khoản — gọn: chỉ badge viết tắt chữ cái đầu (VD "HAT"); chức vụ/phòng ban CHỈ CEO mới thấy */}
              <Tooltip title={canViewStaffRole(currentUser)
                ? `${currentUser.name} · ${currentUser.role}${currentUser.department ? ` · ${DEPT_LABEL[currentUser.department]}` : ''}`
                : currentUser.name}>
                <Avatar sx={{ width: 34, height: 34, bgcolor: '#dc3250', fontSize: 12.5, fontWeight: 800, border: '1px solid rgba(255,255,255,0.4)' }}>
                  {initialsOf(currentUser.name)}
                </Avatar>
              </Tooltip>

              {headDivider}

              <Tooltip title="Tìm kiếm (Ctrl/⌘ + K)">
                <IconButton sx={headBtnSx} onClick={() => setSearchOpen(true)}><SearchIcon fontSize="small" /></IconButton>
              </Tooltip>
              <Tooltip title="Thư viện kiến thức nội bộ">
                <IconButton sx={headBtnSx} onClick={goLibrary}><MenuBookOutlinedIcon fontSize="small" /></IconButton>
              </Tooltip>
              <Tooltip title="Trợ lý ảo">
                <IconButton sx={headBtnSx} onClick={() => setAssistantOpen(true)}>
                  <SupportAgentIcon fontSize="small" />
                </IconButton>
              </Tooltip>
              <Tooltip title="Tin nhắn nội bộ">
                <IconButton sx={headBtnSx} onClick={() => setChatOpen(true)}>
                  <Badge badgeContent={chatUnreadCount} color="error"><ChatBubbleOutlineIcon fontSize="small" /></Badge>
                </IconButton>
              </Tooltip>
              <NotificationBell sx={headBtnSx} />

              {headDivider}

              <Tooltip title="Master Rate Card">
                <IconButton sx={headBtnSx} onClick={() => setRateSyncOpen(true)}><CloudSyncIcon fontSize="small" /></IconButton>
              </Tooltip>
              {canManageUsers && (
                <Tooltip title="Quản lý tài khoản">
                  <IconButton sx={headBtnSx} onClick={() => setUserMgrOpen(true)}><PeopleIcon fontSize="small" /></IconButton>
                </Tooltip>
              )}
              <Tooltip title="Trợ giúp · Có gì mới">
                <IconButton sx={headBtnSx} onClick={(e) => setHelpAnchor(e.currentTarget)}>
                  <Badge badgeContent={unseenNew} color="error"><HelpOutlineIcon fontSize="small" /></Badge>
                </IconButton>
              </Tooltip>
              <Menu anchorEl={helpAnchor} open={!!helpAnchor} onClose={() => setHelpAnchor(null)}>
                <MenuItem onClick={() => { setOnboardContext(tagForContext(tplForGuide, viewForGuide)); setOnboardOpen(true); setHelpAnchor(null); }}>
                  🧭 Hướng dẫn màn hình này
                </MenuItem>
                <MenuItem onClick={() => { setOnboardContext(undefined); setOnboardOpen(true); setHelpAnchor(null); }}>
                  📚 Toàn bộ hướng dẫn
                </MenuItem>
                <MenuItem onClick={() => { openWhatsNew(); setHelpAnchor(null); }}>
                  ✨ Có gì mới{unseenNew > 0 ? ` (${unseenNew})` : ''}
                </MenuItem>
              </Menu>
              <Tooltip title="Cài đặt cá nhân">
                <IconButton sx={headBtnSx} onClick={() => setSettingsOpen(true)}>
                  <SettingsOutlinedIcon fontSize="small" />
                </IconButton>
              </Tooltip>
              <Tooltip title="Đăng xuất">
                <IconButton
                  onClick={() => { void signOut(); }}
                  sx={{ ...headBtnSx, '&:hover': { background: 'rgba(220,50,80,0.5)' } }}
                >
                  <PowerSettingsNewIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            </Stack>
          )}
        </Toolbar>
      </AppBar>
      <Box sx={{ flexGrow: 1, overflow: 'auto', overscrollBehavior: 'contain' }}>
        <QuoteView />
      </Box>
      {userMgrOpen && currentUser && (
        <UserManagementModal
          open
          onClose={() => setUserMgrOpen(false)}
          currentUser={currentUser}
        />
      )}
      {rateSyncOpen && currentUser && (
        <RateCardSyncModal
          open
          onClose={() => setRateSyncOpen(false)}
          currentUser={currentUser}
        />
      )}

      {/* Single global instance — opened from any bell or a toast click. */}
      <NotificationToaster />
      <NotificationCenter open={centerOpen} onClose={() => setCenterOpen(false)} />
      <GlobalSearch open={searchOpen} onClose={() => setSearchOpen(false)} />
      <AssistantPanel open={assistantOpen} onClose={() => setAssistantOpen(false)} />
      <ChatPanel open={chatOpen} onClose={() => setChatOpen(false)} />
      <SettingsDialog open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      <OnboardingDialog open={onboardOpen} onClose={closeOnboard} contextTag={onboardContext} />
      <WhatsNewDialog open={whatsNewOpen} onClose={closeWhatsNew} entries={whatsNewEntries} />
      <FilePreviewHost />
    </Box>
  );
}
