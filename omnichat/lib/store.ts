import type {
  Conversation,
  HandlingMode,
  Message,
  ConversationStatus,
} from "./types";
import { AGENTS, CONVERSATIONS, MESSAGES } from "./seed";

/**
 * Kho dữ liệu in-memory cho bản demo. Trong môi trường production, lớp này sẽ
 * được thay bằng Postgres/Prisma và message broker (theo Information Security
 * Policy của YODY). Dùng globalThis để giữ trạng thái qua các lần hot-reload.
 */
interface DB {
  conversations: Conversation[];
  messages: Message[];
}

const g = globalThis as unknown as { __omnichatDB?: DB };

function db(): DB {
  if (!g.__omnichatDB) {
    g.__omnichatDB = {
      conversations: structuredClone(CONVERSATIONS),
      messages: structuredClone(MESSAGES),
    };
  }
  return g.__omnichatDB;
}

export function listConversations(): Conversation[] {
  return [...db().conversations].sort(
    (a, b) =>
      new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime()
  );
}

export function getConversation(id: string): Conversation | undefined {
  return db().conversations.find((c) => c.id === id);
}

export function listMessages(conversationId: string): Message[] {
  return db()
    .messages.filter((m) => m.conversationId === conversationId)
    .sort(
      (a, b) =>
        new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    );
}

export function listAgents() {
  return AGENTS;
}

let seq = 1000;
function nextId(prefix: string) {
  return `${prefix}${++seq}`;
}

export function appendMessage(
  input: Omit<Message, "id" | "createdAt"> & { createdAt?: string }
): Message {
  const msg: Message = {
    ...input,
    id: nextId("m"),
    createdAt: input.createdAt ?? new Date().toISOString(),
  };
  db().messages.push(msg);

  const conv = getConversation(msg.conversationId);
  if (conv && !msg.draft) {
    conv.lastMessagePreview = msg.content;
    conv.lastMessageAt = msg.createdAt;
    if (msg.role === "customer") conv.unreadCount += 1;
    else conv.unreadCount = 0;
    if (conv.status === "resolved" && msg.role === "customer")
      conv.status = "open";
  }
  return msg;
}

export function updateConversation(
  id: string,
  patch: Partial<
    Pick<
      Conversation,
      "mode" | "status" | "assigneeId" | "needsHuman" | "unreadCount" | "tags"
    >
  >
): Conversation | undefined {
  const conv = getConversation(id);
  if (!conv) return undefined;
  Object.assign(conv, patch);
  return conv;
}

export function setMode(id: string, mode: HandlingMode, assigneeId?: string) {
  return updateConversation(id, {
    mode,
    assigneeId: mode === "human" ? assigneeId : undefined,
    needsHuman: mode === "human" ? false : getConversation(id)?.needsHuman,
  });
}

export function setStatus(id: string, status: ConversationStatus) {
  return updateConversation(id, { status });
}
