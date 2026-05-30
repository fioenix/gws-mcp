import type { ChannelId, ChannelMeta } from "./types";

export const CHANNELS: Record<ChannelId, ChannelMeta> = {
  facebook: {
    id: "facebook",
    label: "Facebook Messenger",
    shortLabel: "Facebook",
    color: "#1877f2",
  },
  instagram: {
    id: "instagram",
    label: "Instagram Direct",
    shortLabel: "Instagram",
    color: "#e1306c",
  },
  zalo_oa: {
    id: "zalo_oa",
    label: "Zalo Official Account",
    shortLabel: "Zalo OA",
    color: "#0068ff",
  },
  zalo_pa: {
    id: "zalo_pa",
    label: "Zalo Personal Account",
    shortLabel: "Zalo PA",
    color: "#0091ff",
  },
};

export const CHANNEL_LIST: ChannelMeta[] = Object.values(CHANNELS);
