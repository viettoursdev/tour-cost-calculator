import type { AccountInfo, PublicClientApplication } from '@azure/msal-browser';
import type { EmailAccount, EmailMessage, SendEmailInput, SentEmailResult } from '@/types';

/**
 * Lớp trừu tượng cho nguồn email. Có HAI hiện thực cùng interface:
 *  - `mockProvider` — giả lập, dùng để dựng/demo UI khi CHƯA có Azure App.
 *  - `graphProvider` — thật, MSAL (đăng nhập M365) + Microsoft Graph (đọc/gửi).
 *
 * Chọn provider theo env: có `VITE_MS_CLIENT_ID` → graph, không có → mock. Nhờ vậy
 * khi IT đăng ký Azure App và cấp client id/tenant là TỰ bật, KHÔNG phải sửa UI/store.
 */
export interface EmailProvider {
  readonly kind: 'mock' | 'graph';
  /** Có thể gửi email đi (Mail.Send) hay không. */
  readonly canSend: boolean;
  /** Đăng nhập tài khoản Outlook (mở popup M365 với graph; gán tài khoản thử nghiệm với mock). */
  connect(): Promise<EmailAccount>;
  disconnect(): Promise<void>;
  getAccount(): EmailAccount | null;
  /** Khôi phục phiên đã đăng nhập trước đó mà KHÔNG bật popup (gọi lúc khởi động). */
  restore(): Promise<EmailAccount | null>;
  /** Tìm email theo từ khoá (địa chỉ khách, tên tour…). */
  search(query: string): Promise<EmailMessage[]>;
  /** Gửi một email (báo giá/hợp đồng) từ trong app. */
  send(input: SendEmailInput): Promise<SentEmailResult>;
}

// ── Cấu hình M365 (đọc từ env, do IT cấp) ───────────────────────────────────
const MS_CLIENT_ID = (import.meta.env.VITE_MS_CLIENT_ID as string | undefined)?.trim() || undefined;
const MS_TENANT_ID = (import.meta.env.VITE_MS_TENANT_ID as string | undefined)?.trim() || 'organizations';
// Quyền tối thiểu: đọc hồ sơ, đọc & gửi mail của người đăng nhập (delegated).
const SCOPES = ['User.Read', 'Mail.Read', 'Mail.Send'];
const GRAPH = 'https://graph.microsoft.com/v1.0';

/** Hình dạng (một phần) message trả về từ Graph /me/messages. */
interface GraphMessage {
  id: string;
  subject?: string;
  from?: { emailAddress?: { name?: string; address?: string } };
  toRecipients?: { emailAddress?: { address?: string } }[];
  receivedDateTime: string;
  bodyPreview?: string;
  webLink?: string;
}

// ── Provider thật: MSAL + Microsoft Graph ───────────────────────────────────
function createGraphProvider(): EmailProvider {
  let app: PublicClientApplication | null = null;
  let account: EmailAccount | null = null;

  // MSAL nạp động → nằm chunk riêng, không phình bundle chính.
  const getApp = async (): Promise<PublicClientApplication> => {
    if (app) return app;
    const { PublicClientApplication } = await import('@azure/msal-browser');
    app = new PublicClientApplication({
      auth: {
        clientId: MS_CLIENT_ID!,
        authority: `https://login.microsoftonline.com/${MS_TENANT_ID}`,
        redirectUri: `${window.location.origin}${import.meta.env.BASE_URL}`,
      },
      cache: { cacheLocation: 'localStorage' },
    });
    await app.initialize();
    return app;
  };

  const toAccount = (a: AccountInfo): EmailAccount => ({ name: a.name || a.username, address: a.username });

  // Lấy access token. interactive=false → chỉ thử im lặng (ném lỗi nếu chưa đăng nhập).
  const getToken = async (interactive: boolean): Promise<string> => {
    const a = await getApp();
    let acc = a.getActiveAccount() ?? a.getAllAccounts()[0] ?? null;
    if (!acc) {
      if (!interactive) throw new Error('Chưa đăng nhập Outlook');
      const res = await a.loginPopup({ scopes: SCOPES });
      acc = res.account;
      a.setActiveAccount(acc);
    }
    try {
      const res = await a.acquireTokenSilent({ scopes: SCOPES, account: acc });
      return res.accessToken;
    } catch {
      if (!interactive) throw new Error('Phiên Outlook đã hết hạn, cần kết nối lại');
      const res = await a.acquireTokenPopup({ scopes: SCOPES, account: acc });
      a.setActiveAccount(res.account ?? acc);
      return res.accessToken;
    }
  };

  const graphToMessage = (m: GraphMessage): EmailMessage => ({
    id: m.id,
    subject: m.subject || '(không tiêu đề)',
    fromName: m.from?.emailAddress?.name ?? '',
    fromAddress: m.from?.emailAddress?.address ?? '',
    toAddress: m.toRecipients?.[0]?.emailAddress?.address,
    receivedAt: m.receivedDateTime,
    preview: m.bodyPreview ?? '',
    webLink: m.webLink,
  });

  return {
    kind: 'graph',
    canSend: true,

    async connect() {
      await getToken(true); // bật popup đăng nhập nếu cần
      const a = await getApp();
      const acc = a.getActiveAccount() ?? a.getAllAccounts()[0]!;
      account = toAccount(acc);
      return account;
    },

    async disconnect() {
      const a = await getApp();
      const acc = a.getActiveAccount();
      account = null;
      if (acc) await a.logoutPopup({ account: acc }).catch(() => {});
    },

    getAccount() {
      return account;
    },

    async restore() {
      try {
        const a = await getApp();
        const acc = a.getActiveAccount() ?? a.getAllAccounts()[0] ?? null;
        if (!acc) return null;
        a.setActiveAccount(acc);
        await a.acquireTokenSilent({ scopes: SCOPES, account: acc }); // xác nhận token còn dùng được
        account = toAccount(acc);
        return account;
      } catch {
        return null; // chưa đăng nhập / token hỏng → coi như chưa kết nối
      }
    },

    async search(query) {
      const token = await getToken(false);
      const params = new URLSearchParams({
        $top: '12',
        $select: 'id,subject,from,toRecipients,receivedDateTime,bodyPreview,webLink',
      });
      const q = query.trim();
      const headers: Record<string, string> = { Authorization: `Bearer ${token}` };
      if (q) {
        // $search KHÔNG kết hợp được $orderby và cần ConsistencyLevel: eventual.
        params.set('$search', `"${q.replace(/"/g, '')}"`);
        headers.ConsistencyLevel = 'eventual';
      } else {
        params.set('$orderby', 'receivedDateTime desc');
      }
      const res = await fetch(`${GRAPH}/me/messages?${params}`, { headers });
      if (!res.ok) throw new Error(`Graph tìm email lỗi ${res.status}: ${await res.text()}`);
      const data = await res.json();
      return (data.value as GraphMessage[]).map(graphToMessage);
    },

    async send(input) {
      const token = await getToken(true);
      const payload = {
        message: {
          subject: input.subject,
          body: { contentType: 'HTML', content: input.bodyHtml },
          toRecipients: input.to.map((address) => ({ emailAddress: { address } })),
          ccRecipients: (input.cc ?? []).map((address) => ({ emailAddress: { address } })),
          attachments: (input.attachments ?? []).map((att) => ({
            '@odata.type': '#microsoft.graph.fileAttachment',
            name: att.filename,
            contentType: att.contentType,
            contentBytes: att.contentBytes,
          })),
        },
        saveToSentItems: true,
      };
      const res = await fetch(`${GRAPH}/me/sendMail`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(`Graph gửi email lỗi ${res.status}: ${await res.text()}`);
      return { sentAt: new Date().toISOString() }; // sendMail trả 202 không có id
    },
  };
}

// ── Provider giả lập (dựng/demo UI khi chưa có Azure App) ────────────────────
const ago = (days: number, h = 9) => {
  const d = new Date();
  d.setDate(d.getDate() - days);
  d.setHours(h, 0, 0, 0);
  return d.toISOString();
};

// Dữ liệu mẫu cho giai đoạn dựng khung — thay bằng kết quả Graph khi tích hợp thật.
const SAMPLE: EmailMessage[] = [
  { id: 'm1', subject: 'Re: Báo giá tour Nhật Bản 5N4Đ cho đoàn 25 khách', fromName: 'Nguyễn Văn An', fromAddress: 'an.nguyen@abccorp.vn', toAddress: 'sales@viettours.com.vn', receivedAt: ago(1), preview: 'Cảm ơn anh/chị đã gửi báo giá. Bên em muốn xác nhận lịch khởi hành và xin thêm phương án khách sạn 5 sao…', webLink: 'https://outlook.office.com/mail/' },
  { id: 'm2', subject: 'Yêu cầu báo giá team building Đà Nẵng', fromName: 'Trần Thu Hà', fromAddress: 'ha.tran@deltagroup.com.vn', toAddress: 'info@viettours.com.vn', receivedAt: ago(2), preview: 'Công ty em dự kiến tổ chức team building 120 người tại Đà Nẵng cuối tháng 7, nhờ bên mình tư vấn…', webLink: 'https://outlook.office.com/mail/' },
  { id: 'm3', subject: 'Hợp đồng tour Hàn Quốc — ký xác nhận', fromName: 'Lê Minh Quân', fromAddress: 'quan.le@omegatravel.vn', toAddress: 'sales@viettours.com.vn', receivedAt: ago(3), preview: 'Gửi anh/chị bản hợp đồng đã ký đóng dấu, nhờ xác nhận đặt cọc đợt 1…', webLink: 'https://outlook.office.com/mail/' },
  { id: 'm4', subject: 'Re: Lịch trình chi tiết tour Châu Âu 9N8Đ', fromName: 'Phạm Bảo Ngọc', fromAddress: 'ngoc.pham@abccorp.vn', toAddress: 'sales@viettours.com.vn', receivedAt: ago(5), preview: 'Đoàn muốn điều chỉnh thêm 1 đêm tại Paris và đổi bữa tối ngày 4, nhờ bên mình cập nhật giúp…', webLink: 'https://outlook.office.com/mail/' },
  { id: 'm5', subject: 'Thanh toán đợt 2 tour MICE Singapore', fromName: 'Hoàng Thị Mai', fromAddress: 'mai.hoang@deltagroup.com.vn', toAddress: 'ketoan@viettours.com.vn', receivedAt: ago(8), preview: 'Bên em đã chuyển khoản đợt 2, gửi anh/chị uỷ nhiệm chi đính kèm để đối soát…', webLink: 'https://outlook.office.com/mail/' },
  { id: 'm6', subject: 'Hỏi visa Schengen cho đoàn 12 khách', fromName: 'Đỗ Quốc Khánh', fromAddress: 'khanh.do@omegatravel.vn', toAddress: 'visa@viettours.com.vn', receivedAt: ago(11), preview: 'Nhờ bên mình tư vấn hồ sơ và thời gian xử lý visa Schengen cho đoàn khởi hành tháng 9…', webLink: 'https://outlook.office.com/mail/' },
];

function createMockProvider(): EmailProvider {
  let account: EmailAccount | null = null;
  return {
    kind: 'mock',
    canSend: true,
    async connect() {
      await new Promise((r) => setTimeout(r, 300));
      account = { name: 'Tài khoản thử nghiệm', address: 'demo@viettours.com.vn' };
      return account;
    },
    async disconnect() { account = null; },
    getAccount() { return account; },
    async restore() { return account; },
    async search(query) {
      await new Promise((r) => setTimeout(r, 250));
      const q = query.trim().toLowerCase();
      if (!q) return SAMPLE.slice(0, 8);
      return SAMPLE.filter((m) =>
        [m.subject, m.fromName, m.fromAddress, m.toAddress, m.preview].filter(Boolean).join(' ').toLowerCase().includes(q));
    },
    async send(input) {
      await new Promise((r) => setTimeout(r, 400));
      // eslint-disable-next-line no-console
      console.info('[mock email] gửi tới', input.to.join(', '), '·', input.subject, `(${input.attachments?.length ?? 0} tệp)`);
      return { messageId: 'mock-' + Date.now().toString(36), sentAt: new Date().toISOString() };
    },
  };
}

// Có client id (IT đã cấp) → dùng Graph thật; chưa có → mock.
export const emailProvider: EmailProvider = MS_CLIENT_ID ? createGraphProvider() : createMockProvider();
export const isMockEmail = emailProvider.kind === 'mock';
