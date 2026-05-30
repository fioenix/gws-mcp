import type { Conversation, Message } from "./types";

/**
 * Lớp tích hợp AI.
 *
 * QUAN TRỌNG (chính sách YODY): mọi lời gọi LLM PHẢI đi qua AI Gateway của
 * YODY — không gọi thẳng nhà cung cấp ("shadow LLM"). Cấu hình qua biến môi
 * trường, không hardcode credentials:
 *   - YODY_AI_GATEWAY_URL : endpoint tương thích OpenAI Chat Completions
 *   - YODY_AI_GATEWAY_KEY  : API key (chỉ đọc từ env phía server)
 *   - YODY_AI_MODEL        : tên model định tuyến qua gateway
 *
 * Khi chưa cấu hình gateway, hệ thống dùng bộ trả lời heuristic nội bộ để
 * bản demo chạy được ngay mà không gửi dữ liệu ra ngoài.
 */

const SYSTEM_PROMPT = `Bạn là "YODY AI" — trợ lý bán hàng và CSKH của thương hiệu thời trang YODY.
Nguyên tắc:
- Trả lời bằng tiếng Việt, lịch sự, ngắn gọn, thân thiện, đúng nhận diện thương hiệu YODY.
- Mục tiêu: tư vấn sản phẩm, gợi ý size/màu, hỗ trợ đặt hàng và giải đáp chính sách (đổi trả 7 ngày, freeship đơn trên 500.000 VNĐ).
- KHÔNG bịa thông tin tồn kho, giá, mã đơn hay tình trạng vận chuyển. Nếu cần dữ liệu nội bộ chính xác mà bạn không có, hãy đề nghị chuyển cho nhân viên.
- Khi khách khiếu nại gay gắt, yêu cầu hoàn tiền, hoặc vấn đề ngoài phạm vi → đề nghị chuyển nhân viên (handoff).
- Định dạng tiền: 1.234.567 VNĐ. Đơn vị thời gian theo giờ Việt Nam.`;

export interface AIResult {
  content: string;
  confidence: number;
  /** AI tự nhận thấy nên chuyển cho người. */
  suggestHandoff: boolean;
  /** Nguồn sinh câu trả lời. */
  source: "gateway" | "heuristic";
}

const HANDOFF_KEYWORDS = [
  "hoàn tiền",
  "trả lại tiền",
  "khiếu nại",
  "tố cáo",
  "lừa đảo",
  "bức xúc",
  "thất vọng",
  "report",
  "luật sư",
  "ship sai",
  "giao sai",
  "chưa nhận được",
  "mất hàng",
];

function detectHandoff(text: string): boolean {
  const t = text.toLowerCase();
  return HANDOFF_KEYWORDS.some((k) => t.includes(k));
}

/** Bộ trả lời heuristic nội bộ (fallback khi chưa cấu hình gateway). */
function heuristicReply(conversation: Conversation, lastText: string): AIResult {
  const t = lastText.toLowerCase();
  const name = conversation.customer.name.split(/\s+/).pop() ?? "mình";

  if (detectHandoff(t)) {
    return {
      content: `Dạ em rất tiếc về trải nghiệm chưa tốt này ạ. Để xử lý chính xác và nhanh nhất, em xin phép chuyển tới nhân viên CSKH hỗ trợ trực tiếp cho mình ngay ạ. 🙏`,
      confidence: 0.38,
      suggestHandoff: true,
      source: "heuristic",
    };
  }

  if (/(size|cỡ|còn hàng|còn không|còn ko|màu|color)/.test(t)) {
    return {
      content: `Dạ YODY chào ${name} ạ! Sản phẩm mình hỏi hiện vẫn còn nhiều size và màu phổ biến ạ. Mình cho em xin chiều cao, cân nặng để em tư vấn size chuẩn nhất nhé. Em kiểm tra tồn kho realtime và báo lại ngay ạ! 👗`,
      confidence: 0.86,
      suggestHandoff: false,
      source: "heuristic",
    };
  }

  if (/(giá|bao nhiêu|price|nhiêu tiền)/.test(t)) {
    return {
      content: `Dạ ${name} ơi, em gửi mình thông tin giá và ưu đãi hiện có của sản phẩm nhé. YODY đang freeship cho đơn từ 500.000 VNĐ ạ. Mình muốn em tư vấn thêm mẫu nào không ạ? 😊`,
      confidence: 0.82,
      suggestHandoff: false,
      source: "heuristic",
    };
  }

  if (/(đổi|trả|return|hoàn)/.test(t)) {
    return {
      content: `Dạ YODY hỗ trợ đổi trả miễn phí trong 7 ngày với sản phẩm còn tem mác và hóa đơn ạ. ${name} cho em xin mã đơn hàng để em kiểm tra và hỗ trợ đổi size/màu giúp mình nhé!`,
      confidence: 0.8,
      suggestHandoff: false,
      source: "heuristic",
    };
  }

  if (/(đặt|mua|chốt|order|lấy)/.test(t)) {
    return {
      content: `Dạ em chốt đơn giúp ${name} ngay ạ! Mình gửi em số lượng, size, màu và địa chỉ nhận hàng để em tạo đơn và áp ưu đãi tốt nhất nhé. 🛍️`,
      confidence: 0.84,
      suggestHandoff: false,
      source: "heuristic",
    };
  }

  return {
    content: `Dạ YODY chào ${name} ạ! Em có thể hỗ trợ mình về sản phẩm, size, giá, đặt hàng hoặc chính sách đổi trả. Mình cần em tư vấn gì ạ? 💙`,
    confidence: 0.7,
    suggestHandoff: false,
    source: "heuristic",
  };
}

/** Gọi AI Gateway của YODY (định dạng OpenAI Chat Completions). */
async function gatewayReply(
  conversation: Conversation,
  history: Message[]
): Promise<AIResult | null> {
  const url = process.env.YODY_AI_GATEWAY_URL;
  const key = process.env.YODY_AI_GATEWAY_KEY;
  const model = process.env.YODY_AI_MODEL ?? "yody-cs-agent";
  if (!url || !key) return null;

  const messages = [
    { role: "system", content: SYSTEM_PROMPT },
    {
      role: "system",
      content: `Bối cảnh khách hàng: ${conversation.customer.name} · kênh ${conversation.channel} · ${
        conversation.customer.ordersCount ?? 0
      } đơn trước đó · tỉnh/thành: ${conversation.customer.province ?? "chưa rõ"}.`,
    },
    ...history.slice(-12).map((m) => ({
      role:
        m.role === "customer"
          ? ("user" as const)
          : m.role === "system"
            ? ("system" as const)
            : ("assistant" as const),
      content: m.content,
    })),
  ];

  try {
    const res = await fetch(`${url.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({ model, messages, temperature: 0.5 }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const content: string = data?.choices?.[0]?.message?.content?.trim();
    if (!content) return null;
    const lastCustomer = [...history]
      .reverse()
      .find((m) => m.role === "customer");
    const suggestHandoff = detectHandoff(lastCustomer?.content ?? "");
    return {
      content,
      confidence: suggestHandoff ? 0.45 : 0.9,
      suggestHandoff,
      source: "gateway",
    };
  } catch {
    return null;
  }
}

/** Sinh câu trả lời của AI cho hội thoại, ưu tiên gateway, fallback heuristic. */
export async function generateReply(
  conversation: Conversation,
  history: Message[]
): Promise<AIResult> {
  const lastCustomer = [...history]
    .reverse()
    .find((m) => m.role === "customer");
  const lastText = lastCustomer?.content ?? "";

  const viaGateway = await gatewayReply(conversation, history);
  if (viaGateway) return viaGateway;

  return heuristicReply(conversation, lastText);
}
