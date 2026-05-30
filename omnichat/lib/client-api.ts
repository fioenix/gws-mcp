import type { Agent, Conversation, Message } from "./types";

async function jsonFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json();
}

export const api = {
  conversations: () =>
    jsonFetch<{ conversations: Conversation[] }>("/api/conversations"),

  thread: (id: string) =>
    jsonFetch<{ conversation: Conversation; messages: Message[] }>(
      `/api/conversations/${id}/messages`
    ),

  agents: () =>
    jsonFetch<{ agents: Agent[]; currentAgent: Agent }>("/api/agents"),

  sendMessage: (id: string, content: string, role: "agent" | "customer" = "agent") =>
    jsonFetch<{ message: Message; conversation: Conversation }>(
      `/api/conversations/${id}/messages`,
      { method: "POST", body: JSON.stringify({ content, role }) }
    ),

  aiReply: (id: string, mode: "send" | "draft") =>
    jsonFetch<{
      message?: Message;
      conversation?: Conversation;
      handoff?: boolean;
      draft?: {
        content: string;
        confidence: number;
        suggestHandoff: boolean;
        source: "gateway" | "heuristic";
      };
    }>(`/api/conversations/${id}/ai-reply`, {
      method: "POST",
      body: JSON.stringify({ mode }),
    }),

  setMode: (id: string, mode: "ai" | "human") =>
    jsonFetch<{ conversation: Conversation }>(`/api/conversations/${id}/mode`, {
      method: "POST",
      body: JSON.stringify({ mode }),
    }),

  setStatus: (id: string, status: "open" | "pending" | "resolved") =>
    jsonFetch<{ conversation: Conversation }>(
      `/api/conversations/${id}/status`,
      { method: "POST", body: JSON.stringify({ status }) }
    ),
};
