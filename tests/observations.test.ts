// 「決めずに置いていること」フィードのテスト

import { describe, it, expect } from "vitest";
import { buildObservations } from "../src/lib/observations";
import { emptyDB, type DB, type DecisionState } from "../src/lib/types";

const DAY = 86400000;
const NOW = new Date("2026-08-30T09:00:00Z").getTime();
const ago = (days: number) => new Date(NOW - days * DAY).toISOString();

function withDecision(
  db: DB,
  o: { id: string; title: string; createdAt: string; status?: DecisionState; dueAt?: string | null; reviewAt?: string | null }
): DB {
  db.decisions.push({
    id: o.id,
    title: o.title,
    domain: "WORK",
    status: o.status ?? "DRAFT",
    currentVersionNo: 1,
    dueAt: o.dueAt ?? null,
    reviewAt: o.reviewAt ?? null,
    riskLevel: "NORMAL",
    createdAt: o.createdAt,
    closedAt: null,
    hidden: false,
  });
  db.versions.push({
    id: `v-${o.id}`,
    decisionId: o.id,
    versionNo: 1,
    question: o.title,
    ownerRole: "",
    authorityScope: "",
    selectedOptionId: null,
    rationale: "",
    confidence: null,
    state: o.status ?? "DRAFT",
    committedAt: null,
    createdAt: o.createdAt,
  });
  return db;
}

describe("未確定の決断は必ずフィードに出る", () => {
  it("登録した直後でも「決めずに置いていること」に表示される", () => {
    const db = withDecision(emptyDB(), { id: "d1", title: "豆柴の小太郎を買うかどうか", createdAt: ago(0) });
    const obs = buildObservations(db, NOW);
    expect(obs).toHaveLength(1);
    expect(obs[0].name).toBe("豆柴の小太郎を買うかどうか");
    expect(obs[0].fact).toBe("まだ決めていません");
    expect(obs[0].warn).toBe(false);
  });

  it("日数が経つと考え中の日数を、さらに経つと停滞を伝える", () => {
    const db = emptyDB();
    withDecision(db, { id: "d1", title: "A", createdAt: ago(2) });
    withDecision(db, { id: "d2", title: "B", createdAt: ago(12) });
    const facts = Object.fromEntries(buildObservations(db, NOW).map((o) => [o.name, o.fact]));
    expect(facts["A"]).toBe("2日考え中");
    expect(facts["B"]).toBe("新しい情報が増えないまま、12日たちました");
  });

  it("期限超過は警告として扱う", () => {
    const db = withDecision(emptyDB(), { id: "d1", title: "A", createdAt: ago(10), dueAt: ago(3) });
    const [o] = buildObservations(db, NOW);
    expect(o.warn).toBe(true);
    expect(o.fact).toContain("決断期限を過ぎています");
  });

  it("確定済みで行動中の決断はフィードに出さない", () => {
    const db = emptyDB();
    withDecision(db, { id: "d1", title: "A", createdAt: ago(10), status: "IN_ACTION" });
    expect(buildObservations(db, NOW)).toHaveLength(0);
  });

  it("完了・非表示の決断は除外する", () => {
    const db = emptyDB();
    withDecision(db, { id: "d1", title: "A", createdAt: ago(10), status: "CLOSED" });
    withDecision(db, { id: "d2", title: "B", createdAt: ago(10) });
    db.decisions[1].hidden = true;
    expect(buildObservations(db, NOW)).toHaveLength(0);
  });
});

describe("並び順と件数", () => {
  it("警告を先に、同種では長く置かれているものを上に、最大4件", () => {
    const db = emptyDB();
    withDecision(db, { id: "d1", title: "新しい", createdAt: ago(1) });
    withDecision(db, { id: "d2", title: "古い", createdAt: ago(20) });
    withDecision(db, { id: "d3", title: "期限切れ", createdAt: ago(5), dueAt: ago(1) });
    withDecision(db, { id: "d4", title: "中くらい", createdAt: ago(9) });
    withDecision(db, { id: "d5", title: "5件目", createdAt: ago(3) });
    const obs = buildObservations(db, NOW);
    expect(obs).toHaveLength(4);
    expect(obs[0].name).toBe("期限切れ");
    expect(obs.slice(1).map((o) => o.name)).toEqual(["古い", "中くらい", "5件目"]);
  });
});
