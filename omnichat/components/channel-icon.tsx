import { Facebook, Instagram } from "lucide-react";
import type { ChannelId } from "@/lib/types";
import { CHANNELS } from "@/lib/channels";
import { cn } from "@/lib/utils";

/** Huy hiệu tròn hiển thị nhận diện kênh, có thể đặt overlay lên avatar. */
export function ChannelIcon({
  channel,
  size = "md",
  className,
}: {
  channel: ChannelId;
  size?: "sm" | "md";
  className?: string;
}) {
  const meta = CHANNELS[channel];
  const box = size === "sm" ? "h-5 w-5" : "h-7 w-7";
  const icon = size === "sm" ? "h-3 w-3" : "h-4 w-4";

  return (
    <span
      className={cn(
        "inline-flex items-center justify-center rounded-full text-white shadow-sm ring-2 ring-card",
        box,
        className
      )}
      style={{ backgroundColor: meta.color }}
      title={meta.label}
      aria-label={meta.label}
    >
      {channel === "facebook" && <Facebook className={cn(icon, "fill-white")} />}
      {channel === "instagram" && <Instagram className={icon} />}
      {(channel === "zalo_oa" || channel === "zalo_pa") && (
        <span
          className={cn(
            "font-bold leading-none",
            size === "sm" ? "text-[9px]" : "text-[11px]"
          )}
        >
          Z
        </span>
      )}
    </span>
  );
}
