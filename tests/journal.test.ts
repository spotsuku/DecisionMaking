// 書き出しからの決断候補抽出のテスト

import { describe, it, expect } from "vitest";
import { extractCandidates, candidateTitle, toDecisionShape } from "../src/lib/journal";

const texts = (text: string) => extractCandidates(text).map((c) => c.text);
const kindOf = (text: string, needle: string) =>
  extractCandidates(text).find((c) => c.text.includes(needle))?.kind;

describe("音声入力の細切れを1つの問いに復元する", () => {
  // 実際に取りこぼした入力。音声入力は句点が細切れに入る。
  const shiba = [
    "えーと豆柴の小太郎を。",
    "買うかどうか。",
    "検討しています。",
    " 奥さんが育てることになり 僕が欲しいと言っていますが責任を取れないのではないかという大問題がございます。",
    " どうしたらいいですか。",
  ].join("\n");

  it("助詞で終わる断片を次とつなぎ、フィラーを落として問いにする", () => {
    expect(texts(shiba)).toContain("豆柴の小太郎を買うかどうか");
  });

  it("「かどうか」は動詞を問わず拾う(買う/辞める/受ける)", () => {
    expect(texts("転職するかどうか")).toContain("転職するかどうか");
    expect(texts("この案件を受けるかどうか")).toContain("この案件を受けるかどうか");
    expect(texts("会社を辞めるかどうか")).toContain("会社を辞めるかどうか");
  });

  it("連体詞の「あの」「その」は消さない(フィラーとの誤判定を防ぐ)", () => {
    expect(texts("あの返信、3日放置してる")).toContain("あの返信、3日放置してる");
    expect(texts("その案件を続けるかどうか")).toContain("その案件を続けるかどうか");
    // 読点・空白が続くときだけ言いよどみとして落とす
    expect(texts("なんか、ずっと決められない")).toContain("ずっと決められない");
  });

  it("問いの形はQUESTION、停滞の兆候はSIGNALに分ける", () => {
    expect(kindOf(shiba, "買うかどうか")).toBe("QUESTION");
    expect(kindOf(shiba, "検討しています")).toBe("SIGNAL");
    expect(kindOf(shiba, "どうしたらいい")).toBe("SIGNAL");
  });

  it("問いの形を停滞の兆候より先に返す", () => {
    const kinds = extractCandidates(shiba).map((c) => c.kind);
    expect(kinds[0]).toBe("QUESTION");
    expect(kinds.lastIndexOf("QUESTION")).toBeLessThan(kinds.indexOf("SIGNAL"));
  });
});

describe("設計書1.1が挙げる回避表現を兆候として拾う", () => {
  it("検討している / 情報が足りない / 両方走らせる", () => {
    expect(kindOf("まだ検討しています", "検討")).toBe("SIGNAL");
    expect(kindOf("判断する情報が足りない", "情報")).toBe("SIGNAL");
    expect(kindOf("とりあえず両方を走らせています", "両方")).toBe("SIGNAL");
  });

  it("放置・先延ばし・期限切れのサイン", () => {
    const t = [
      "案件Xはずるずる続いている",
      "週末の家族旅行の宿、まだ取ってない",
      "健康診断、また後回しにしてる",
      "オフィスの移転は誰も決めてない",
    ].join("。");
    const found = texts(t);
    expect(found.some((s) => s.includes("ずるずる"))).toBe(true);
    expect(found.some((s) => s.includes("まだ取ってない"))).toBe(true);
    expect(found.some((s) => s.includes("後回し"))).toBe(true);
    // 「誰も決めてない」の報告部分は落として、決めることの形にする
    expect(found.some((s) => s.includes("オフィスの移転"))).toBe(true);
  });
});

describe("拾いすぎない", () => {
  it("迷いも停滞も含まない文は候補にしない", () => {
    expect(extractCandidates("今日は晴れていて気持ちがいい。会議は3件あった。")).toHaveLength(0);
  });

  it("短すぎる断片は拾わない", () => {
    expect(extractCandidates("迷う。")).toHaveLength(0);
  });

  it("問いは最大5件、兆候は最大3件、重複なし", () => {
    const many = [
      ...Array.from({ length: 8 }, (_, i) => `案件${i}を続けるかどうか`),
      ...Array.from({ length: 6 }, (_, i) => `対応${i}を後回しにしている`),
    ].join("。");
    const result = extractCandidates(many);
    expect(result.filter((c) => c.kind === "QUESTION")).toHaveLength(5);
    expect(result.filter((c) => c.kind === "SIGNAL")).toHaveLength(3);
    expect(new Set(result.map((c) => c.text)).size).toBe(result.length);
  });
});

describe("candidateTitle", () => {
  it("30文字に丸める", () => {
    const long = "とても長い候補文で、これは間違いなく三十文字を超えるはずの文章になっています";
    expect(candidateTitle(long).length).toBeLessThanOrEqual(30);
    expect(candidateTitle("短い候補")).toBe("短い候補");
  });
});

describe("迷いの報告を、決めることの形に直す", () => {
  it("末尾の「迷ってます」「悩んでいる」を落とす", () => {
    expect(toDecisionShape("北海道の経営者に出資してもらうかどうか迷ってます")).toBe(
      "北海道の経営者に出資してもらうかどうか"
    );
    expect(toDecisionShape("北海道の経営者から出資を受けるかどうか、ずっと悩んでいる")).toBe(
      "北海道の経営者から出資を受けるかどうか"
    );
    expect(toDecisionShape("オフィスを移転するかどうか検討しています")).toBe("オフィスを移転するかどうか");
    expect(toDecisionShape("犬を飼うかどうか決めきれない")).toBe("犬を飼うかどうか");
  });

  it("落とすと意味が消えるものは、そのまま残す", () => {
    // 幹が短すぎる場合。読めない候補を出すより、元の文の方がよい
    expect(toDecisionShape("迷ってます")).toBe("迷ってます");
  });

  it("本人の言葉は書き換えない。切るだけ", () => {
    const src = "増田石油さんに出資のリマインドをするかどうか迷ってる";
    expect(src).toContain(toDecisionShape(src));
  });

  it("候補として取り出す時点で、この形になっている", () => {
    expect(extractCandidates("北海道の経営者に出資してもらうかどうか迷ってます").map((c) => c.text)).toEqual([
      "北海道の経営者に出資してもらうかどうか",
    ]);
  });
});
