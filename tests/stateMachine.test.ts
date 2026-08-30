// 状態遷移と決断成立ルールのテスト(設計書 2.3 / 4.6 / 10.3)

import { describe, it, expect } from "vitest";
import { canTransition, evaluateCommitGate, readinessDisplay, type CommitInput } from "../src/lib/stateMachine";
import { emptyDB } from "../src/lib/types";

describe("状態機械(2.3)", () => {
  it("正常フロー DRAFT→DIAGNOSING→READY→COMMITTED→IN_ACTION→REVIEW→CLOSED を許可する", () => {
    expect(canTransition("DRAFT", "DIAGNOSING")).toBe(true);
    expect(canTransition("DIAGNOSING", "READY")).toBe(true);
    expect(canTransition("READY", "COMMITTED")).toBe(true);
    expect(canTransition("COMMITTED", "IN_ACTION")).toBe(true);
    expect(canTransition("IN_ACTION", "REVIEW")).toBe(true);
    expect(canTransition("REVIEW", "CLOSED")).toBe(true);
  });

  it("材料集めの往復 DIAGNOSING⇄GATHERING を許可する", () => {
    expect(canTransition("DIAGNOSING", "GATHERING")).toBe(true);
    expect(canTransition("GATHERING", "DIAGNOSING")).toBe(true);
    expect(canTransition("GATHERING", "READY")).toBe(true);
  });

  it("飛び級の遷移を拒否する(DRAFTから直接COMMITTEDにはできない)", () => {
    expect(canTransition("DRAFT", "COMMITTED")).toBe(false);
    expect(canTransition("DIAGNOSING", "COMMITTED")).toBe(false);
    expect(canTransition("DRAFT", "IN_ACTION")).toBe(false);
  });

  it("終端状態 REVISED / CLOSED からは遷移できない", () => {
    expect(canTransition("REVISED", "COMMITTED")).toBe(false);
    expect(canTransition("CLOSED", "DRAFT")).toBe(false);
    expect(canTransition("CLOSED", "COMMITTED")).toBe(false);
  });

  it("意図的撤退はどの進行状態からも CLOSED にできる(非目標 1.3: 保留・撤退も正式な選択)", () => {
    for (const s of ["DRAFT", "DIAGNOSING", "GATHERING", "READY", "COMMITTED", "IN_ACTION", "REVIEW"] as const) {
      expect(canTransition(s, "CLOSED")).toBe(true);
    }
  });
});

function validCommitInput(): CommitInput {
  return {
    userConfirmed: true,
    selectedOptionId: "opt-a",
    options: [
      { id: "opt-a", active: true, rejectedReason: null },
      { id: "opt-b", active: true, rejectedReason: "コストが最低条件を下回る" },
    ],
    forecasts: [
      { forecastType: "POSITIVE", outcomeStatement: "90日で内定2名", horizonAt: "2026-11-30T00:00:00Z", lossLimit: null, probability: 0.6 },
      { forecastType: "NEGATIVE", outcomeStatement: "紹介が集まらず3ヶ月遅延", horizonAt: "2026-11-30T00:00:00Z", lossLimit: "3ヶ月と30万円まで", probability: 0.3 },
    ],
    acceptedTradeoff: "母集団の広さを捨て、質を取る",
    actions: [{ text: "社員3名に紹介依頼を送る", actionRole: "ADVANCE", dueAt: "2026-09-01T00:00:00Z" }],
    reviewAt: "2026-09-07T00:00:00Z",
  };
}

describe("決断成立ルール(4.6 / INV-02)", () => {
  it("すべての必須条件がそろえば成立する", () => {
    const r = evaluateCommitGate(validCommitInput());
    expect(r.ok).toBe(true);
    expect(r.failures).toHaveLength(0);
  });

  it("受入テスト: ポジティブ予測だけでCommit → NEGATIVE予測を求めて未決", () => {
    const input = validCommitInput();
    input.forecasts = input.forecasts.filter((f) => f.forecastType === "POSITIVE");
    const r = evaluateCommitGate(input);
    expect(r.ok).toBe(false);
    expect(r.failures.map((f) => f.code)).toContain("NEGATIVE");
  });

  it("受入テスト: ネガティブ予測だけでCommit → POSITIVE予測を求めて未決", () => {
    const input = validCommitInput();
    input.forecasts = input.forecasts.filter((f) => f.forecastType === "NEGATIVE");
    const r = evaluateCommitGate(input);
    expect(r.ok).toBe(false);
    expect(r.failures.map((f) => f.code)).toContain("POSITIVE");
  });

  it("損失上限のないネガティブ予測では成立しない", () => {
    const input = validCommitInput();
    input.forecasts = input.forecasts.map((f) =>
      f.forecastType === "NEGATIVE" ? { ...f, lossLimit: "" } : f
    );
    const r = evaluateCommitGate(input);
    expect(r.ok).toBe(false);
    expect(r.failures.map((f) => f.code)).toContain("LOSS_LIMIT");
  });

  it("選択肢が未選択なら成立しない", () => {
    const input = validCommitInput();
    input.selectedOptionId = null;
    const r = evaluateCommitGate(input);
    expect(r.ok).toBe(false);
    expect(r.failures.map((f) => f.code)).toContain("CHOICE");
  });

  it("却下理由のない選択肢が残っていれば成立しない", () => {
    const input = validCommitInput();
    input.options = input.options.map((o) => (o.id === "opt-b" ? { ...o, rejectedReason: "" } : o));
    const r = evaluateCommitGate(input);
    expect(r.ok).toBe(false);
    expect(r.failures.map((f) => f.code)).toContain("REJECT_REASON");
  });

  it("最小行動(ADVANCE)がなければ成立しない", () => {
    const input = validCommitInput();
    input.actions = [];
    const r = evaluateCommitGate(input);
    expect(r.ok).toBe(false);
    expect(r.failures.map((f) => f.code)).toContain("ACTION");
  });

  it("レビュー日がなければ成立しない", () => {
    const input = validCommitInput();
    input.reviewAt = null;
    const r = evaluateCommitGate(input);
    expect(r.ok).toBe(false);
    expect(r.failures.map((f) => f.code)).toContain("REVIEW_AT");
  });

  it("INV-05: 本人確定がなければ、他の条件がそろっても成立しない", () => {
    const input = validCommitInput();
    input.userConfirmed = false;
    const r = evaluateCommitGate(input);
    expect(r.ok).toBe(false);
    expect(r.failures.map((f) => f.code)).toContain("USER_CONFIRM");
  });

  it("トレードオフの受容がなければ成立しない", () => {
    const input = validCommitInput();
    input.acceptedTradeoff = "";
    const r = evaluateCommitGate(input);
    expect(r.ok).toBe(false);
    expect(r.failures.map((f) => f.code)).toContain("TRADEOFF");
  });
});

describe("準備度の4段階表示(4.8)", () => {
  const iso = (d: string) => new Date(d).toISOString();

  function fixture(o: { dueAt?: string | null; readiness?: "THINK" | "RESEARCH"; options?: number } = {}) {
    const db = emptyDB();
    db.decisions.push({
      id: "d1", title: "t", domain: "WORK", status: "DIAGNOSING", currentVersionNo: 1,
      dueAt: o.dueAt === undefined ? iso("2026-12-01") : o.dueAt, reviewAt: null,
      riskLevel: "NORMAL", createdAt: iso("2026-08-01"), closedAt: null, hidden: false,
    });
    db.versions.push({
      id: "v1", decisionId: "d1", versionNo: 1, question: "AかBか", ownerRole: "自分",
      authorityScope: "", selectedOptionId: null, rationale: "", confidence: null,
      state: "DIAGNOSING", committedAt: null, createdAt: iso("2026-08-01"),
    });
    if (o.readiness) {
      db.readiness.push({
        id: "r1", versionId: "v1", verdict: o.readiness, missing: [],
        stopCondition: null, note: "", createdAt: iso("2026-08-02"),
      });
    }
    for (let i = 0; i < (o.options ?? 0); i++) {
      db.options.push({
        id: `o${i}`, versionId: "v1", label: `案${i}`, description: "", origin: "USER",
        active: true, addedReason: "", rejectedReason: null, createdAt: iso("2026-08-02"),
      });
    }
    return db;
  }

  it("問い・主体・期限が欠けていれば FRAME", () => {
    expect(readinessDisplay(fixture({ dueAt: null }), "d1")).toBe("FRAME");
  });

  it("問いを立てただけでは DECIDABLE にしない(判断可能性が未判定)", () => {
    expect(readinessDisplay(fixture(), "d1")).toBe("GATHER");
  });

  it("調査・相談・実験が必要なら GATHER", () => {
    expect(readinessDisplay(fixture({ readiness: "RESEARCH", options: 2 }), "d1")).toBe("GATHER");
  });

  it("THINKでも比較する選択肢が2件未満なら GATHER", () => {
    expect(readinessDisplay(fixture({ readiness: "THINK", options: 1 }), "d1")).toBe("GATHER");
  });

  it("判断可能性と選択肢2件がそろって DECIDABLE", () => {
    expect(readinessDisplay(fixture({ readiness: "THINK", options: 2 }), "d1")).toBe("DECIDABLE");
  });
});
