"use client";

import { useSyncExternalStore } from "react";
import { store } from "./store";
import type { DB } from "./types";

/** ストア購読フック。サーバーでは空DBを返し、ハイドレーション後に実データを描画する。 */
export function useDB(): DB {
  return useSyncExternalStore(store.subscribe, store.getSnapshot, store.getServerSnapshot);
}

export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("ja-JP", { year: "numeric", month: "short", day: "numeric" });
}

export function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleString("ja-JP", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function daysBetween(fromIso: string, toIso: string): number {
  return Math.floor((new Date(toIso).getTime() - new Date(fromIso).getTime()) / 86400000);
}

export function isOverdue(iso: string | null): boolean {
  if (!iso) return false;
  return new Date(iso).getTime() < Date.now();
}
