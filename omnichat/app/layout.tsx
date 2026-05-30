import type { Metadata } from "next";
import { Be_Vietnam_Pro } from "next/font/google";
import "./globals.css";
import { cn } from "@/lib/utils";

const beVietnamPro = Be_Vietnam_Pro({
  subsets: ["latin", "vietnamese"],
  weight: ["300", "400", "500", "600", "700"],
  variable: "--font-be-vietnam-pro",
  display: "swap",
});

export const metadata: Metadata = {
  title: "YODY OmniChat — AI Sales & Customer Service",
  description:
    "Nền tảng chat tập trung đa kênh (Facebook, Instagram, Zalo OA, Zalo PA) với AI agent tự động và human-in-the-loop.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="vi" suppressHydrationWarning>
      <body className={cn(beVietnamPro.variable, "font-sans")}>{children}</body>
    </html>
  );
}
