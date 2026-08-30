import { describe, expect, it } from "vitest";
import { selfQuestions, whoDecides } from "../src/lib/ownership";

describe("誰が決めるか", () => {
  it("決める人に本人が入っていれば、本人の決断", () => {
    expect(whoDecides("出資を受けるかどうか", "自分")).toBe("SELF");
    expect(whoDecides("出資を受けるかどうか", "自分(最終決裁は役員)")).toBe("SELF");
    expect(whoDecides("引っ越すかどうか", "夫婦で")).toBe("SELF");
  });

  it("決める人が別の誰かなら、相手の決断", () => {
    expect(whoDecides("出資が決まるかどうか", "やまやの役員会")).toBe("OTHERS");
    expect(whoDecides("進めるかどうか", "先方")).toBe("OTHERS");
    expect(whoDecides("進めるかどうか", "田中さん")).toBe("OTHERS");
  });

  it("決める人が空でも、問いの言い方で相手の決断と分かる", () => {
    expect(whoDecides("今日のやまやの出資が決まるかどうか", "")).toBe("OTHERS");
    expect(whoDecides("審査に通るかどうか", "")).toBe("OTHERS");
    expect(whoDecides("先方の返事を待っている", "")).toBe("OTHERS");
  });

  it("手がかりがなければ尋ねない", () => {
    expect(whoDecides("犬を迎えるかどうか", "")).toBe("UNKNOWN");
    expect(whoDecides("どの物件に移転するか", "経営会議")).toBe("UNKNOWN");
  });

  it("言い換えは、相手の呼び名をそのまま使う(語尾を機械で変えない)", () => {
    const qs = selfQuestions("やまやの役員会");
    expect(qs[0]).toBe("やまやの役員会の結論を、いつまで待つか");
    expect(qs).toHaveLength(3);
    expect(selfQuestions("")[0]).toBe("相手の結論を、いつまで待つか");
  });

  it("言い換えた問いは、自分が決められることになっている", () => {
    for (const q of selfQuestions("先方")) {
      expect(whoDecides(q, "自分")).toBe("SELF");
    }
  });
});
