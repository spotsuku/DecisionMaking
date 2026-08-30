"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const items = [
  { href: "/", label: "ホーム" },
  { href: "/decisions/new", label: "新しい決断" },
  { href: "/identity", label: "パターン" },
];

export function Nav() {
  const pathname = usePathname();
  return (
    <nav className="topnav">
      {items.map((it) => (
        <Link
          key={it.href}
          href={it.href}
          className={
            it.href === "/" ? (pathname === "/" ? "active" : "") : pathname.startsWith(it.href) ? "active" : ""
          }
        >
          {it.label}
        </Link>
      ))}
    </nav>
  );
}
