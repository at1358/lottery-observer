import type { Metadata, Viewport } from "next";
import "./globals.css";
import "./mobile.css";
import "./workspace-theme.css";
import "./workspace-theme-mobile.css";

export const viewport: Viewport = {width:'device-width',initialScale:1,viewportFit:'cover'};

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
      <body className="antialiased workspace-theme">{children}</body>
    </html>
  );
}
