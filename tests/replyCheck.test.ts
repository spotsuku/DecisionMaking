// 会話の返しの検査。
// 実際に本番で出た崩れ方を、そのまま固定して二度と通さない。

import { describe, it, expect } from "vitest";
import { checkReply, shouldReject } from "../src/lib/ai/replyCheck";

describe("実際に出た崩れた返しを記録する", () => {
  it("伝聞の前置き + 発言のなぞり返しを弾く", () => {
    const r = checkReply(
      "ワンチャン行けるなら出資してほしいというお気持ちがあるそうですが、今ご自身として何か悩ましく思っていることやためらいがある理由について、他に思い当たることはありますか?",
      "ワンチャン行けるなら出資してほしい"
    );
    expect(r).not.toBeNull();
  });

  it("「とのことですが」で相手の発言をなぞる返しを弾く", () => {
    const r = checkReply(
      "過去に増田さんがスタートアップ出資で苦い経験があったとのことですが、そのことについてご自身が気にしていることや、最終確認をしたいと思っている理由で思い当たることはありますか?",
      "スタートアップ出資に過去に苦い経験があるので基本は無理と言われているが最終確認をしたいだけです"
    );
    expect(r?.code).toBe("HEARSAY");
  });

  it("前回と同じ語尾で終わる返しを弾く(同じ型の繰り返し)", () => {
    const r = checkReply(
      "その件で、他に気になっていることはありますか?",
      "特に思いつかない",
      "いまの状況で、迷っていることはありますか?"
    );
    expect(r?.code).toBe("SAME_SHAPE");
  });

  it("長すぎる返しを弾く", () => {
    // 指示を渡さなくなったぶん、ふつうの返事は通す。壊れている長さだけ弾く
    expect(checkReply("あ".repeat(120), "短い発言")).toBeNull();
    expect(checkReply("あ".repeat(420), "短い発言")?.code).toBe("TOO_LONG");
  });

  it("空の返しを弾く", () => {
    expect(checkReply("   ", "発言")?.code).toBe("EMPTY");
  });
});

describe("自然な返しは通す", () => {
  it("「特にない」に手がかりを添えて聞き直す返しは通る", () => {
    const r = checkReply(
      "たとえば増田さんとの今後の関係など、思い出すことがあれば教えてください。",
      "特にない"
    );
    expect(r).toBeNull();
  });

  it("短く受け止めて、次に進む返しは通る", () => {
    const r = checkReply(
      "断られる前提でも確認しておきたいのですね。それはいつまでにしますか?",
      "スタートアップ出資に過去に苦い経験があるので基本は無理と言われているが最終確認をしたいだけです"
    );
    expect(r).toBeNull();
  });

  it("問いだけを返すのも通る", () => {
    expect(checkReply("それは、いつまでに決まっていないと困りますか?", "来月には動きたい")).toBeNull();
  });

  it("短い発言はなぞりとみなさない(「はい」等で弾かない)", () => {
    expect(checkReply("そうなんですね。いつ頃までに決めますか?", "はい")).toBeNull();
  });
});


describe("差し戻すのは、画面が壊れるものだけ", () => {
  it("空と長すぎは差し戻す", () => {
    expect(shouldReject(checkReply("", "発言"))).toBe(true);
    expect(shouldReject(checkReply("あ".repeat(420), "発言"))).toBe(true);
    expect(shouldReject(checkReply("あ".repeat(120), "発言"))).toBe(false);
  });

  it("文体の崩れは記録するが、差し戻さない", () => {
    // 定型文へ落とすと会話の流れが切れ、かえって不自然になる
    const stiff = checkReply(
      "過去に苦い経験があったとのことですが、思い当たることはありますか?",
      "過去に苦い経験があるので基本は無理と言われています"
    );
    expect(stiff).not.toBeNull();
    expect(shouldReject(stiff)).toBe(false);
  });

  it("問題が無ければ差し戻さない", () => {
    expect(shouldReject(checkReply("それはいつまでにしますか?", "来月には動きたい"))).toBe(false);
  });
});
