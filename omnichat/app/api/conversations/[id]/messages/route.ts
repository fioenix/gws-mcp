import { NextRequest, NextResponse } from "next/server";
import { appendMessage, getConversation, listMessages } from "@/lib/store";
import { CURRENT_AGENT } from "@/lib/seed";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const conversation = getConversation(id);
  if (!conversation)
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({
    conversation,
    messages: listMessages(id),
  });
}

/** Nhân viên (hoặc giả lập khách) gửi tin nhắn vào hội thoại. */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const conversation = getConversation(id);
  if (!conversation)
    return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json();
  const role: "agent" | "customer" = body.role === "customer" ? "customer" : "agent";
  const content: string = (body.content ?? "").toString().trim();
  if (!content)
    return NextResponse.json({ error: "Nội dung trống" }, { status: 400 });

  const message = appendMessage({
    conversationId: id,
    role,
    authorName:
      role === "agent" ? CURRENT_AGENT.name : conversation.customer.name,
    content,
  });

  return NextResponse.json({ message, conversation });
}
