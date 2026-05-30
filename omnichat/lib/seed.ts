import type { Agent, Conversation, Message } from "./types";

/** Mốc thời gian tương đối so với hiện tại để dữ liệu mẫu luôn "tươi". */
const now = Date.now();
const min = (m: number) => new Date(now - m * 60_000).toISOString();

export const AGENTS: Agent[] = [
  {
    id: "agent-1",
    name: "Trần Diệu Phương",
    role: "Trưởng nhóm CSKH",
    online: true,
  },
  { id: "agent-2", name: "Lê Minh Khoa", role: "Tư vấn bán hàng", online: true },
  {
    id: "agent-3",
    name: "Nguyễn Thu Hà",
    role: "Tư vấn bán hàng",
    online: false,
  },
];

/** Nhân viên đang đăng nhập (demo). */
export const CURRENT_AGENT = AGENTS[0];

export const CONVERSATIONS: Conversation[] = [
  {
    id: "c1",
    channel: "facebook",
    customer: {
      id: "u1",
      name: "Phạm Quỳnh Anh",
      phone: "0905 123 456",
      province: "TP. Hải Phòng",
      tags: ["Khách thân thiết", "Áo khoác"],
      lifetimeValue: 4850000,
      ordersCount: 7,
    },
    status: "open",
    mode: "ai",
    unreadCount: 2,
    lastMessagePreview: "Áo khoác phao này còn size M màu be không shop?",
    lastMessageAt: min(2),
    sentiment: "positive",
    needsHuman: false,
    tags: ["Tư vấn sản phẩm"],
  },
  {
    id: "c2",
    channel: "zalo_oa",
    customer: {
      id: "u2",
      name: "Đỗ Văn Cường",
      phone: "0912 888 777",
      province: "Tỉnh Hưng Yên",
      tags: ["Đơn #YD90231"],
      lifetimeValue: 1290000,
      ordersCount: 2,
    },
    status: "pending",
    mode: "human",
    assigneeId: "agent-1",
    unreadCount: 0,
    lastMessagePreview: "Đơn của mình giao tới đâu rồi ạ? 3 ngày chưa thấy.",
    lastMessageAt: min(18),
    sentiment: "negative",
    needsHuman: true,
    tags: ["Khiếu nại giao hàng"],
  },
  {
    id: "c3",
    channel: "instagram",
    customer: {
      id: "u3",
      name: "Lan Hương",
      province: "TP. Hồ Chí Minh",
      tags: ["Khách mới"],
      lifetimeValue: 0,
      ordersCount: 0,
    },
    status: "open",
    mode: "ai",
    unreadCount: 1,
    lastMessagePreview: "Set đồ trong story mới đăng có bán không ạ?",
    lastMessageAt: min(35),
    sentiment: "positive",
    needsHuman: false,
    tags: ["Tư vấn sản phẩm"],
  },
  {
    id: "c4",
    channel: "zalo_pa",
    customer: {
      id: "u4",
      name: "Vũ Thị Mai",
      phone: "0987 222 333",
      province: "TP. Hà Nội",
      tags: ["Đổi trả"],
      lifetimeValue: 2150000,
      ordersCount: 4,
    },
    status: "open",
    mode: "human",
    assigneeId: "agent-2",
    unreadCount: 0,
    lastMessagePreview: "Mình muốn đổi size áo đã mua hôm qua được không?",
    lastMessageAt: min(54),
    sentiment: "neutral",
    needsHuman: false,
    tags: ["Đổi trả"],
  },
  {
    id: "c5",
    channel: "facebook",
    customer: {
      id: "u5",
      name: "Hoàng Gia Bảo",
      province: "TP. Đà Nẵng",
      tags: ["Khách thân thiết"],
      lifetimeValue: 7320000,
      ordersCount: 12,
    },
    status: "resolved",
    mode: "ai",
    unreadCount: 0,
    lastMessagePreview: "Cảm ơn shop nhé, đặt thành công rồi ạ!",
    lastMessageAt: min(180),
    sentiment: "positive",
    needsHuman: false,
    tags: ["Chốt đơn"],
  },
];

export const MESSAGES: Message[] = [
  // c1 — Facebook
  {
    id: "m1",
    conversationId: "c1",
    role: "customer",
    authorName: "Phạm Quỳnh Anh",
    content: "Chào shop, mình thấy mẫu áo khoác phao bên mình đẹp quá.",
    createdAt: min(6),
  },
  {
    id: "m2",
    conversationId: "c1",
    role: "ai",
    authorName: "YODY AI",
    confidence: 0.92,
    content:
      "Dạ YODY chào chị Quỳnh Anh ạ! 🧥 Áo khoác phao mùa này đang là sản phẩm bán chạy với chất liệu lông vũ siêu nhẹ, giữ ấm tốt. Chị đang quan tâm màu nào để em tư vấn size giúp mình ạ?",
    createdAt: min(5),
  },
  {
    id: "m3",
    conversationId: "c1",
    role: "customer",
    authorName: "Phạm Quỳnh Anh",
    content: "Áo khoác phao này còn size M màu be không shop?",
    createdAt: min(2),
  },
  // c2 — Zalo OA (đã handoff)
  {
    id: "m4",
    conversationId: "c2",
    role: "customer",
    authorName: "Đỗ Văn Cường",
    content: "Đơn của mình giao tới đâu rồi ạ? 3 ngày chưa thấy.",
    createdAt: min(20),
  },
  {
    id: "m5",
    conversationId: "c2",
    role: "ai",
    authorName: "YODY AI",
    confidence: 0.41,
    content:
      "Dạ em rất tiếc về sự chậm trễ này. Trường hợp tra cứu vận đơn cụ thể em xin phép chuyển tới nhân viên CSKH để hỗ trợ anh nhanh nhất ạ.",
    createdAt: min(19),
  },
  {
    id: "m6",
    conversationId: "c2",
    role: "system",
    authorName: "Hệ thống",
    content:
      "AI chuyển hội thoại cho nhân viên (độ tin cậy thấp · phát hiện khiếu nại).",
    createdAt: min(19),
  },
  // c3 — Instagram
  {
    id: "m7",
    conversationId: "c3",
    role: "customer",
    authorName: "Lan Hương",
    content: "Set đồ trong story mới đăng có bán không ạ?",
    createdAt: min(35),
  },
  // c4 — Zalo PA
  {
    id: "m8",
    conversationId: "c4",
    role: "customer",
    authorName: "Vũ Thị Mai",
    content: "Mình muốn đổi size áo đã mua hôm qua được không?",
    createdAt: min(58),
  },
  {
    id: "m9",
    conversationId: "c4",
    role: "agent",
    authorName: "Lê Minh Khoa",
    content:
      "Dạ chị Mai yên tâm, YODY hỗ trợ đổi size miễn phí trong 7 ngày ạ. Chị cho em xin mã đơn hàng để em kiểm tra tồn kho size mới giúp mình nhé.",
    createdAt: min(54),
  },
  // c5 — Facebook (resolved)
  {
    id: "m10",
    conversationId: "c5",
    role: "customer",
    authorName: "Hoàng Gia Bảo",
    content: "Cho mình đặt 2 áo polo size L màu xanh navy nhé.",
    createdAt: min(190),
  },
  {
    id: "m11",
    conversationId: "c5",
    role: "ai",
    authorName: "YODY AI",
    confidence: 0.95,
    content:
      "Dạ em đã tạo đơn 2 áo polo size L màu xanh navy cho anh Bảo, tổng 598.000 VNĐ (freeship đơn trên 500K). Anh xác nhận giúp em số điện thoại và địa chỉ nhận hàng ạ!",
    createdAt: min(186),
  },
  {
    id: "m12",
    conversationId: "c5",
    role: "customer",
    authorName: "Hoàng Gia Bảo",
    content: "Cảm ơn shop nhé, đặt thành công rồi ạ!",
    createdAt: min(180),
  },
];
