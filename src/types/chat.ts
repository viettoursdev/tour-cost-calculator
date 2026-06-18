/** File đính kèm trong tin nhắn chat (lưu R2 qua Worker). */
export type ChatFile = { key: string; name: string; size: number; mime?: string };

/** Trích dẫn ngắn của tin được trả lời (snapshot, không phụ thuộc tin gốc). */
export type ChatReply = { id: string; byName: string; text: string };

export type ChatMessage = {
  id: string;
  by: string;       // username
  byName: string;
  at: string;       // ISO
  text?: string;
  file?: ChatFile;
  replyTo?: ChatReply;
  editedAt?: string;                    // ISO — đã chỉnh sửa
  deleted?: boolean;                    // đã thu hồi
  reactions?: Record<string, string[]>; // emoji → danh sách username
};

/** Một cuộc trò chuyện (1-1 hoặc nhóm) giữa các tài khoản. */
export type Chat = {
  id: string;
  members: string[];     // usernames
  isGroup: boolean;
  title?: string;        // tên nhóm (chỉ nhóm)
  createdBy: string;
  createdAt: string;
  messages: ChatMessage[];
  lastAt?: string;       // thời điểm tin cuối (sắp xếp danh sách)
  lastText?: string;     // preview tin cuối
  lastByName?: string;
  /** Lần đọc gần nhất của từng thành viên (ISO) — để đếm chưa đọc. */
  reads?: Record<string, string>;
};
