// 二層診断・判断可能性ルーター・安全分類・逃避検知のテスト(4.2 / 4.3 / 6.4 / 10.3)

import { describe, it, expect } from "vitest";
import {
  routeReadiness,
  classifySafety,
  detectGatheringEscape,
  detectOptionExpansion,
  selectNextQuestion,
} from "../src/lib/diagnosis";
import { emptyDB, type DB, type DecisionVersion, type EvidenceItem } from "../src/lib/types";

function makeVersion(overrides: Partial<DecisionVersion> = {}): DecisionVersion {
  return {
    id: "v1",
    decisionId: "d1",
    versionNo: 1,
    question: "",
    ownerRole: "",
    authorityScope: "",
    selectedOptionId: null,
    rationale: "",
    confidence: null,
    state: "DIAGNOSING",
    committedAt: null,
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

describe("判断可能性ルーター(4.3)", () => {
  it("事実不足なら RESEARCH", () => {
    expect(routeReadiness({ factsMissing: true, needsAsk: true, testable: true, unknowable: false })).toBe("RESEARCH");
  });
  it("経験・権限不足なら ASK", () => {
    expect(routeReadiness({ factsMissing: false, needsAsk: true, testable: false, unknowable: false })).toBe("ASK");
  });
  it("考えても確定しないなら TEST", () => {
    expect(routeReadiness({ factsMissing: false, needsAsk: false, testable: true, unknowable: false })).toBe("TEST");
  });
  it("誰にも分からないなら BET", () => {
    expect(routeReadiness({ factsMissing: false, needsAsk: false, testable: false, unknowable: true })).toBe("BET");
  });
  it("材料と基準がそろえば THINK", () => {
    expect(routeReadiness({ factsMissing: false, needsAsk: false, testable: false, unknowable: false })).toBe("THINK");
  });
});

describe("S0 Safety(6.4)", () => {
  it("受入テスト: 高リスク医療相談は専門家確認へルーティング", () => {
    const r = classifySafety("HEALTH", "手術を受けるかどうか");
    expect(r.level).toBe("HIGH_RISK");
    expect(r.guidance).toContain("専門家");
  });
  it("自傷表現は緊急導線へ切り替え", () => {
    const r = classifySafety("WORK", "もう死にたい");
    expect(r.level).toBe("EMERGENCY");
  });
  it("通常領域は NORMAL", () => {
    expect(classifySafety("WORK", "採用チャネルを変えるか").level).toBe("NORMAL");
  });
});

describe("逃避の検知(3.6 / 10.3)", () => {
  it("受入テスト: 情報10件追加・判断基準なし → 情報追加を止めて基準定義へ戻す", () => {
    const db: DB = emptyDB();
    const v = makeVersion();
    db.versions.push(v);
    for (let i = 0; i < 10; i++) {
      db.evidence.push({
        id: `e${i}`, versionId: v.id, type: "FACT", statement: `情報${i}`,
        sourceUrl: null, reliability: "MEDIUM", observedAt: new Date().toISOString(),
      } satisfies EvidenceItem);
    }
    const warn = detectGatheringEscape(db, v.id);
    expect(warn).not.toBeNull();
    expect(warn).toContain("判断基準");
  });

  it("基準なしで選択肢が5件に増えると警告する", () => {
    const db: DB = emptyDB();
    const v = makeVersion();
    db.versions.push(v);
    for (let i = 0; i < 5; i++) {
      db.options.push({
        id: `o${i}`, versionId: v.id, label: `案${i}`, description: "", origin: "USER",
        active: true, addedReason: "", rejectedReason: null, createdAt: new Date().toISOString(),
      });
    }
    expect(detectOptionExpansion(db, v.id)).not.toBeNull();
  });
});

describe("次質問の選択(4.5)", () => {
  it("受入テスト: 「慎重に検討しています」だけ → 問いを一文にする質問を最優先で出す", () => {
    const db: DB = emptyDB();
    const v = makeVersion(); // 問いも主体も空
    db.versions.push(v);
    const q = selectNextQuestion(db, v, null);
    expect(q).not.toBeNull();
    expect(q!.code).toBe("Q_FRAME_SENTENCE");
  });

  it("同じ質問は繰り返さない", () => {
    const db: DB = emptyDB();
    const v = makeVersion();
    db.versions.push(v);
    db.questions.push({
      id: "q1", versionId: v.id, questionCode: "Q_FRAME_SENTENCE",
      text: "", purpose: "", gap: "QUESTION", sequenceNo: 1,
    });
    db.answers.push({
      id: "a1", questionId: "q1", versionId: v.id, questionCode: "Q_FRAME_SENTENCE",
      answerText: "AかBか", submittedAt: new Date().toISOString(),
    });
    const q = selectNextQuestion(db, v, null);
    expect(q?.code).not.toBe("Q_FRAME_SENTENCE");
  });

  it("最大7問で打ち切る(12章)", () => {
    const db: DB = emptyDB();
    const v = makeVersion();
    db.versions.push(v);
    for (let i = 0; i < 7; i++) {
      db.questions.push({
        id: `q${i}`, versionId: v.id, questionCode: `C${i}`,
        text: "", purpose: "", gap: "QUESTION", sequenceNo: i + 1,
      });
    }
    expect(selectNextQuestion(db, v, null)).toBeNull();
  });
});
