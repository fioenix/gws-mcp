import { NextResponse } from "next/server";
import { listAgents } from "@/lib/store";
import { CURRENT_AGENT } from "@/lib/seed";

export async function GET() {
  return NextResponse.json({ agents: listAgents(), currentAgent: CURRENT_AGENT });
}
