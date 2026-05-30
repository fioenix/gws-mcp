import { NextRequest, NextResponse } from "next/server";
import type { ChannelId } from "@/lib/types";
import { CHANNELS } from "@/lib/channels";
import { appendMessage, getConversation } from "@/lib/store";

/**
 * Điểm nhận webhook hợp nhất cho các kênh.
 *
 * Tích hợp thật cần (đặt qua biến môi trường / secret store, KHÔNG hardcode):
 *  - Facebook Messenger & Instagram (Meta Graph API): xác thực
 *    X-Hub-Signature-256 bằng App Secret; GET trả hub.challenge khi đăng ký.
 *  - Zalo OA: xác thực chữ ký bằng OA Secret Key (mac).
 *  - Zalo PA: theo tài liệu Zalo Personal API tương ứng.
 *
 * Đây là khung chuẩn hóa sự kiện inbound; phần ký/giải mã để trống có chủ đích
 * và phải được hoàn thiện cùng đội bảo mật trước khi lên production.
 */

function isChannel(v: string): v is ChannelId {
  return v in CHANNELS;
}

// GET: xác minh đăng ký webhook (Meta dùng hub.challenge).
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ channel: string }> }
) {
  const { channel } = await params;
  if (!isChannel(channel))
    return NextResponse.json({ error: "Kênh không hỗ trợ" }, { status: 404 });

  const url = new URL(req.url);
  const challenge = url.searchParams.get("hub.challenge");
  const verifyToken = url.searchParams.get("hub.verify_token");
  const expected = process.env.WEBHOOK_VERIFY_TOKEN;

  if (challenge && (!expected || verifyToken === expected)) {
    return new NextResponse(challenge, { status: 200 });
  }
  return NextResponse.json({ ok: true, channel });
}

// POST: nhận sự kiện tin nhắn inbound đã chuẩn hóa.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ channel: string }> }
) {
  const { channel } = await params;
  if (!isChannel(channel))
    return NextResponse.json({ error: "Kênh không hỗ trợ" }, { status: 404 });

  // TODO(security): verifySignature(channel, await req.text(), headers)
  const body = await req.json().catch(() => null);
  if (!body)
    return NextResponse.json({ error: "Payload không hợp lệ" }, { status: 400 });

  // Định dạng chuẩn hóa dùng cho demo: { conversationId, text }.
  const conversationId: string | undefined = body.conversationId;
  const text: string | undefined = body.text;
  if (!conversationId || !text)
    return NextResponse.json(
      { error: "Cần conversationId và text" },
      { status: 400 }
    );

  const conv = getConversation(conversationId);
  if (!conv)
    return NextResponse.json({ error: "Không thấy hội thoại" }, { status: 404 });

  const message = appendMessage({
    conversationId,
    role: "customer",
    authorName: conv.customer.name,
    content: text,
  });

  return NextResponse.json({ received: true, channel, message });
}
