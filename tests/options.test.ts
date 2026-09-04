// 選択肢を絞る工程のテスト(出す→削る→選ぶ)。
// 画面ではなくルールとストアだけを見る。

import { describe, it, expect, beforeEach } from "vitest";
import {
  MARK_CYCLE,
  MARK_LABEL,
  OPTION_PATTERNS,
  REJECT_REASONS,
  displayLabel,
  markFromScore,
  needsFilling,
  nextMark,
  optionFromPattern,
  optionLetter,
  splitCriteriaText,
} from "../src/lib/options";
import { store } from "../src/lib/store";

const plusDays = (n: number) => new Date(Date.now() + n * 86400000).toISOString();

beforeEach(() => {
  store.resetAll();
});

function setup() {
  return store.createDecision({
    title: "業務委託の依頼を受けるか",
    question: "この依頼を受けるか、断るか",
    ownerRole: "自分",
    domain: "WORK",
    dueAt: plusDays(7),
  });
}

/** 診断で「何を守り、何を諦めますか?」に答えた状態を作る */
function answerCriteria(versionId: string, protect: string, giveup: string) {
  const q = store.recordQuestion(versionId, {
    code: "Q_CRITERIA",
    text: "この選択で、何を守り、何を諦めますか?",
    purpose: "判断基準",
    gap: "VALUE",
  });
  store.recordAnswer(q.id, `${protect} / ${giveup}`, { protect, giveup });
}

describe("しるし(点数をつけない)", () => {
  it("押すたびに — ○ △ × ? の順で回り、一周して戻る", () => {
    let m = nextMark("NONE");
    expect(m).toBe("GOOD");
    m = nextMark(m);
    expect(m).toBe("MIXED");
    m = nextMark(m);
    expect(m).toBe("BAD");
    m = nextMark(m);
    expect(m).toBe("UNKNOWN");
    expect(nextMark(m)).toBe("NONE");
  });

  it("しるしは5種類だけで、1〜5の点数は持たない", () => {
    expect(MARK_CYCLE).toHaveLength(5);
    expect(Object.values(MARK_LABEL)).toEqual(["—", "○", "△", "×", "?"]);
  });

  it("保存した値から同じしるしに戻る", () => {
    const { version } = setup();
    const o = store.addOption(version.id, "条件をつけて受ける", "", "");
    const c = store.addCriterion(version.id, "納期", "", 5, "");
    for (const mark of ["GOOD", "MIXED", "BAD", "UNKNOWN", "NONE"] as const) {
      store.setMark(o.id, c.id, mark);
      const s = store.getSnapshot().optionScores.find((x) => x.optionId === o.id && x.criterionId === c.id);
      expect(markFromScore(s?.score, s?.uncertainty)).toBe(mark);
    }
  });

  it("「まだ分からない」は不確実として残り、点数として扱われない", () => {
    const { version } = setup();
    const o = store.addOption(version.id, "受ける", "", "");
    const c = store.addCriterion(version.id, "納期", "", 5, "");
    store.setMark(o.id, c.id, "UNKNOWN");
    const s = store.getSnapshot().optionScores.find((x) => x.optionId === o.id);
    expect(s?.uncertainty).toBe(1);
    expect(s?.score).toBe(0);
  });
});

describe("二択の外に案を作る型", () => {
  it("型は中身が空の案として起き、記入が必要だと分かる", () => {
    const label = optionFromPattern(OPTION_PATTERNS[0]);
    expect(label).toContain(OPTION_PATTERNS[0]);
    expect(needsFilling(label)).toBe(true);
  });

  it("本人が書き直したら、記入待ちではなくなる", () => {
    const { version } = setup();
    const o = store.addOption(version.id, optionFromPattern("条件をつけて受ける"), "", "二択の外の案", "SUGGESTED");
    store.renameOption(o.id, "着手を1ヶ月後にして受ける");
    const after = store.getSnapshot().options.find((x) => x.id === o.id);
    expect(after?.label).toBe("着手を1ヶ月後にして受ける");
    expect(needsFilling(after!.label)).toBe(false);
  });

  it("空文字では書き換わらない", () => {
    const { version } = setup();
    const o = store.addOption(version.id, "受ける", "", "");
    store.renameOption(o.id, "   ");
    expect(store.getSnapshot().options.find((x) => x.id === o.id)?.label).toBe("受ける");
  });

  it("A / B / C … の見出しになる", () => {
    expect([0, 1, 2].map(optionLetter)).toEqual(["A", "B", "C"]);
  });
});

describe("外す・戻す", () => {
  it("外した案は理由とともに残る(あとで説明できる)", () => {
    const { version } = setup();
    const o = store.addOption(version.id, "断る", "", "");
    store.deactivateOption(o.id, "");
    store.setOptionRejectedReason(o.id, REJECT_REASONS[0]);
    const after = store.getSnapshot().options.find((x) => x.id === o.id);
    expect(after?.active).toBe(false);
    expect(after?.rejectedReason).toBe(REJECT_REASONS[0]);
  });

  it("戻したときは外した理由を消す(記録が矛盾しないように)", () => {
    const { version } = setup();
    const o = store.addOption(version.id, "断る", "", "");
    store.deactivateOption(o.id, "期限に合わない");
    store.reactivateOption(o.id);
    const after = store.getSnapshot().options.find((x) => x.id === o.id);
    expect(after?.active).toBe(true);
    expect(after?.rejectedReason).toBeNull();
  });
});

describe("判断基準を診断の答えから起こす", () => {
  it("改行と句点で切り、箇条書きの記号は落とす", () => {
    expect(splitCriteriaText("・収入の安定\n家族との時間、健康")).toEqual([
      "収入の安定",
      "家族との時間",
      "健康",
    ]);
  });

  it("行は3つまで。長い文は切り詰める", () => {
    expect(splitCriteriaText("収入\n時間\n健康\n評価")).toHaveLength(3);
    expect(splitCriteriaText("あ".repeat(40))[0]).toHaveLength(24);
  });

  it("1文字だけの断片は行にしない", () => {
    expect(splitCriteriaText("収入。あ。時間")).toEqual(["収入", "時間"]);
  });

  it("守りたいものは重く、諦めてもいいものは軽い行になる", () => {
    const { version } = setup();
    answerCriteria(version.id, "収入の安定", "肩書き");
    const seeded = store.seedCriteriaFromDiagnosis(version.id);
    expect(seeded.map((c) => c.label)).toEqual(["収入の安定", "肩書き"]);
    expect(seeded[0].weight).toBeGreaterThanOrEqual(4);
    expect(seeded[1].weight).toBeLessThan(4);
  });

  it("すでに基準があるときは触らない(本人が直したものを上書きしない)", () => {
    const { version } = setup();
    store.addCriterion(version.id, "自分で書いた基準", "", 3, "");
    answerCriteria(version.id, "収入の安定", "");
    const seeded = store.seedCriteriaFromDiagnosis(version.id);
    expect(seeded.map((c) => c.label)).toEqual(["自分で書いた基準"]);
  });
});

describe("選ぶ", () => {
  it("選んだ案を記録し、押し直すと解除される", () => {
    const { version } = setup();
    const a = store.addOption(version.id, "受ける", "", "");
    store.selectOption(version.id, a.id);
    expect(store.getSnapshot().versions.find((v) => v.id === version.id)?.selectedOptionId).toBe(a.id);
    store.selectOption(version.id, null);
    expect(store.getSnapshot().versions.find((v) => v.id === version.id)?.selectedOptionId).toBeNull();
  });
});

describe("記入待ちの印は画面に出さない", () => {
  it("型から起こした案は、印を外した文で表示される", () => {
    expect(displayLabel(optionFromPattern("一部だけ受ける"))).toBe("一部だけ受ける");
  });

  it("本人が書いた案はそのまま", () => {
    expect(displayLabel("金額を下げて受ける")).toBe("金額を下げて受ける");
  });
});
