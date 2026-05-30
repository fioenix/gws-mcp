"use client";

import { useEffect, useRef, useState } from "react";
import {
  Bot,
  Send,
  Sparkles,
  UserRound,
  CheckCheck,
  CornerUpLeft,
  Loader2,
  MessageSquarePlus,
  ShieldCheck,
  X,
} from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ChannelIcon } from "@/components/channel-icon";
import { cn, initials } from "@/lib/utils";
import { clockTime } from "@/lib/format";
import { CHANNELS } from "@/lib/channels";
import type { Conversation, Message } from "@/lib/types";

interface AiDraft {
  content: string;
  confidence: number;
  suggestHandoff: boolean;
  source: "gateway" | "heuristic";
}

export function ConversationView({
  conversation,
  messages,
  onSendAgent,
  onAiAutoReply,
  onRequestDraft,
  onToggleMode,
  onResolve,
  onSimulateCustomer,
  busy,
}: {
  conversation: Conversation;
  messages: Message[];
  onSendAgent: (text: string) => Promise<void>;
  onAiAutoReply: () => Promise<void>;
  onRequestDraft: () => Promise<AiDraft | null>;
  onToggleMode: (mode: "ai" | "human") => Promise<void>;
  onResolve: () => Promise<void>;
  onSimulateCustomer: (text: string) => Promise<void>;
  busy: boolean;
}) {
  const [text, setText] = useState("");
  const [draft, setDraft] = useState<AiDraft | null>(null);
  const [drafting, setDrafting] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const meta = CHANNELS[conversation.channel];

  useEffect(() => {
    setDraft(null);
    setText("");
  }, [conversation.id]);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length, conversation.id]);

  async function handleSend() {
    const value = text.trim();
    if (!value) return;
    setText("");
    setDraft(null);
    await onSendAgent(value);
  }

  async function handleDraft() {
    setDrafting(true);
    const d = await onRequestDraft();
    setDrafting(false);
    if (d) setDraft(d);
  }

  function acceptDraft() {
    if (draft) setText(draft.content);
    setDraft(null);
  }

  const lastIsCustomer = messages[messages.length - 1]?.role === "customer";

  return (
    <div className="flex h-full min-w-0 flex-1 flex-col bg-background">
      {/* Header */}
      <header className="flex items-center justify-between gap-4 border-b px-5 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <div className="relative shrink-0">
            <Avatar className="h-10 w-10">
              {conversation.customer.avatarUrl && (
                <AvatarImage src={conversation.customer.avatarUrl} />
              )}
              <AvatarFallback>
                {initials(conversation.customer.name)}
              </AvatarFallback>
            </Avatar>
            <ChannelIcon
              channel={conversation.channel}
              size="sm"
              className="absolute -bottom-1 -right-1"
            />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="truncate font-semibold">
                {conversation.customer.name}
              </h2>
              {conversation.status === "resolved" && (
                <Badge variant="success" className="text-[10px]">
                  Đã xử lý
                </Badge>
              )}
            </div>
            <p className="truncate text-xs text-muted-foreground">
              {meta.label}
              {conversation.customer.province
                ? ` · ${conversation.customer.province}`
                : ""}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Mode toggle */}
          <div className="flex items-center gap-2 rounded-xl border bg-card px-3 py-1.5">
            <Bot
              className={cn(
                "h-4 w-4",
                conversation.mode === "ai"
                  ? "text-gold-500"
                  : "text-muted-foreground"
              )}
            />
            <span className="text-xs font-medium">AI tự động</span>
            <Switch
              checked={conversation.mode === "ai"}
              onCheckedChange={(v) => onToggleMode(v ? "ai" : "human")}
              disabled={busy}
            />
          </div>

          {conversation.status !== "resolved" && (
            <Button
              variant="outline"
              size="sm"
              onClick={onResolve}
              disabled={busy}
            >
              <CheckCheck className="h-4 w-4" /> Đánh dấu xong
            </Button>
          )}
        </div>
      </header>

      {/* Handoff banner */}
      {conversation.needsHuman && conversation.mode === "human" && (
        <div className="flex items-center gap-2 border-b bg-amber-50 px-5 py-2 text-xs text-amber-800">
          <ShieldCheck className="h-4 w-4" />
          AI đã chuyển hội thoại này cho nhân viên xử lý. Bạn đang trực tiếp trả
          lời khách hàng.
        </div>
      )}

      {/* Thread */}
      <ScrollArea className="flex-1 scrollbar-thin" viewportRef={scrollRef}>
        <div className="mx-auto flex max-w-3xl flex-col gap-3 px-5 py-6">
          {messages.map((m) => (
            <MessageBubble key={m.id} message={m} />
          ))}
        </div>
      </ScrollArea>

      {/* AI draft preview */}
      {draft && (
        <div className="mx-auto w-full max-w-3xl px-5">
          <div className="animate-fade-in rounded-2xl border border-gold-200 bg-gold-50/70 p-3">
            <div className="mb-1.5 flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-xs font-semibold text-gold-800">
                <Sparkles className="h-3.5 w-3.5" /> Gợi ý từ YODY AI
                <Badge variant="muted" className="ml-1 text-[10px]">
                  tin cậy {Math.round(draft.confidence * 100)}%
                </Badge>
                <Badge variant="muted" className="text-[10px]">
                  {draft.source === "gateway" ? "AI Gateway" : "heuristic"}
                </Badge>
              </span>
              <button
                onClick={() => setDraft(null)}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <p className="text-sm leading-relaxed text-foreground/90">
              {draft.content}
            </p>
            {draft.suggestHandoff && (
              <p className="mt-1.5 text-xs font-medium text-red-600">
                ⚠ AI khuyến nghị nhân viên xử lý trực tiếp tình huống này.
              </p>
            )}
            <div className="mt-2.5 flex gap-2">
              <Button size="sm" variant="gold" onClick={acceptDraft}>
                <CornerUpLeft className="h-4 w-4" /> Chèn để chỉnh sửa
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setDraft(null)}
              >
                Bỏ qua
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Composer */}
      <div className="border-t bg-card/40 p-4">
        <div className="mx-auto max-w-3xl">
          {conversation.mode === "ai" ? (
            <div className="mb-2 flex items-center gap-2 rounded-xl bg-gold-50 px-3 py-2 text-xs text-gold-800">
              <Bot className="h-4 w-4" />
              Chế độ AI tự động đang bật — YODY AI tự trả lời khách. Tắt công tắc
              ở trên để nhân viên tiếp quản.
            </div>
          ) : null}

          <div className="rounded-2xl border bg-background shadow-sm focus-within:ring-2 focus-within:ring-ring">
            <Textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              placeholder={
                conversation.mode === "ai"
                  ? "Nhập để gửi thủ công (sẽ tạm dừng AI cho tin này)…"
                  : "Nhập tin nhắn trả lời khách hàng…"
              }
              className="min-h-[64px] resize-none border-0 bg-transparent shadow-none focus-visible:ring-0"
            />
            <div className="flex items-center justify-between gap-2 px-3 pb-2.5">
              <div className="flex items-center gap-1.5">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleDraft}
                  disabled={drafting || busy}
                >
                  {drafting ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Sparkles className="h-4 w-4" />
                  )}
                  Gợi ý AI
                </Button>
                {conversation.mode === "ai" && lastIsCustomer && (
                  <Button
                    size="sm"
                    variant="gold"
                    onClick={onAiAutoReply}
                    disabled={busy}
                  >
                    <Bot className="h-4 w-4" /> AI trả lời ngay
                  </Button>
                )}
              </div>
              <div className="flex items-center gap-2">
                <span className="hidden text-[11px] text-muted-foreground sm:block">
                  ⌘/Ctrl + Enter để gửi
                </span>
                <Button
                  size="sm"
                  onClick={handleSend}
                  disabled={busy || !text.trim()}
                >
                  <Send className="h-4 w-4" /> Gửi
                </Button>
              </div>
            </div>
          </div>

          {/* Demo helper: giả lập khách nhắn tới để thử luồng AI/handoff */}
          <SimulateCustomer onSimulate={onSimulateCustomer} disabled={busy} />
        </div>
      </div>
    </div>
  );
}

function MessageBubble({ message }: { message: Message }) {
  if (message.role === "system") {
    return (
      <div className="my-1 flex justify-center">
        <span className="rounded-full bg-muted px-3 py-1 text-[11px] text-muted-foreground">
          {message.content}
        </span>
      </div>
    );
  }

  const isCustomer = message.role === "customer";
  const isAi = message.role === "ai";

  return (
    <div
      className={cn(
        "flex animate-fade-in gap-2.5",
        isCustomer ? "justify-start" : "justify-end"
      )}
    >
      {isCustomer && (
        <Avatar className="mt-auto h-7 w-7">
          <AvatarFallback className="text-[10px]">
            {initials(message.authorName)}
          </AvatarFallback>
        </Avatar>
      )}
      <div className={cn("max-w-[78%] space-y-1", isCustomer ? "" : "items-end")}>
        <div
          className={cn(
            "rounded-2xl px-4 py-2.5 text-sm leading-relaxed shadow-sm",
            isCustomer && "rounded-bl-md bg-card",
            isAi && "rounded-br-md bg-gold-100 text-gold-900",
            message.role === "agent" &&
              "rounded-br-md bg-brand text-primary-foreground"
          )}
        >
          {message.content}
        </div>
        <div
          className={cn(
            "flex items-center gap-1.5 px-1 text-[10px] text-muted-foreground",
            isCustomer ? "justify-start" : "justify-end"
          )}
        >
          {isAi && <Bot className="h-3 w-3 text-gold-500" />}
          {message.role === "agent" && <UserRound className="h-3 w-3" />}
          <span>{message.authorName}</span>
          <span>·</span>
          <span>{clockTime(message.createdAt)}</span>
          {isAi && message.confidence != null && (
            <span>· tin cậy {Math.round(message.confidence * 100)}%</span>
          )}
        </div>
      </div>
    </div>
  );
}

function SimulateCustomer({
  onSimulate,
  disabled,
}: {
  onSimulate: (text: string) => Promise<void>;
  disabled: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  return (
    <div className="mt-2">
      {!open ? (
        <button
          onClick={() => setOpen(true)}
          className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
        >
          <MessageSquarePlus className="h-3.5 w-3.5" /> Giả lập tin nhắn từ khách
          (demo)
        </button>
      ) : (
        <div className="flex items-center gap-2">
          <Textarea
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="Nội dung khách gửi tới…"
            className="min-h-[40px] flex-1 text-xs"
          />
          <Button
            size="sm"
            variant="secondary"
            disabled={disabled || !value.trim()}
            onClick={async () => {
              const v = value.trim();
              setValue("");
              setOpen(false);
              await onSimulate(v);
            }}
          >
            Gửi
          </Button>
        </div>
      )}
    </div>
  );
}
