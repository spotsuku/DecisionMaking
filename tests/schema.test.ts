// 対応表が「実際のPostgresの列」と一致しているかを確かめる。
//
// tests/fixtures/schema.json は本番DBの information_schema から取った列一覧。
// マイグレーションを足したらここも更新する。
// これが無いと、同期が静かに失敗する列を作り込んでも気づけない。

import { describe, it, expect } from "vitest";
import { store } from "../src/lib/store";
import { TABLES, toRow } from "../src/lib/db/mapping";
import schema from "./fixtures/schema.json";

const plusDays = (n: number) => new Date(Date.now() + n * 86400000).toISOString();

/** ひと通りの記録が入ったDBを、実際の操作で作る */
function fullDB() {
  store.resetAll();
  store.addJournalEntry("犬を飼うかどうか迷っている");
  const { decision, version } = store.createDecision({
    title: "犬を迎えるか", question: "迎えるかどうか",
    ownerRole: "自分", domain: "FAMILY", dueAt: plusDays(7),
  });
  const q = store.recordQuestion(version.id, {
    code: "Q_CRITERIA", text: "何を守りますか", purpose: "基準", gap: "VALUE",
  });
  store.recordAnswer(q.id, "家族の時間", { protect: "家族の時間" }, { mode: "CHAT", rawText: "家族の時間" });
  store.saveBlockers(version.id, [{
    blockerCode: "EMOTION_AVOIDANCE", score: 0.5, confidence: 0.5,
    evidenceRefs: ["観察"], counterQuestion: "問い", algorithmVersion: "rule-1.0.0",
  }]);
  store.saveReadiness(version.id, "THINK", ["VALUE"], "見学2件まで", "");
  const a = store.addOption(version.id, "迎える", "", "");
  const b = store.addOption(version.id, "見送る", "", "");
  store.setOptionRejectedReason(b.id, "世話の担当が決まらない");
  const c1 = store.addCriterion(version.id, "家族の負担", "", 4, "");
  store.addCriterion(version.id, "費用", "", 3, "");
  store.setScore(a.id, c1.id, 4, "家族の合意が取りやすい");
  store.addEvidence(version.id, "FACT", "月の費用は3万円", "HIGH", null);
  
  
  store.upsertForecast(version.id, "POSITIVE", {
    outcomeStatement: "半年で生活が回る", probability: 0.6, horizonAt: plusDays(180),
    metric: "世話の分担が続く", assumption: "妻が在宅", leadingIndicator: "初月の分担",
  });
  store.upsertForecast(version.id, "NEGATIVE", {
    outcomeStatement: "世話が偏る", probability: 0.3, horizonAt: plusDays(180),
    lossLimit: "月3万円まで",
  });
  const committed = store.commit(decision.id, {
    selectedOptionId: a.id, rationale: "家族の合意が取れた", confidence: 0.7,
    acceptedTradeoff: "自由時間を捨てる", lossLimit: "月3万円まで",
    stopCondition: "見学2件まで", reviewAt: plusDays(30), userConfirmed: true,
    actions: [{ text: "見学を申し込む", actionRole: "ADVANCE", dueAt: plusDays(1), optionId: a.id }],
  });
  if (!committed.ok) throw new Error(JSON.stringify(committed.failures));
  const act = store.getSnapshot().actions[0];
  store.actionEvent(act.id, "COMPLETED", "", "見学の予約メール");
  const outcome = store.recordOutcome(decision.id, {
    resultSummary: "迎えて生活が回っている", outcomeClass: "GOOD",
    attribution: "SELF", externalFactors: "特になし",
  });
  store.recordReflection(outcome.id, {
    predictionGap: "ほぼ想定通り", decisionError: "なし",
    executionError: "初週の分担が曖昧だった", environmentChange: "なし",
    learning: "先に分担を決める",
  });
  store.reviseDecision(decision.id, {
    trigger: "妻の勤務形態が変わった", newEvidence: "在宅勤務が終了",
    priorResultAcknowledged: true, changedAssumption: "平日の世話ができる前提",
    newQuestion: "日中の世話をどうするか",
  });
  store.closeDecision(decision.id, "迎えた", { kind: "COMPLETED", protected: "家族の時間", learning: "先に分担を決める" });
  return store.getSnapshot();
}

describe("対応表と実スキーマの一致", () => {
  const db = fullDB();
  const cols = Object.fromEntries(
    Object.entries(schema as Record<string, string>).map(([t, c]) => [t, new Set(c.split(","))])
  );

  it("テスト用のDBに、すべての表のデータが1件以上入っている", () => {
    for (const map of TABLES) {
      const rows = db[map.key] as unknown[];
      expect(rows.length, `${map.table} のサンプルが空`).toBeGreaterThan(0);
    }
  });

  it("送ろうとする列がすべて実スキーマに存在する", () => {
    const missing: string[] = [];
    for (const map of TABLES) {
      const known = cols[map.table];
      expect(known, `${map.table} がスキーマに無い`).toBeDefined();
      for (const row of db[map.key] as unknown as Record<string, unknown>[]) {
        for (const col of Object.keys(toRow(map, row, "u1"))) {
          if (!known.has(col)) missing.push(`${map.table}.${col}`);
        }
      }
    }
    expect([...new Set(missing)]).toEqual([]);
  });

  it("NOT NULL の主要な列が空にならない", () => {
    for (const map of TABLES) {
      for (const row of db[map.key] as unknown as Record<string, unknown>[]) {
        const r = toRow(map, row, "u1");
        expect(r.user_id, `${map.table}.user_id`).toBe("u1");
        expect(r.id, `${map.table}.id`).toBeTruthy();
      }
    }
  });
});
