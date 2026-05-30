/** Các kênh hội thoại được hỗ trợ. */
export type ChannelId = "facebook" | "instagram" | "zalo_oa" | "zalo_pa";

/** Người gửi của một tin nhắn. */
export type SenderRole = "customer" | "ai" | "agent" | "system";

/** Trạng thái xử lý của hội thoại. */
export type ConversationStatus = "open" | "pending" | "resolved";

/** Chế độ vận hành của hội thoại: AI tự động, hoặc nhân viên tiếp quản. */
export type HandlingMode = "ai" | "human";

/** Cảm xúc suy luận từ nội dung khách hàng. */
export type Sentiment = "positive" | "neutral" | "negative";

export interface Agent {
  id: string;
  name: string;
  avatarUrl?: string;
  online: boolean;
  role: string;
}

export interface Message {
  id: string;
  conversationId: string;
  role: SenderRole;
  /** Tên hiển thị của người gửi (nhân viên, bot, hoặc khách). */
  authorName: string;
  content: string;
  createdAt: string; // ISO
  /** Đối với gợi ý của AI chưa gửi đi. */
  draft?: boolean;
  /** Độ tin cậy của AI (0..1) khi role === "ai". */
  confidence?: number;
}

export interface Customer {
  id: string;
  name: string;
  avatarUrl?: string;
  phone?: string;
  /** Tỉnh/thành theo cấu trúc 34 tỉnh (NQ 202/2025/QH15). */
  province?: string;
  tags: string[];
  /** Tổng chi tiêu lịch sử (VNĐ). */
  lifetimeValue?: number;
  ordersCount?: number;
}

export interface Conversation {
  id: string;
  channel: ChannelId;
  customer: Customer;
  status: ConversationStatus;
  mode: HandlingMode;
  /** Nhân viên đang phụ trách (khi mode === "human"). */
  assigneeId?: string;
  unreadCount: number;
  lastMessagePreview: string;
  lastMessageAt: string; // ISO
  sentiment: Sentiment;
  /** Cờ AI yêu cầu chuyển cho người (handoff). */
  needsHuman: boolean;
  tags: string[];
}

export interface ChannelMeta {
  id: ChannelId;
  label: string;
  shortLabel: string;
  /** Màu nhận diện kênh (hex). */
  color: string;
}
