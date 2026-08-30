"use client";

// 端末内のデータとクラウドの同期。
//
// 方針は local-first:
//   画面は今まで通り localStorage の内容を同期的に読む。書き込みも今まで通り即座に効く。
//   クラウドは「消えないこと」と「端末をまたぐこと」のために後ろで足す。
//   ネットが無くても、ログインしていなくても、アプリは全機能が動く。
//
// 競合の解決:
//   追記のみの表(回答・履歴・監査など)は、同じidの行を二度入れない ── それだけで足りる。
//   設計上ほとんどの表が追記のみなので、複雑な解決規則は要らない。
//   更新のある表(決断・選択肢・行動など)は id での upsert。あとから書いた方が残る。

import type { DB } from "../types";
import { emptyDB } from "../types";
import { supabase } from "./client";
import { TABLES, toRow, fromRow } from "./mapping";

/** 一度に送る行数。大きすぎるとリクエストが落ちる */
const CHUNK = 200;

export interface SyncResult {
  pushed: number;
  pulled: number;
  errors: string[];
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/** 端末の内容をクラウドへ送る */
export async function push(db: DB, userId: string): Promise<SyncResult> {
  const sb = supabase();
  const result: SyncResult = { pushed: 0, pulled: 0, errors: [] };
  if (!sb) return result;

  // 親→子の順。順番を崩すと外部キーで落ちる
  for (const map of TABLES) {
    const rows = (db[map.key] as unknown as Record<string, unknown>[]) ?? [];
    if (rows.length === 0) continue;
    for (const part of chunk(rows, CHUNK)) {
      const payload = part.map((r) => toRow(map, r, userId));
      const { error } = await sb
        .from(map.table)
        // 追記のみの表は、すでにある行を送り直さない(DB側も更新を拒否する)
        .upsert(payload, { onConflict: "id", ignoreDuplicates: map.appendOnly });
      if (error) result.errors.push(`${map.table}: ${error.message}`);
      else result.pushed += payload.length;
    }
  }
  return result;
}

/** クラウドの内容を取ってきて、端末のDBを組み立てる */
export async function pull(userId: string): Promise<{ db: DB; result: SyncResult }> {
  const sb = supabase();
  const db = emptyDB();
  const result: SyncResult = { pushed: 0, pulled: 0, errors: [] };
  if (!sb) return { db, result };

  for (const map of TABLES) {
    const { data, error } = await sb.from(map.table).select("*").eq("user_id", userId);
    if (error) {
      result.errors.push(`${map.table}: ${error.message}`);
      continue;
    }
    const rows = (data ?? []).map((r) => fromRow(map, r as Record<string, unknown>));
    (db[map.key] as unknown as Record<string, unknown>[]) = rows;
    result.pulled += rows.length;
  }
  return { db, result };
}

/**
 * 端末とクラウドを合わせる。
 * 同じidが両方にあれば、端末側を残す(いま画面で見ているものを消さない)。
 */
export function mergeDB(local: DB, remote: DB): DB {
  const out = emptyDB();
  for (const map of TABLES) {
    const localRows = (local[map.key] as unknown as { id: string }[]) ?? [];
    const remoteRows = (remote[map.key] as unknown as { id: string }[]) ?? [];
    const seen = new Set(localRows.map((r) => r.id));
    (out[map.key] as unknown as { id: string }[]) = [
      ...localRows,
      ...remoteRows.filter((r) => !seen.has(r.id)),
    ];
  }
  return out;
}
