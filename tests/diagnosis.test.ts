// 二層診断・判断可能性ルーター・安全分類・逃避検知のテスト(4.2 / 4.3 / 6.4 / 10.3)

import { describe, it, expect } from "vitest";
import {
  QUESTION_BANK,
  routeReadiness,
  classifySafety,
  detectGatheringEscape,
  detectOptionExpansion,
  selectNextQuestion,
  splitFreeText,
  joinParts,
  assessGaps,
  isNonAnswer,
  chatReply,
  emptyChatState,
  type ChatState,
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
      answerText: "AかBか", answerJson: { question: "AかBか" }, submittedAt: new Date().toISOString(),
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

describe("質問の記入欄(データとして分ける)", () => {
  it("複合質問は欄が分かれている(不足情報と停止条件は別データ)", () => {
    const q = QUESTION_BANK.find((x) => x.code === "Q_INFO_STOP")!;
    expect(q.parts.map((p) => p.key)).toEqual(["missing", "stop"]);
  });

  it("決定者と権限範囲、期限と超過時の影響も別データ", () => {
    expect(QUESTION_BANK.find((x) => x.code === "Q_OWNER")!.parts).toHaveLength(2);
    expect(QUESTION_BANK.find((x) => x.code === "Q_DEADLINE")!.parts).toHaveLength(2);
    expect(QUESTION_BANK.find((x) => x.code === "Q_WORST_CASE")!.parts.map((p) => p.key))
      .toEqual(["path", "loss"]);
  });

  it("すべての質問が1つ以上の記入欄を持ち、keyは質問内で一意", () => {
    for (const q of QUESTION_BANK) {
      expect(q.parts.length).toBeGreaterThan(0);
      expect(new Set(q.parts.map((p) => p.key)).size).toBe(q.parts.length);
      expect(q.parts[0].optional).not.toBe(true); // 先頭欄は必須
    }
  });
});

describe("チャットの自由文を記入欄へ振り分ける", () => {
  const q = (code: string) => QUESTION_BANK.find((x) => x.code === code)!;

  it("受入テスト: 守るものと諦めるものが一続きで語られても、別の欄に入る", () => {
    const r = splitFreeText(
      q("Q_CRITERIA"),
      "家で妻が育ててくれることが重要。僕が朝エサをあげたりできますが、洗濯や散歩などはできない。" +
        "諦めて良いのはお金は払う。朝と夜はしっかりと世話する。"
    );
    expect(r.protect).toContain("重要");
    expect(r.giveup).toContain("諦めて良いのはお金は払う");
    expect(r.protect).not.toContain("諦めて良い");
  });

  it("手掛かりに当たらない文は、直前の文と同じ欄に続けて入れる", () => {
    const r = splitFreeText(q("Q_CRITERIA"), "守りたいのは家族との時間。夜は家にいたい。");
    expect(r.protect).toBe("守りたいのは家族との時間。夜は家にいたい。");
    expect(r.giveup).toBeUndefined();
  });

  it("記入欄が1つの質問は、全文をそのまま入れる", () => {
    const r = splitFreeText(q("Q_FRAME_SENTENCE"), "犬を迎えるかどうか。まだ決めきれない。");
    expect(r.question).toBe("犬を迎えるかどうか。まだ決めきれない。");
  });

  it("本人の言葉を要約も追記もしない(全文が復元できる)", () => {
    const text = "分からないのは世話の時間。見学2件まで調べたら、それ以上は調べない。";
    const r = splitFreeText(q("Q_INFO_STOP"), text);
    expect(Object.values(r).join("")).toBe(text);
  });

  it("空文字は欄を作らない", () => {
    expect(splitFreeText(q("Q_CRITERIA"), "   ")).toEqual({});
  });

  it("joinParts は欄が複数のときだけラベルを付ける", () => {
    expect(joinParts(q("Q_CRITERIA"), { protect: "家族の時間", giveup: "年収" }))
      .toBe("守りたいもの: 家族の時間\n諦めてもいいもの: 年収");
    expect(joinParts(q("Q_FRAME_SENTENCE"), { question: "犬を迎えるか" })).toBe("犬を迎えるか");
  });
});

describe("スキップした回答(わからないで飛ばす)", () => {
  it("スキップは記録に残るが、成立条件を埋めたとは数えない", () => {
    const db: DB = emptyDB();
    const v = makeVersion({ question: "犬を迎えるか", ownerRole: "自分" });
    db.versions.push(v);
    db.questions.push({
      id: "q1", versionId: v.id, questionCode: "Q_ACTION_24H",
      text: "", purpose: "", gap: "EXECUTION", sequenceNo: 1,
    });
    db.answers.push({
      id: "a1", questionId: "q1", versionId: v.id, questionCode: "Q_ACTION_24H",
      answerText: "", answerJson: {}, skipped: true, submittedAt: new Date().toISOString(),
    });
    const execution = assessGaps(db, v, new Date().toISOString()).find((g) => g.gap === "EXECUTION")!;
    expect(execution.missing).toBe(true);
    // 同じ質問は繰り返さない
    expect(selectNextQuestion(db, v, new Date().toISOString())?.code).not.toBe("Q_ACTION_24H");
  });
});

describe("チャットの受け答え(噛み合わせ)", () => {
  const q = (code: string) => QUESTION_BANK.find((x) => x.code === code)!;

  it("内容のない返事を見分ける", () => {
    for (const t of ["それが分からない", "わからない", "わかんないです", "特にない", "思いつかない", "不明", "うーん"]) {
      expect(isNonAnswer(t), t).toBe(true);
    }
  });

  it("「分からない」を含んでいても、中身のある文は答えとして扱う", () => {
    for (const t of [
      "分からないのは世話にかかる時間です",
      "妻がどう思うか分からないので、まず聞いてみたい",
      "わからないことが多いが、費用だけは調べた",
    ]) {
      expect(isNonAnswer(t), t).toBe(false);
    }
  });

  it("受入テスト: 「それが分からない」を欄に入れず、言い換えて聞き直す", () => {
    const r = chatReply(q("Q_INFO_STOP"), emptyChatState(), "それが分からない");
    expect(r.turn.kind).toBe("REPHRASE");
    expect(r.values).toEqual({}); // 記録しない
  });

  it("言い換えても答えが出なければ、分からないまま記録して先へ進む", () => {
    const state = { ...emptyChatState(), rephrased: true };
    const r = chatReply(q("Q_INFO_STOP"), state, "やっぱり分からない");
    expect(r.turn.kind).toBe("SKIP");
  });

  it("必須の欄が空のまま次の質問へ進まず、その欄だけを聞き直す", () => {
    const r = chatReply(q("Q_CRITERIA"), emptyChatState(), "守りたいのは家族との時間");
    expect(r.turn.kind).toBe("FOLLOW_UP");
    expect(r.turn.kind === "FOLLOW_UP" && r.turn.partKey).toBe("giveup");
    expect(r.values.protect).toBe("守りたいのは家族との時間");
  });

  it("聞き直した欄に答えると記録して次へ進む", () => {
    const state: ChatState = { values: { protect: "家族との時間" }, rephrased: false, askingPart: "giveup" };
    const r = chatReply(q("Q_CRITERIA"), state, "年収の上積み");
    expect(r.turn.kind).toBe("FILED");
    expect(r.values).toEqual({ protect: "家族との時間", giveup: "年収の上積み" });
  });

  it("聞き直した欄が分からなくても、答えた分は残して先へ進む", () => {
    const state: ChatState = { values: { protect: "家族との時間" }, rephrased: false, askingPart: "giveup" };
    const r = chatReply(q("Q_CRITERIA"), state, "分からない");
    expect(r.turn.kind).toBe("FILED");
    expect(r.values).toEqual({ protect: "家族との時間" });
  });

  it("任意の欄は空でも聞き直さない", () => {
    const r = chatReply(q("Q_FEELING"), emptyChatState(), "楽しみだけど責任が怖い");
    expect(r.turn.kind).toBe("FILED");
  });

  it("一度に両方答えた場合は聞き直さない", () => {
    const r = chatReply(q("Q_CRITERIA"), emptyChatState(), "守りたいのは家族の時間。諦めていいのは年収。");
    expect(r.turn.kind).toBe("FILED");
  });
});

describe("すでに分かっていることは聞かない", () => {
  const iso = new Date(Date.now() + 7 * 86400000).toISOString();

  it("受入テスト: 問いが入っていれば、期限が空でも問いを聞き直さない", () => {
    const db: DB = emptyDB();
    const v = makeVersion({ question: "増田石油さんに出資リマインドするかどうか" });
    db.versions.push(v);
    // 期限が無いと「問い」の成立条件は未達だが、問い自体はもう分かっている
    const q = selectNextQuestion(db, v, null);
    expect(q?.code).not.toBe("Q_FRAME_SENTENCE");
  });

  it("期限だけが空なら、期限を聞く", () => {
    const db: DB = emptyDB();
    const v = makeVersion({ question: "AかBか", ownerRole: "自分" });
    db.versions.push(v);
    expect(selectNextQuestion(db, v, null)?.code).toBe("Q_DEADLINE");
  });

  it("決定者が入っていれば、決定者は聞かない", () => {
    const db: DB = emptyDB();
    const v = makeVersion({ question: "AかBか", ownerRole: "自分" });
    db.versions.push(v);
    expect(selectNextQuestion(db, v, iso)?.code).not.toBe("Q_OWNER");
  });

  it("何も入っていなければ、これまで通り問いから聞く", () => {
    const db: DB = emptyDB();
    const v = makeVersion();
    db.versions.push(v);
    expect(selectNextQuestion(db, v, null)?.code).toBe("Q_FRAME_SENTENCE");
  });
});
