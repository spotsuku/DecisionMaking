// Decision Drift・選択的帰属・Integrityのテスト(5.1 / 5.3 / 5.4 / 10.3)

import { describe, it, expect } from "vitest";
import { detectDrift, detectSelectiveAttribution } from "../src/lib/drift";
import { emptyDB, type DB } from "../src/lib/types";

const iso = (d: string) => new Date(d).toISOString();

function committedFixture(): DB {
  const db = emptyDB();
  db.decisions.push({
    id: "d1", title: "採用チャネル", domain: "WORK", status: "IN_ACTION",
    currentVersionNo: 1, dueAt: null, reviewAt: null, riskLevel: "NORMAL",
    createdAt: iso("2026-04-01"), closedAt: null, hidden: false,
  });
  db.versions.push({
    id: "v1", decisionId: "d1", versionNo: 1, question: "AかBか",
    ownerRole: "自分", authorityScope: "", selectedOptionId: "optA",
    rationale: "", confidence: 0.7, state: "COMMITTED",
    committedAt: iso("2026-04-12"), createdAt: iso("2026-04-01"),
  });
  db.options.push(
    { id: "optA", versionId: "v1", label: "A案", description: "", origin: "USER", active: true, addedReason: "", rejectedReason: null, createdAt: iso("2026-04-01") },
    { id: "optB", versionId: "v1", label: "B案", description: "", origin: "USER", active: true, addedReason: "", rejectedReason: "コスト超過", createdAt: iso("2026-04-01") },
  );
  return db;
}

function addAction(db: DB, id: string, optionId: string, createdAt: string) {
  db.actions.push({
    id, versionId: "v1", decisionId: "d1", text: `行動${id}`, actionRole: "ADVANCE",
    optionId, dueAt: iso("2026-05-01"), status: "STARTED", completionEvidence: null, createdAt: iso(createdAt),
  });
}

describe("Decision Drift(5.1 / 10.3)", () => {
  it("受入テスト: Commit後に別案の行動が2件以上・変更イベントなし → Drift通知", () => {
    const db = committedFixture();
    addAction(db, "a1", "optB", "2026-04-13");
    addAction(db, "a2", "optB", "2026-04-14");
    const r = detectDrift(db, "d1");
    expect(r.drifting).toBe(true);
    expect(r.message).toContain("A案");
    expect(r.message).toContain("B案");
  });

  it("不一致行動が1件では通知しない(閾値2件)", () => {
    const db = committedFixture();
    addAction(db, "a1", "optB", "2026-04-13");
    expect(detectDrift(db, "d1").drifting).toBe(false);
  });

  it("選択した案への行動なら通知しない", () => {
    const db = committedFixture();
    addAction(db, "a1", "optA", "2026-04-13");
    addAction(db, "a2", "optA", "2026-04-14");
    expect(detectDrift(db, "d1").drifting).toBe(false);
  });

  it("変更イベントが作成済みなら通知しない(通知抑制 7.3)", () => {
    const db = committedFixture();
    addAction(db, "a1", "optB", "2026-04-13");
    addAction(db, "a2", "optB", "2026-04-14");
    db.changes.push({
      id: "c1", decisionId: "d1", fromVersionId: "v1", toVersionId: "v2",
      trigger: "方針変更", newEvidence: "新事実", priorResultAcknowledged: true,
      changedAssumption: "前提", changedAt: iso("2026-04-15"),
    });
    expect(detectDrift(db, "d1").drifting).toBe(false);
  });
});

describe("選択的帰属の検知(5.3)", () => {
  const outcome = (id: string, cls: "GOOD" | "BAD", attr: "SELF" | "EXTERNAL", at: string) => ({
    id, versionId: "v1", observedAt: iso(at), resultSummary: "", outcomeClass: cls, attribution: attr, externalFactors: "",
  });

  it("良い=自分/悪い=外部が3件続いたら記録として提示(断定しない文面)", () => {
    const db = emptyDB();
    db.outcomes.push(
      outcome("o1", "GOOD", "SELF", "2026-01-01"),
      outcome("o2", "BAD", "EXTERNAL", "2026-02-01"),
      outcome("o3", "GOOD", "SELF", "2026-03-01"),
    );
    const r = detectSelectiveAttribution(db);
    expect(r.detected).toBe(true);
    expect(r.message).toContain("3件");
    expect(r.message).not.toContain("責任を避けています");
  });

  it("2件では提示しない(最低3件 5.3)", () => {
    const db = emptyDB();
    db.outcomes.push(outcome("o1", "GOOD", "SELF", "2026-01-01"), outcome("o2", "BAD", "EXTERNAL", "2026-02-01"));
    expect(detectSelectiveAttribution(db).detected).toBe(false);
  });

  it("悪い結果を自分に帰属した記録があれば連続が途切れる", () => {
    const db = emptyDB();
    db.outcomes.push(
      outcome("o1", "GOOD", "SELF", "2026-01-01"),
      outcome("o2", "BAD", "SELF", "2026-02-01"),
      outcome("o3", "GOOD", "SELF", "2026-03-01"),
      outcome("o4", "BAD", "EXTERNAL", "2026-04-01"),
    );
    expect(detectSelectiveAttribution(db).detected).toBe(false);
  });
});
