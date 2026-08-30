import type { Metadata } from "next";
import "./globals.css";
import { Nav } from "@/components/Nav";

export const metadata: Metadata = {
  title: "DECISION MAKING",
  description:
    "自分の人生と仕事を自分で決め、最小の行動を起こし、結果とのズレから学ぶ力を鍛えるアプリ",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body>
        <header className="topbar">
          <div className="topbar-inner">
            <a href="/" className="brand">
              <span className="brand-mark" />
              DECISION MAKING
            </a>
            <Nav />
          </div>
        </header>
        <main className="shell">{children}</main>
      </body>
    </html>
  );
}
