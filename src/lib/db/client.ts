"use client";

// ブラウザ側の Supabase クライアント。
// 環境変数が無いときは null を返し、アプリは端末内(localStorage)だけで動く。
// 「ログインしないと使えない」にはしない ── 最初の書き出しに登録を挟みたくない。

import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

let cached: SupabaseClient | null | undefined;

export function supabase(): SupabaseClient | null {
  if (cached !== undefined) return cached;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  cached = url && key ? createBrowserClient(url, key) : null;
  return cached;
}

export const isCloudEnabled = () => supabase() !== null;
