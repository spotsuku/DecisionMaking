// 端末内のDB(localStorage)とPostgresの対応表。
//
// 同期をテーブルごとに手書きすると必ずどこかが抜けるので、
// 「どのキーがどの表か・どの列に写すか」を1か所に集める。
//
// 追記のみの表(appendOnly)は、DB側に update / delete のポリシーが無い。
// 一度送った行は送り直さない ── 送り直そうとしても弾かれるのが正しい(INV-01)。

import type { DB } from "../types";

export interface TableMap {
  /** DBのテーブル名 */
  table: string;
  /** ローカル側のキー */
  key: keyof DB;
  /** 追記のみ(update不可)。衝突時は無視して良い */
  appendOnly: boolean;
  /** ローカルのフィールド名 → DBの列名。省略時は camel → snake の自動変換 */
  columns?: Record<string, string>;
  /** DBには送らないフィールド */
  omit?: string[];
}

/** 親から先に送らないと外部キーで落ちるので、この並び順のまま送る */
export const TABLES: TableMap[] = [
  { table: "decisions", key: "decisions", appendOnly: false },
  { table: "decision_versions", key: "versions", appendOnly: false },
  { table: "diagnostic_questions", key: "questions", appendOnly: true },
  { table: "diagnostic_answers", key: "answers", appendOnly: true },
  { table: "blocker_assessments", key: "blockers", appendOnly: true },
  { table: "readiness_checks", key: "readiness", appendOnly: true },
  { table: "options", key: "options", appendOnly: false },
  { table: "criteria", key: "criteria", appendOnly: false },
  { table: "option_scores", key: "optionScores", appendOnly: false },
  { table: "evidence_items", key: "evidence", appendOnly: true },
  { table: "forecasts", key: "forecasts", appendOnly: true },
  { table: "commitments", key: "commitments", appendOnly: false },
  { table: "actions", key: "actions", appendOnly: false },
  { table: "action_events", key: "actionEvents", appendOnly: true },
  { table: "outcomes", key: "outcomes", appendOnly: true },
  { table: "reflections", key: "reflections", appendOnly: true },
  { table: "decision_changes", key: "changes", appendOnly: true },
  { table: "journal_entries", key: "journal", appendOnly: false, columns: { text: "body" } },
  { table: "audit_events", key: "audit", appendOnly: true, columns: { payloadSummary: "detail", createdAt: "occurred_at" } },
];

const toSnake = (s: string) => s.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);

/** ローカルの行 → DBの行 */
export function toRow(
  map: TableMap,
  row: Record<string, unknown>,
  userId: string
): Record<string, unknown> {
  const out: Record<string, unknown> = { user_id: userId };
  for (const [k, v] of Object.entries(row)) {
    if (map.omit?.includes(k)) continue;
    if (v === undefined) continue;
    out[map.columns?.[k] ?? toSnake(k)] = v;
  }
  return out;
}

/** DBの行 → ローカルの行 */
export function fromRow(map: TableMap, row: Record<string, unknown>): Record<string, unknown> {
  const back = new Map<string, string>();
  for (const [local, col] of Object.entries(map.columns ?? {})) back.set(col, local);
  const out: Record<string, unknown> = {};
  for (const [col, v] of Object.entries(row)) {
    if (col === "user_id") continue;
    const local = back.get(col) ?? col.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
    out[local] = v;
  }
  return out;
}
