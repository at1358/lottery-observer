import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "期数采集台 · 网页资料核验系统",
  description: "网页原文采集、按期核验与统计管理",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body className="antialiased">{children}</body>
    </html>
  );
}
