/** Định dạng tiền VNĐ: 1.234.567 VNĐ. */
export function formatVND(value?: number): string {
  if (value == null) return "—";
  return new Intl.NumberFormat("vi-VN").format(value) + " VNĐ";
}

/** Thời gian tương đối kiểu "5 phút", "2 giờ", "Hôm qua". */
export function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.round(diff / 60000);
  if (m < 1) return "vừa xong";
  if (m < 60) return `${m} phút`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} giờ`;
  const d = Math.round(h / 24);
  if (d === 1) return "hôm qua";
  if (d < 7) return `${d} ngày`;
  return new Date(iso).toLocaleDateString("vi-VN");
}

/** Giờ:phút theo định dạng Việt Nam (24h). */
export function clockTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("vi-VN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}
