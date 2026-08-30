// 材料の下書き提案のテスト。
// 本人が話していないことを提案しないこと、無理に作らないことを固定する。

import { describe, it, expect } from "vitest";
import { buildProposals, optionsFromQuestion } from "../src/lib/proposals";
import { emptyDB, type DB, type DecisionVersion } from "../src/lib/types";

function version(question: string): DecisionVersion {
  return {
    id: "v1", decisionId: "d1", versionNo: 1, question, ownerRole: "自分",
    authorityScope: "", selectedOptionId: null, rationale: "", confidence: null,
    state: "DIAGNOSING", committedAt: null, createdAt: "2026-08-01T00:00:00Z",
  };
}

function withAnswer(db: DB, code: string, json: Record<string, string>, skipped = false) {
  db.questions.push({ id: `q-${code}`, versionId: "v1", questionCode: code, text: "", purpose: "", gap: "VALUE", sequenceNo: 1 });
  db.answers.push({
    id: `a-${code}`, questionId: `q-${code}`, versionId: "v1", questionCode: code,
    answerText: "", answerJson: json, skipped, submittedAt: "2026-08-02T00:00:00Z",
  });
  return db;
}

describe("問いから選択肢を作る", () => {
  it("「〜かどうか」は、やる案と見送る案になる(壊れた活用を作らない)", () => {
    expect(optionsFromQuestion("犬を迎えるかどうか")).toEqual(["犬を迎える", "見送る"]);
    expect(optionsFromQuestion("転職するかどうか")).toEqual(["転職する", "見送る"]);
    expect(optionsFromQuestion("豆柴の小太郎を買うかどうか")).toEqual(["豆柴の小太郎を買う", "見送る"]);
  });

  it("「AかBか」は2つに割れる", () => {
    expect(optionsFromQuestion("媒体を続けるか、紹介採用に絞るか")).toEqual(["媒体を続ける", "紹介採用に絞る"]);
  });

  it("どちらでもない問いからは作らない(無理に作らない)", () => {
    expect(optionsFromQuestion("採用の進め方をどうするか")).toEqual([]);
    expect(optionsFromQuestion("")).toEqual([]);
  });

  it("長すぎる断片は選択肢にしない", () => {
    expect(optionsFromQuestion("あ".repeat(40) + "かどうか")).toEqual([]);
  });
});

describe("診断の回答から材料を提案する", () => {
  it("受入テスト: 守るもの・諦めるものが判断基準の候補になる", () => {
    const db = withAnswer(emptyDB(), "Q_CRITERIA", { protect: "家族との時間", giveup: "年収の上積み" });
    const ps = buildProposals(db, version("犬を迎えるかどうか"));
    const criteria = ps.filter((p) => p.kind === "CRITERION");
    expect(criteria.map((c) => c.label)).toEqual(["家族との時間", "年収の上積み"]);
    expect(criteria[0].source).toContain("守りたいもの");
  });

  it("まだ確かめていないことが証拠(仮説)の候補になる", () => {
    const db = withAnswer(emptyDB(), "Q_INFO_STOP", { missing: "世話にかかる実際の時間" });
    const ps = buildProposals(db, version("犬を迎えるかどうか"));
    const ev = ps.find((p) => p.kind === "EVIDENCE")!;
    expect(ev.label).toBe("世話にかかる実際の時間");
    expect(ev.evidenceType).toBe("HYPOTHESIS");
  });

  it("長い答えは物差しの名前として短く切る", () => {
    const db = withAnswer(emptyDB(), "Q_CRITERIA", {
      protect: "家で妻が育ててくれること。僕は朝と夜だけ世話をする。",
    });
    const p = buildProposals(db, version("q"))[0];
    expect(p.label).toBe("家で妻が育ててくれること");
  });

  it("スキップした回答からは提案しない", () => {
    const db = withAnswer(emptyDB(), "Q_CRITERIA", { protect: "家族との時間" }, true);
    expect(buildProposals(db, version("q")).filter((p) => p.kind === "CRITERION")).toEqual([]);
  });

  it("答えていなければ何も提案しない(空欄をでっち上げない)", () => {
    expect(buildProposals(emptyDB(), version("採用の進め方をどうするか"))).toEqual([]);
  });

  it("すでに登録済みのものは二度提案しない", () => {
    const db = withAnswer(emptyDB(), "Q_CRITERIA", { protect: "家族との時間" });
    db.criteria.push({
      id: "c1", versionId: "v1", label: "家族との時間", definition: "",
      weight: 3, minimumThreshold: "", createdAt: "2026-08-03T00:00:00Z",
    });
    expect(buildProposals(db, version("q")).filter((p) => p.kind === "CRITERION")).toEqual([]);
  });

  it("すべての提案が、どの回答から来たかを持っている(INV-04)", () => {
    let db = withAnswer(emptyDB(), "Q_CRITERIA", { protect: "家族との時間", giveup: "年収" });
    db = withAnswer(db, "Q_WORST_CASE", { path: "世話が続かない", loss: "月3万円まで" });
    db = withAnswer(db, "Q_INFO_STOP", { missing: "世話の時間" });
    const ps = buildProposals(db, version("犬を迎えるかどうか"));
    expect(ps.length).toBeGreaterThan(4);
    for (const p of ps) expect(p.source, p.label).toBeTruthy();
  });
});
