// AI補助の合流ルールのテスト。
// AIが落ちてもルールの結果で成立すること、AIの作文を通さないことを固定する。

import { describe, it, expect } from "vitest";
import { mergeCandidates, mergeSplit } from "../src/lib/ai/merge";
import * as prompts from "../src/lib/ai/prompts";
import { toChatMessages } from "../src/lib/ai/chat";
import type { Candidate } from "../src/lib/journal";

const rule = (text: string, kind: Candidate["kind"] = "QUESTION"): Candidate => ({ text, kind });

describe("候補の合流(ルール優先・AIは追加のみ)", () => {
  it("AIが何も返さなくても、ルールの結果はそのまま残る", () => {
    const r = mergeCandidates([rule("犬を飼うかどうか")], []);
    expect(r).toEqual([{ text: "犬を飼うかどうか", kind: "QUESTION", source: "RULE" }]);
  });

  it("ルールが取りこぼした候補だけAIから足す", () => {
    const r = mergeCandidates([rule("犬を飼うかどうか")], [
      { text: "犬を飼うかどうか。", kind: "QUESTION" }, // 重複
      { text: "実家に帰省する日程を決めていない", kind: "SIGNAL" },
    ]);
    expect(r).toHaveLength(2);
    expect(r[1]).toMatchObject({ source: "AI", kind: "SIGNAL" });
  });

  it("同じ内容は表記が違っても二重に出さない", () => {
    const r = mergeCandidates([rule("転職するかどうか")], [{ text: "「転職するかどうか」", kind: "QUESTION" }]);
    expect(r).toHaveLength(1);
  });

  it("問いを先に、ルール由来を各グループの先頭に並べる", () => {
    const r = mergeCandidates([rule("保留にしている", "SIGNAL")], [{ text: "AかBか選ぶ", kind: "QUESTION" }]);
    expect(r.map((c) => c.kind)).toEqual(["QUESTION", "SIGNAL"]);
  });

  it("空文字は捨てる", () => {
    expect(mergeCandidates([], [{ text: "   ", kind: "QUESTION" }])).toHaveLength(0);
  });
});

describe("欄への振り分けの合流(作文を通さない)", () => {
  const said = "守りたいのは家族との時間。諦めていいのは年収の上積み。";
  const keys = ["protect", "giveup"];
  const rules = { protect: "守りたいのは家族との時間。", giveup: "諦めていいのは年収の上積み。" };

  it("本人の発言に実在する文なら、AIの振り分けを採用する", () => {
    const r = mergeSplit(said, rules, { protect: "守りたいのは家族との時間。", giveup: "年収の上積み" }, keys);
    expect(r.source).toBe("AI");
    expect(r.values.giveup).toBe("年収の上積み");
  });

  it("受入テスト: 本人が言っていない文が混ざったら、ルールの結果に戻す", () => {
    const r = mergeSplit(said, rules, { protect: "家族を大切にしたいという価値観", giveup: "年収" }, keys);
    expect(r.source).toBe("RULE");
    expect(r.values).toEqual(rules);
  });

  it("AIが空を返したらルールの結果を使う", () => {
    expect(mergeSplit(said, rules, {}, keys)).toEqual({ values: rules, source: "RULE" });
  });
});

describe("書き出しの会話に指示を付けない", () => {
  it("プロンプトを持たない(会話そのものだけを渡す)", () => {
    // 指示を書くほど会話が誘導される。役だけ与えたらカウンセリングの型に流れ、
    // 形を指定したら同じ型を繰り返した。ここに関数が復活したら、それは後退
    expect("brainstormPrompt" in prompts).toBe(false);
  });

  it("本人=user、アプリ=assistant で、やりとりの順序をそのまま渡す", () => {
    expect(
      toChatMessages([
        { from: "USER", text: "出資を受けるかどうか" },
        { from: "APP", text: "いつまでに決めますか?" },
        { from: "USER", text: "今月末まで" },
      ])
    ).toEqual([
      { role: "user", content: "出資を受けるかどうか" },
      { role: "assistant", content: "いつまでに決めますか?" },
      { role: "user", content: "今月末まで" },
    ]);
  });

  it("先頭のアプリ側の呼びかけは落とす(APIはuserから始まる必要がある)", () => {
    const m = toChatMessages([
      { from: "APP", text: "いま頭にあることを、そのまま話してみてください。" },
      { from: "USER", text: "出資を受けるかどうか" },
    ]);
    expect(m).toHaveLength(1);
    expect(m[0]).toEqual({ role: "user", content: "出資を受けるかどうか" });
  });

  it("空の発言は渡さない", () => {
    expect(toChatMessages([{ from: "USER", text: "  " }])).toEqual([]);
  });
});
