// 書き出しからの決断候補抽出のテスト

import { describe, it, expect } from "vitest";
import { extractCandidates, candidateTitle } from "../src/lib/journal";

describe("決断候補の抽出", () => {
  it("迷い・未決のパターンを含む文を候補として拾う", () => {
    const text = [
      "採用のことばかり考えている。紹介だけで足りるのか不安。",
      "オフィスの契約更新が11月。移転するかどうか、誰も決めてない。",
      "案件Xはずるずる続いている。やめるならやめると言わないと。",
      "週末の家族旅行の宿、まだ取ってない。",
      "健康診断、また後回しにしてる。",
    ].join("\n");
    const c = extractCandidates(text);
    expect(c.some((s) => s.includes("移転するかどうか"))).toBe(true);
    expect(c.some((s) => s.includes("ずるずる"))).toBe(true);
    expect(c.some((s) => s.includes("まだ取ってない"))).toBe(true);
    expect(c.some((s) => s.includes("後回し"))).toBe(true);
  });

  it("迷いを含まない文は候補にしない", () => {
    const c = extractCandidates("今日は晴れていて気持ちがいい。会議は3件あった。");
    expect(c).toHaveLength(0);
  });

  it("候補は最大5件・重複なし", () => {
    const line = "AするかどうかBするかどうか迷っている。";
    const text = Array.from({ length: 10 }, (_, i) => `案件${i}を続けるかどうか迷っている`).join("。");
    const c = extractCandidates(text + "。" + line);
    expect(c.length).toBeLessThanOrEqual(5);
    expect(new Set(c).size).toBe(c.length);
  });

  it("短すぎる断片は拾わない", () => {
    expect(extractCandidates("迷う。")).toHaveLength(0);
  });

  it("タイトルは30文字に丸める", () => {
    const long = "とても長い候補文で、これは間違いなく三十文字を超えるはずの文章になっています";
    expect(candidateTitle(long).length).toBeLessThanOrEqual(30);
    expect(candidateTitle("短い候補")).toBe("短い候補");
  });
});
