import type { Metadata, Viewport } from "next";
import "./globals.css";
import { TabBar } from "@/components/TabBar";
import { CloudSync } from "@/components/CloudSync";

export const metadata: Metadata = {
  title: "DECISION MAKING",
  description:
    "決められないこと、迷っていることを書き出して、決断・行動・振り返りを成立させるアプリ",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#fffefd",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body>
        <main className="shell">{children}</main>
        <TabBar />
        <CloudSync />
      </body>
    </html>
  );
}
