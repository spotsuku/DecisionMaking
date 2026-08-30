"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { IconHome, IconPlus, IconChart } from "./icons";

export function TabBar() {
  const pathname = usePathname();
  const isHome = pathname === "/" || pathname.startsWith("/decisions");
  const isIdentity = pathname.startsWith("/identity");
  return (
    <nav className="tabbar">
      <Link href="/" className={`tab ${isHome ? "active" : ""}`}>
        <IconHome />
        <span>ホーム</span>
        {isHome && <span className="dot" />}
      </Link>
      <Link href="/journal" className="tab" aria-label="書き出す">
        <span className="tab-plus"><IconPlus /></span>
      </Link>
      <Link href="/identity" className={`tab ${isIdentity ? "active" : ""}`}>
        <IconChart />
        <span>パターン</span>
        {isIdentity && <span className="dot" />}
      </Link>
    </nav>
  );
}
