// 同期の対応表とマージのテスト。
// 実際のネットワークは叩かず、写し替えの規則だけを固定する。

import { describe, it, expect } from "vitest";
import { TABLES, toRow, fromRow, type TableMap } from "../src/lib/db/mapping";
import { mergeDB } from "../src/lib/db/sync";
import { emptyDB, type DB } from "../src/lib/types";

const find = (table: string): TableMap => TABLES.find((t) => t.table === table)!;

describe("対応表", () => {
  it("ローカルDBのすべての配列がどこかの表に対応している(送り漏れを作らない)", () => {
    const keys = Object.keys(emptyDB()) as (keyof DB)[];
    const mapped = new Set(TABLES.map((t) => t.key));
    for (const k of keys) expect(mapped.has(k), `${k} が未対応`).toBe(true);
  });

  it("表名もローカルキーも重複しない", () => {
    expect(new Set(TABLES.map((t) => t.table)).size).toBe(TABLES.length);
    expect(new Set(TABLES.map((t) => t.key)).size).toBe(TABLES.length);
  });

  it("追記のみの表が、設計どおり追記のみになっている(INV-01)", () => {
    for (const t of ["diagnostic_answers", "audit_events", "forecasts", "action_events", "decision_changes"]) {
      expect(find(t).appendOnly, t).toBe(true);
    }
    // 状態が変わる表は更新できる
    for (const t of ["decisions", "options", "actions"]) {
      expect(find(t).appendOnly, t).toBe(false);
    }
  });

  it("親が子より先に並んでいる(外部キーで落とさない)", () => {
    const order = TABLES.map((t) => t.table);
    expect(order.indexOf("decisions")).toBeLessThan(order.indexOf("decision_versions"));
    expect(order.indexOf("decision_versions")).toBeLessThan(order.indexOf("diagnostic_questions"));
    expect(order.indexOf("diagnostic_questions")).toBeLessThan(order.indexOf("diagnostic_answers"));
    expect(order.indexOf("options")).toBeLessThan(order.indexOf("option_scores"));
    expect(order.indexOf("actions")).toBeLessThan(order.indexOf("action_events"));
  });
});

describe("行の写し替え", () => {
  it("camelCase を snake_case にして user_id を付ける", () => {
    const row = toRow(find("decisions"), { id: "d1", currentVersionNo: 2, dueAt: null }, "u1");
    expect(row).toEqual({ user_id: "u1", id: "d1", current_version_no: 2, due_at: null });
  });

  it("名前が違う列は対応表で写す", () => {
    expect(toRow(find("journal_entries"), { id: "j1", text: "本文" }, "u1"))
      .toEqual({ user_id: "u1", id: "j1", body: "本文" });
    expect(toRow(find("audit_events"), { id: "a1", payloadSummary: "要約" }, "u1"))
      .toEqual({ user_id: "u1", id: "a1", detail: "要約" });
  });

  it("undefined は送らない(列の既定値を上書きしない)", () => {
    const row = toRow(find("diagnostic_answers"), { id: "a1", rawText: undefined, skipped: false }, "u1");
    expect("raw_text" in row).toBe(false);
    expect(row.skipped).toBe(false);
  });

  it("往復しても元に戻る", () => {
    for (const [table, local] of [
      ["decisions", { id: "d1", currentVersionNo: 2, closeKind: "WITHDRAWN" }],
      ["journal_entries", { id: "j1", text: "本文" }],
      ["audit_events", { id: "a1", payloadSummary: "要約" }],
      ["diagnostic_answers", { id: "x1", answerJson: { a: "b" }, questionCode: "Q_OWNER" }],
    ] as const) {
      const map = find(table);
      expect(fromRow(map, toRow(map, { ...local }, "u1"))).toEqual(local);
    }
  });
});

describe("端末とクラウドのマージ", () => {
  function withDecision(id: string, title: string): DB {
    const db = emptyDB();
    db.decisions.push({
      id, title, domain: "WORK", status: "DRAFT", currentVersionNo: 1,
      dueAt: null, reviewAt: null, riskLevel: "NORMAL",
      createdAt: "2026-08-01T00:00:00Z", closedAt: null, hidden: false,
    });
    return db;
  }

  it("両方にある決断は端末側を残す(見ているものを消さない)", () => {
    const merged = mergeDB(withDecision("d1", "端末で編集中"), withDecision("d1", "クラウドの古い版"));
    expect(merged.decisions).toHaveLength(1);
    expect(merged.decisions[0].title).toBe("端末で編集中");
  });

  it("片方にしかないものは両方とも残る", () => {
    const merged = mergeDB(withDecision("d1", "端末"), withDecision("d2", "別端末"));
    expect(merged.decisions.map((d) => d.id).sort()).toEqual(["d1", "d2"]);
  });

  it("空同士でも壊れない", () => {
    expect(mergeDB(emptyDB(), emptyDB()).decisions).toEqual([]);
  });
});
