import { NextResponse } from "next/server";
import { listConversations } from "@/lib/store";

export async function GET() {
  return NextResponse.json({ conversations: listConversations() });
}
