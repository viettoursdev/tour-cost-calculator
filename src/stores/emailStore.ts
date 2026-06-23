import { create } from 'zustand';
import { sbSubscribeEmailLinks, sbPushEmailLinks } from '@/lib/supabase';
import { emailProvider } from '@/lib/email/provider';
import { useAuthStore } from './authStore';
import type { EmailAccount, EmailLink, EmailLinkTarget, EmailMessage, SendEmailInput } from '@/types';
import type { Unsubscribe } from '@/lib/supabase/helpers';

const newId = () => 'eml' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

type State = {
  connected: boolean;
  account: EmailAccount | null;
  connecting: boolean;
  sending: boolean;
  canSend: boolean;
  links: EmailLink[];
  loading: boolean;
  init: () => Unsubscribe;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  linkEmail: (email: EmailMessage, target: { type: EmailLinkTarget; id: string; name?: string }) => Promise<void>;
  unlink: (linkId: string) => Promise<void>;
  /** Gửi email; nếu có `target` thì ghi một liên kết outbound vào email_links. Trả về true nếu gửi xong. */
  sendEmail: (input: SendEmailInput, target?: { type: EmailLinkTarget; id: string; name?: string }) => Promise<boolean>;
};

export const useEmailStore = create<State>()((set, get) => ({
  connected: emailProvider.getAccount() != null,
  account: emailProvider.getAccount(),
  connecting: false,
  sending: false,
  canSend: emailProvider.canSend,
  links: [],
  loading: true,

  init: () => {
    const unsub = sbSubscribeEmailLinks((links) => set({ links, loading: false }));
    // Khôi phục phiên Outlook đã đăng nhập (không bật popup) nếu có.
    void emailProvider.restore().then((acc) => { if (acc) set({ connected: true, account: acc }); }).catch(() => {});
    return unsub;
  },

  connect: async () => {
    set({ connecting: true });
    try {
      const acc = await emailProvider.connect();
      set({ connected: true, account: acc });
    } catch (e) {
      window.alert('❌ Kết nối Outlook lỗi: ' + (e as Error).message);
    } finally {
      set({ connecting: false });
    }
  },

  disconnect: async () => {
    await emailProvider.disconnect();
    set({ connected: false, account: null });
  },

  linkEmail: async (email, target) => {
    const u = useAuthStore.getState().currentUser;
    if (!u) return;
    const { links } = get();
    if (links.some((l) => l.emailId === email.id && l.targetType === target.type && l.targetId === target.id)) return; // đã gắn
    const link: EmailLink = {
      id: newId(),
      emailId: email.id, subject: email.subject, fromName: email.fromName,
      fromAddress: email.fromAddress, receivedAt: email.receivedAt, webLink: email.webLink,
      targetType: target.type, targetId: target.id, targetName: target.name,
      linkedBy: u.name, linkedAt: new Date().toISOString(),
    };
    const next = [link, ...links];
    set({ links: next });
    try { await sbPushEmailLinks(next, { name: u.name, role: u.role }); }
    catch (e) { window.alert('❌ Lỗi gắn email: ' + (e as Error).message); set({ links }); }
  },

  unlink: async (linkId) => {
    const u = useAuthStore.getState().currentUser;
    if (!u) return;
    const prev = get().links;
    const next = prev.filter((l) => l.id !== linkId);
    set({ links: next });
    try { await sbPushEmailLinks(next, { name: u.name, role: u.role }); }
    catch (e) { window.alert('❌ Lỗi gỡ email: ' + (e as Error).message); set({ links: prev }); }
  },

  sendEmail: async (input, target) => {
    set({ sending: true });
    try {
      const res = await emailProvider.send(input);
      // Ghi một liên kết outbound để theo dõi báo giá/hợp đồng đã gửi đi.
      const u = useAuthStore.getState().currentUser;
      if (target && u) {
        const { account, links } = get();
        const link: EmailLink = {
          id: newId(),
          emailId: res.messageId ?? 'sent-' + Date.now().toString(36),
          subject: input.subject,
          fromName: account?.name ?? u.name,
          fromAddress: account?.address ?? '',
          toAddress: input.to.join(', '),
          receivedAt: res.sentAt,
          direction: 'out',
          targetType: target.type, targetId: target.id, targetName: target.name,
          linkedBy: u.name, linkedAt: res.sentAt,
        };
        const next = [link, ...links];
        set({ links: next });
        try { await sbPushEmailLinks(next, { name: u.name, role: u.role }); }
        catch (e) { window.alert('⚠️ Đã gửi email nhưng ghi nhật ký lỗi: ' + (e as Error).message); set({ links }); }
      }
      return true;
    } catch (e) {
      window.alert('❌ Gửi email lỗi: ' + (e as Error).message);
      return false;
    } finally {
      set({ sending: false });
    }
  },
}));
