import { NextRequest, NextResponse } from "next/server";
import { appendMessage, getConversation, setMode } from "@/lib/store";
import { CURRENT_AGENT } from "@/lib/seed";
import type { HandlingMode } from "@/lib/types";

/** Chuyển chế độ xử lý: "human" = nhân viên tiếp quản, "ai" = trả AI tự động. */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const conversation = getConversation(id);
  if (!conversation)
    return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json();
  const mode: HandlingMode = body.mode === "human" ? "human" : "ai";
  const assigneeId: string | undefined = body.assigneeId ?? CURRENT_AGENT.id;

  setMode(id, mode, assigneeId);

  appendMessage({
    conversationId: id,
    role: "system",
    authorName: "Hệ thống",
    content:
      mode === "human"
        ? `${CURRENT_AGENT.name} đã tiếp quản hội thoại từ AI.`
        : "Hội thoại được trả lại cho AI xử lý tự động.",
  });

  return NextResponse.json({ conversation: getConversation(id) });
}
