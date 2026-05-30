import { NextRequest, NextResponse } from "next/server";
import { getConversation, setStatus } from "@/lib/store";
import type { ConversationStatus } from "@/lib/types";

const VALID: ConversationStatus[] = ["open", "pending", "resolved"];

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const conversation = getConversation(id);
  if (!conversation)
    return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json();
  const status: ConversationStatus = body.status;
  if (!VALID.includes(status))
    return NextResponse.json({ error: "Trạng thái không hợp lệ" }, { status: 400 });

  setStatus(id, status);
  return NextResponse.json({ conversation: getConversation(id) });
}
