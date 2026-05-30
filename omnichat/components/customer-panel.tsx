"use client";

import {
  Phone,
  MapPin,
  ShoppingBag,
  Wallet,
  Tag,
  Bot,
  Activity,
  Lightbulb,
} from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ChannelIcon } from "@/components/channel-icon";
import { initials } from "@/lib/utils";
import { formatVND } from "@/lib/format";
import { CHANNELS } from "@/lib/channels";
import type { Conversation } from "@/lib/types";

const sentimentLabel: Record<Conversation["sentiment"], { label: string; variant: "success" | "muted" | "danger" }> = {
  positive: { label: "Tích cực", variant: "success" },
  neutral: { label: "Trung tính", variant: "muted" },
  negative: { label: "Tiêu cực", variant: "danger" },
};

/** Gợi ý hành động dựa trên ngữ cảnh hội thoại (mô phỏng intelligence layer). */
function suggestions(c: Conversation): string[] {
  const s: string[] = [];
  if (c.sentiment === "negative")
    s.push("Ưu tiên xử lý: khách đang không hài lòng.");
  if (c.tags.includes("Khiếu nại giao hàng"))
    s.push("Tra cứu vận đơn và chủ động xin lỗi, đề xuất hỗ trợ.");
  if (c.tags.includes("Tư vấn sản phẩm"))
    s.push("Gợi ý sản phẩm phối kèm để tăng giá trị đơn (upsell).");
  if (c.tags.includes("Đổi trả"))
    s.push("Xác nhận điều kiện đổi trả 7 ngày và kiểm tra tồn kho size mới.");
  if ((c.customer.ordersCount ?? 0) >= 5)
    s.push("Khách thân thiết — cân nhắc ưu đãi/voucher tri ân.");
  if (s.length === 0) s.push("Chào hỏi thân thiện và xác định nhu cầu của khách.");
  return s;
}

export function CustomerPanel({ conversation }: { conversation: Conversation }) {
  const c = conversation;
  const meta = CHANNELS[c.channel];
  const sentiment = sentimentLabel[c.sentiment];

  return (
    <aside className="hidden h-full w-[320px] shrink-0 flex-col border-l bg-card/40 xl:flex">
      <ScrollArea className="flex-1 scrollbar-thin">
        <div className="flex flex-col items-center gap-2 p-6 pb-4 text-center">
          <div className="relative">
            <Avatar className="h-20 w-20 ring-4 ring-card">
              {c.customer.avatarUrl && <AvatarImage src={c.customer.avatarUrl} />}
              <AvatarFallback className="text-lg">
                {initials(c.customer.name)}
              </AvatarFallback>
            </Avatar>
            <ChannelIcon
              channel={c.channel}
              className="absolute bottom-0 right-0"
            />
          </div>
          <h3 className="mt-1 text-base font-bold">{c.customer.name}</h3>
          <span className="text-xs text-muted-foreground">
            Kết nối qua {meta.label}
          </span>
          <div className="mt-1 flex flex-wrap justify-center gap-1.5">
            {c.customer.tags.map((t) => (
              <Badge key={t} variant="secondary" className="text-[10px]">
                <Tag className="h-3 w-3" /> {t}
              </Badge>
            ))}
          </div>
        </div>

        <Separator />

        {/* Thông tin liên hệ */}
        <div className="space-y-3 p-5">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Thông tin khách hàng
          </h4>
          <InfoRow icon={Phone} label="Điện thoại" value={c.customer.phone ?? "Chưa có"} />
          <InfoRow
            icon={MapPin}
            label="Khu vực"
            value={c.customer.province ?? "Chưa rõ"}
          />
          <InfoRow
            icon={ShoppingBag}
            label="Số đơn đã mua"
            value={String(c.customer.ordersCount ?? 0)}
          />
          <InfoRow
            icon={Wallet}
            label="Giá trị trọn đời"
            value={formatVND(c.customer.lifetimeValue)}
          />
        </div>

        <Separator />

        {/* AI insights */}
        <div className="space-y-3 p-5">
          <h4 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <Bot className="h-3.5 w-3.5 text-gold-500" /> AI insight
          </h4>

          <div className="flex items-center justify-between rounded-xl border bg-background p-3">
            <span className="flex items-center gap-2 text-sm">
              <Activity className="h-4 w-4 text-muted-foreground" /> Cảm xúc
            </span>
            <Badge variant={sentiment.variant}>{sentiment.label}</Badge>
          </div>

          <div className="rounded-xl border bg-background p-3">
            <span className="mb-2 flex items-center gap-2 text-sm font-medium">
              <Lightbulb className="h-4 w-4 text-gold-500" /> Hành động đề xuất
            </span>
            <ul className="space-y-1.5">
              {suggestions(c).map((s, i) => (
                <li
                  key={i}
                  className="flex gap-2 text-xs leading-relaxed text-muted-foreground"
                >
                  <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-gold-400" />
                  {s}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </ScrollArea>
    </aside>
  );
}

function InfoRow({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3 text-sm">
      <span className="flex items-center gap-2 text-muted-foreground">
        <Icon className="h-4 w-4" /> {label}
      </span>
      <span className="truncate text-right font-medium">{value}</span>
    </div>
  );
}
