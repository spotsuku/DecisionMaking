import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Decision Making App",
  description: "問い・判断基準・選択肢を整理し、24時間以内の最初の行動まで決める意思決定支援アプリ。毎月3件まで無料。",
  icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="ja"><body>{children}</body></html>;
}
