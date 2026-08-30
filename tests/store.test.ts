// ストアの不変条件テスト(INV-01〜INV-05 / 7.1 Commitトランザクション / 5.2 変更プロトコル)

import { describe, it, expect, beforeEach } from "vitest";
import { store, migrate } from "../src/lib/store";
import { emptyDB, type DB } from "../src/lib/types";

const plusDays = (n: number) => new Date(Date.now() + n * 86400000).toISOString();

function setupCommittedDecision() {
  const { decision, version } = store.createDecision({
    title: "採用チャネル選定",
    question: "媒体を続けるか、紹介採用へ集中するか",
    ownerRole: "自分",
    domain: "WORK",
    dueAt: plusDays(7),
  });
  const optA = store.addOption(version.id, "紹介採用へ集中", "", "");
  const optB = store.addOption(version.id, "媒体を継続", "", "");
  store.setOptionRejectedReason(optB.id, "応募単価が最低条件を超過");
  store.addCriterion(version.id, "採用単価", "", 4, "80万円以下");
  store.addCriterion(version.id, "スピード", "", 3, "90日以内");
  store.saveReadiness(version.id, "THINK", [], null, "");
  store.upsertForecast(version.id, "POSITIVE", {
    outcomeStatement: "90日で内定2名",
    probability: 0.6,
    horizonAt: plusDays(90),
  });
  store.upsertForecast(version.id, "NEGATIVE", {
    outcomeStatement: "紹介が集まらない",
    probability: 0.3,
    horizonAt: plusDays(90),
    lossLimit: "3ヶ月と30万円",
  });
  const result = store.commit(decision.id, {
    selectedOptionId: optA.id,
    rationale: "単価とスピードの両基準で優位",
    confidence: 0.7,
    acceptedTradeoff: "母集団の広さを捨てる",
    lossLimit: "3ヶ月と30万円",
    stopCondition: "60日で候補者2名未満なら撤退",
    reviewAt: plusDays(7),
    actions: [{ text: "社員3名に紹介依頼を送る", actionRole: "ADVANCE", dueAt: plusDays(1), optionId: optA.id }],
    userConfirmed: true,
  });
  return { decision, version, optA, optB, result };
}

beforeEach(() => {
  store.resetAll();
});

describe("Commitトランザクション(7.1)", () => {
  it("ゲート通過でversion凍結・予測凍結・行動作成・状態遷移が原子的に行われる", () => {
    const { decision, version, optA, result } = setupCommittedDecision();
    expect(result.ok).toBe(true);
    const db = store.getSnapshot();
    const d = db.decisions.find((x) => x.id === decision.id)!;
    const v = db.versions.find((x) => x.id === version.id)!;
    expect(d.status).toBe("COMMITTED");
    expect(v.committedAt).not.toBeNull();
    expect(v.selectedOptionId).toBe(optA.id);
    expect(db.forecasts.filter((f) => f.versionId === version.id).every((f) => f.frozenAt)).toBe(true);
    expect(db.commitments.find((c) => c.versionId === version.id)).toBeTruthy();
    expect(db.actions.filter((a) => a.versionId === version.id)).toHaveLength(1);
    expect(db.audit.some((e) => e.eventType === "COMMITTED")).toBe(true);
  });

  it("受入テスト: ネガティブ予測なしでは未決のまま", () => {
    const { decision, version } = store.createDecision({
      title: "t", question: "AかBか", ownerRole: "自分", domain: "WORK", dueAt: plusDays(7),
    });
    const optA = store.addOption(version.id, "A", "", "");
    store.upsertForecast(version.id, "POSITIVE", { outcomeStatement: "成功", horizonAt: plusDays(30) });
    const r = store.commit(decision.id, {
      selectedOptionId: optA.id, rationale: "", confidence: null,
      acceptedTradeoff: "x", lossLimit: "", stopCondition: "", reviewAt: plusDays(7),
      actions: [{ text: "a", actionRole: "ADVANCE", dueAt: plusDays(1), optionId: optA.id }],
      userConfirmed: true,
    });
    expect(r.ok).toBe(false);
    expect(store.getSnapshot().decisions.find((d) => d.id === decision.id)!.status).not.toBe("COMMITTED");
  });
});

describe("履歴の不変性(INV-01)", () => {
  it("確定済みversionへの材料追加を拒否する", () => {
    const { version } = setupCommittedDecision();
    expect(() => store.addOption(version.id, "C案", "", "")).toThrow(/確定済み/);
    expect(() => store.addCriterion(version.id, "新基準", "", 3, "")).toThrow(/確定済み/);
  });

  it("確定済みversionの枠組み変更を拒否する", () => {
    const { decision } = setupCommittedDecision();
    expect(() => store.updateFrame(decision.id, { question: "書き換え" })).toThrow(/確定済み/);
  });
});

describe("変更プロトコル(5.2 / INV-03)", () => {
  it("旧結果の受容・新事実・変わった前提がそろえば新versionを作成し、旧versionを残す", () => {
    const { decision, version } = setupCommittedDecision();
    store.recordOutcome(decision.id, {
      resultSummary: "目標10名に対し実績2名", outcomeClass: "BAD", attribution: "MIXED", externalFactors: "",
    });
    const r = store.reviseDecision(decision.id, {
      trigger: "母集団仮説の誤り",
      newEvidence: "紹介経由の応募が想定の1/5",
      changedAssumption: "社員の紹介意欲",
      priorResultAcknowledged: true,
      newQuestion: "紹介継続か、エージェント併用か",
    });
    expect(r.ok).toBe(true);
    const db = store.getSnapshot();
    const versions = db.versions.filter((v) => v.decisionId === decision.id);
    expect(versions).toHaveLength(2);
    // 旧versionは凍結されたまま残る
    const old = versions.find((v) => v.id === version.id)!;
    expect(old.committedAt).not.toBeNull();
    // 変更イベントが旧→新を接続する
    const change = db.changes.find((c) => c.decisionId === decision.id)!;
    expect(change.fromVersionId).toBe(version.id);
    expect(change.priorResultAcknowledged).toBe(true);
  });

  it("旧結果の受容なしでは変更できない", () => {
    const { decision } = setupCommittedDecision();
    const r = store.reviseDecision(decision.id, {
      trigger: "気が変わった", newEvidence: "特になし", changedAssumption: "前提",
      priorResultAcknowledged: false, newQuestion: "新しい問い",
    });
    expect(r.ok).toBe(false);
    expect(store.getSnapshot().versions).toHaveLength(1);
  });

  it("新事実なしでは変更できない", () => {
    const { decision } = setupCommittedDecision();
    const r = store.reviseDecision(decision.id, {
      trigger: "t", newEvidence: "", changedAssumption: "前提",
      priorResultAcknowledged: true, newQuestion: "新しい問い",
    });
    expect(r.ok).toBe(false);
  });
});

describe("選択肢の拡張制限(9.1 / 12章)", () => {
  it("5件目の選択肢は理由なしでは追加できない", () => {
    const { version } = store.createDecision({
      title: "t", question: "q", ownerRole: "自分", domain: "WORK", dueAt: plusDays(7),
    });
    for (let i = 0; i < 4; i++) store.addOption(version.id, `案${i}`, "", "");
    expect(() => store.addOption(version.id, "案5", "", "")).toThrow(/理由/);
    expect(() => store.addOption(version.id, "案5", "", "新しい事実が出た")).not.toThrow();
  });
});

describe("画面からの削除は非表示(3.8)", () => {
  it("hideDecisionは履歴を消さない", () => {
    const { decision } = setupCommittedDecision();
    store.hideDecision(decision.id);
    const db = store.getSnapshot();
    expect(db.decisions.find((d) => d.id === decision.id)!.hidden).toBe(true);
    expect(db.versions.filter((v) => v.decisionId === decision.id).length).toBeGreaterThan(0);
  });
});

describe("決断を閉じる(撤退も正式な選択)", () => {
  it("撤退は完了と区別して記録される", () => {
    store.resetAll();
    const { decision } = store.createDecision({ title: "犬を迎える", question: "迎えるか", ownerRole: "自分", domain: "FAMILY", dueAt: plusDays(7) });
    store.closeDecision(decision.id, "妻の在宅勤務が終わったから", {
      kind: "WITHDRAWN",
      protected: "家族に無理をさせずに済んだ",
      learning: "世話をする人の予定を先に確かめる",
    });
    const d = store.getSnapshot().decisions.find((x) => x.id === decision.id)!;
    expect(d.status).toBe("CLOSED");
    expect(d.closeKind).toBe("WITHDRAWN");
    expect(d.closeReason).toBe("妻の在宅勤務が終わったから");
    expect(d.closeProtected).toBe("家族に無理をさせずに済んだ");
    expect(d.closeLearning).toBe("世話をする人の予定を先に確かめる");
  });

  it("監査ログにも撤退として残る(INV-01)", () => {
    store.resetAll();
    const { decision } = store.createDecision({ title: "t", question: "q", ownerRole: "自分", domain: "WORK", dueAt: plusDays(7) });
    store.closeDecision(decision.id, "前提が崩れた", { kind: "WITHDRAWN" });
    const ev = store.getSnapshot().audit.filter((a) => a.entityId === decision.id).at(-1)!;
    expect(ev.eventType).toBe("WITHDRAWN");
    expect(ev.payloadSummary).toContain("意図的撤退");
  });

  it("種別を渡さなければ完了として扱う", () => {
    store.resetAll();
    const { decision } = store.createDecision({ title: "t", question: "q", ownerRole: "自分", domain: "WORK", dueAt: plusDays(7) });
    store.closeDecision(decision.id, "やり切った");
    expect(store.getSnapshot().decisions[0].closeKind).toBe("COMPLETED");
  });

  it("任意欄が空なら null で保存する(空文字を残さない)", () => {
    store.resetAll();
    const { decision } = store.createDecision({ title: "t", question: "q", ownerRole: "自分", domain: "WORK", dueAt: plusDays(7) });
    store.closeDecision(decision.id, "理由", { kind: "WITHDRAWN", protected: "  ", learning: "" });
    const d = store.getSnapshot().decisions[0];
    expect(d.closeProtected).toBeNull();
    expect(d.closeLearning).toBeNull();
  });
});

describe("古い形式の記録を読み込む(移行)", () => {
  /** 端末に残っている古い記録の形。型を満たさないので unknown 経由で渡す */
  const asDB = (partial: Record<string, unknown>) => ({ ...emptyDB(), ...partial }) as unknown as DB;

  it("受入テスト: answerJson の無い回答を読んでも落ちない", () => {
    // 診断画面が a.answerJson[part.key] を読んで落ちていた、実際の形
    const db = migrate(asDB({
      answers: [{
        id: "a1", questionId: "q1", versionId: "v1", questionCode: "Q_CRITERIA",
        answerText: "家族との時間を守る", submittedAt: "2026-08-29T00:00:00Z",
      }],
    }));
    const a = db.answers[0];
    expect(a.answerJson).toEqual({});
    expect(a.skipped).toBe(false);
    expect(() => a.answerJson["protect"]).not.toThrow();
  });

  it("配列であるべき項目が欠けていても埋める", () => {
    const db = migrate(asDB({
      blockers: [{ id: "b1", versionId: "v1", blockerCode: "EMOTION_AVOIDANCE",
        score: 0.5, confidence: 0.5, counterQuestion: "", algorithmVersion: "x",
        createdAt: "2026-08-29T00:00:00Z" }],
      readiness: [{ id: "r1", versionId: "v1", verdict: "THINK",
        stopCondition: null, note: "", createdAt: "2026-08-29T00:00:00Z" }],
    }));
    expect(db.blockers[0].evidenceRefs).toEqual([]);
    expect(db.readiness[0].missing).toEqual([]);
  });

  it("いまの形式の記録は書き換えない(INV-01)", () => {
    const db = migrate(asDB({
      answers: [{
        id: "a1", questionId: "q1", versionId: "v1", questionCode: "Q_CRITERIA",
        answerText: "守: 家族", answerJson: { protect: "家族" }, skipped: false,
        submittedAt: "2026-08-30T00:00:00Z",
      }],
    }));
    expect(db.answers[0].answerJson).toEqual({ protect: "家族" });
    expect(db.answers[0].answerText).toBe("守: 家族");
  });
});
