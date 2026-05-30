import { NextRequest, NextResponse } from "next/server";
import {
  appendMessage,
  getConversation,
  listMessages,
  updateConversation,
} from "@/lib/store";
import { generateReply } from "@/lib/ai";

/**
 * Sinh câu trả lời của AI cho hội thoại.
 * body.mode:
 *   - "send"  : AI tự động gửi (chế độ AI). Nếu AI đề nghị handoff → chuyển human.
 *   - "draft" : Sinh gợi ý để nhân viên duyệt (human-in-the-loop), KHÔNG gửi.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const conversation = getConversation(id);
  if (!conversation)
    return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const mode: "send" | "draft" = body.mode === "draft" ? "draft" : "send";

  const history = listMessages(id);
  const result = await generateReply(conversation, history);

  if (mode === "draft") {
    return NextResponse.json({
      draft: {
        content: result.content,
        confidence: result.confidence,
        suggestHandoff: result.suggestHandoff,
        source: result.source,
      },
    });
  }

  // Chế độ AI tự động: nếu nên handoff thì chuyển cho người và ghi log hệ thống.
  if (result.suggestHandoff) {
    appendMessage({
      conversationId: id,
      role: "ai",
      authorName: "YODY AI",
      confidence: result.confidence,
      content: result.content,
    });
    appendMessage({
      conversationId: id,
      role: "system",
      authorName: "Hệ thống",
      content:
        "AI chuyển hội thoại cho nhân viên (độ tin cậy thấp · phát hiện vấn đề cần con người xử lý).",
    });
    updateConversation(id, { mode: "human", needsHuman: true, status: "pending" });
    return NextResponse.json({
      handoff: true,
      conversation: getConversation(id),
    });
  }

  const message = appendMessage({
    conversationId: id,
    role: "ai",
    authorName: "YODY AI",
    confidence: result.confidence,
    content: result.content,
  });

  return NextResponse.json({
    message,
    source: result.source,
    conversation: getConversation(id),
  });
}
