"use client";

import { useMemo, useState } from "react";
import { Search, Bot, UserRound, CircleDot } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ChannelIcon } from "@/components/channel-icon";
import { cn, initials } from "@/lib/utils";
import { timeAgo } from "@/lib/format";
import { CHANNEL_LIST } from "@/lib/channels";
import type { ChannelId, Conversation, ConversationStatus } from "@/lib/types";

const STATUS_FILTERS: { id: ConversationStatus | "all"; label: string }[] = [
  { id: "all", label: "Tất cả" },
  { id: "open", label: "Đang mở" },
  { id: "pending", label: "Chờ xử lý" },
  { id: "resolved", label: "Đã xong" },
];

const sentimentDot: Record<Conversation["sentiment"], string> = {
  positive: "bg-emerald-500",
  neutral: "bg-slate-300",
  negative: "bg-red-500",
};

export function ConversationList({
  conversations,
  selectedId,
  onSelect,
}: {
  conversations: Conversation[];
  selectedId?: string;
  onSelect: (id: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [channel, setChannel] = useState<ChannelId | "all">("all");
  const [status, setStatus] = useState<ConversationStatus | "all">("all");

  const filtered = useMemo(() => {
    return conversations.filter((c) => {
      if (channel !== "all" && c.channel !== channel) return false;
      if (status !== "all" && c.status !== status) return false;
      if (query) {
        const q = query.toLowerCase();
        if (
          !c.customer.name.toLowerCase().includes(q) &&
          !c.lastMessagePreview.toLowerCase().includes(q)
        )
          return false;
      }
      return true;
    });
  }, [conversations, channel, status, query]);

  const unreadTotal = conversations.reduce((s, c) => s + c.unreadCount, 0);

  return (
    <div className="flex h-full w-[348px] shrink-0 flex-col border-r bg-card/40">
      {/* Header */}
      <div className="space-y-3 border-b p-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold tracking-tight">Hộp thư</h1>
            <p className="text-xs text-muted-foreground">
              {conversations.length} hội thoại · {unreadTotal} chưa đọc
            </p>
          </div>
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Tìm theo tên hoặc nội dung…"
            className="pl-9"
          />
        </div>

        {/* Channel filter */}
        <div className="flex flex-wrap gap-1.5">
          <FilterChip active={channel === "all"} onClick={() => setChannel("all")}>
            Tất cả kênh
          </FilterChip>
          {CHANNEL_LIST.map((ch) => (
            <FilterChip
              key={ch.id}
              active={channel === ch.id}
              onClick={() => setChannel(ch.id)}
            >
              <span
                className="h-2 w-2 rounded-full"
                style={{ backgroundColor: ch.color }}
              />
              {ch.shortLabel}
            </FilterChip>
          ))}
        </div>

        {/* Status filter */}
        <div className="flex gap-1.5">
          {STATUS_FILTERS.map((s) => (
            <FilterChip
              key={s.id}
              active={status === s.id}
              onClick={() => setStatus(s.id)}
            >
              {s.label}
            </FilterChip>
          ))}
        </div>
      </div>

      {/* List */}
      <ScrollArea className="flex-1 scrollbar-thin">
        <div className="flex flex-col gap-1 p-2">
          {filtered.length === 0 && (
            <p className="px-3 py-10 text-center text-sm text-muted-foreground">
              Không có hội thoại phù hợp bộ lọc.
            </p>
          )}
          {filtered.map((c) => (
            <button
              key={c.id}
              onClick={() => onSelect(c.id)}
              className={cn(
                "group relative flex gap-3 rounded-2xl p-3 text-left transition-colors hover:bg-secondary/70",
                selectedId === c.id && "bg-brand-50 hover:bg-brand-50"
              )}
            >
              <div className="relative shrink-0">
                <Avatar className="h-11 w-11">
                  {c.customer.avatarUrl && (
                    <AvatarImage src={c.customer.avatarUrl} />
                  )}
                  <AvatarFallback>{initials(c.customer.name)}</AvatarFallback>
                </Avatar>
                <ChannelIcon
                  channel={c.channel}
                  size="sm"
                  className="absolute -bottom-1 -right-1"
                />
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm font-semibold">
                    {c.customer.name}
                  </span>
                  <span className="shrink-0 text-[11px] text-muted-foreground">
                    {timeAgo(c.lastMessageAt)}
                  </span>
                </div>
                <p
                  className={cn(
                    "mt-0.5 truncate text-xs text-muted-foreground",
                    c.unreadCount > 0 && "font-medium text-foreground"
                  )}
                >
                  {c.lastMessagePreview}
                </p>
                <div className="mt-1.5 flex items-center gap-1.5">
                  <span
                    className={cn(
                      "h-1.5 w-1.5 rounded-full",
                      sentimentDot[c.sentiment]
                    )}
                    title={`Cảm xúc: ${c.sentiment}`}
                  />
                  {c.mode === "ai" ? (
                    <Badge variant="gold" className="px-1.5 py-0 text-[10px]">
                      <Bot className="h-3 w-3" /> AI
                    </Badge>
                  ) : (
                    <Badge variant="secondary" className="px-1.5 py-0 text-[10px]">
                      <UserRound className="h-3 w-3" /> Nhân viên
                    </Badge>
                  )}
                  {c.needsHuman && (
                    <Badge variant="danger" className="px-1.5 py-0 text-[10px]">
                      <CircleDot className="h-3 w-3" /> Cần xử lý
                    </Badge>
                  )}
                </div>
              </div>

              {c.unreadCount > 0 && (
                <span className="absolute right-3 top-1/2 flex h-5 min-w-5 -translate-y-1/2 items-center justify-center rounded-full bg-brand px-1.5 text-[11px] font-semibold text-white">
                  {c.unreadCount}
                </span>
              )}
            </button>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
        active
          ? "border-brand bg-brand text-white"
          : "border-border bg-background text-muted-foreground hover:bg-secondary"
      )}
    >
      {children}
    </button>
  );
}
