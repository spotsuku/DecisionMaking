import type { Metadata } from "next";
import "./globals.css";

// 共有時に出る文言。アプリの実装(src/lib/plan.ts)と食い違わせない。
const SITE = "https://decision-making-alpha.vercel.app";
const TITLE = "決めろ。| DECISION MAKING";
const DESCRIPTION =
  "迷っていることを話すだけ。決めるべきことをアプリが拾い、判断基準・選択肢・両面予測・最初の行動まで記録に残します。決断2件まで無料。";

export const metadata: Metadata = {
  metadataBase: new URL(SITE),
  title: TITLE,
  description: DESCRIPTION,
  icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" },
  openGraph: {
    type: "website",
    locale: "ja_JP",
    url: SITE,
    siteName: "DECISION MAKING",
    title: TITLE,
    description: DESCRIPTION,
    images: [{ url: "/ogp.png", width: 1200, height: 630, alt: "決めろ。DECISION MAKING" }],
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
    images: ["/ogp.png"],
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="ja"><body>{children}</body></html>;
}
