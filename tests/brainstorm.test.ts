// 書き出しの対話のテスト。
// 一番の目的は「同じことを二度聞かない」を固定すること。
// 文面で既出を判定していた実装は、AIが言い換えた瞬間に判定が崩れ、
// 同じ問いを永久に返していた。

import { describe, it, expect } from "vitest";
import {
  addAppTurn, addUserTurn, emptyBrainstorm, fallbackPrompt,
  readyToDecide, shouldInvite, transcript, USEFUL_TO_SURFACE, type BrainstormState,
} from "../src/lib/brainstorm";

/** 実際の会話のように、問いを出して答えるを繰り返す */
function converse(said: string[], rewriteByAi = false): BrainstormState {
  let s = emptyBrainstorm();
  const opening = fallbackPrompt(s);
  s = addAppTurn(s, opening.text, opening.key);
  for (const text of said) {
    s = addUserTurn(s, text);
    const p = fallbackPrompt(s);
    // AIが文面を書き換えても、キーで既出が分かること
    s = addAppTurn(s, rewriteByAi ? `${p.text}(AIが言い換えた文)` : p.text, p.key);
  }
  return s;
}

describe("同じことを二度聞かない", () => {
  it("受入テスト: AIが文面を書き換えても、同じ問いに戻らない", () => {
    const s = converse(
      ["出資の件、リマインドするか迷ってる", "他にはない", "出来ればリマインドして出資してほしい", "出資してもらう結果", "分からない"],
      true
    );
    const asked = s.turns.filter((t) => t.from === "APP").map((t) => t.text);
    expect(new Set(asked).size).toBe(asked.length);
  });

  it("同じキーは記録に二度入らない", () => {
    let s = addAppTurn(emptyBrainstorm(), "問い", "deadline");
    s = addAppTurn(s, "言い換えた問い", "deadline");
    expect(s.asked).toEqual(["deadline"]);
  });

  it("出した問いは、次の候補から外れる", () => {
    let s = addUserTurn(emptyBrainstorm(), "犬を飼うか迷う");
    const first = fallbackPrompt(s);
    s = addAppTurn(s, first.text, first.key);
    expect(fallbackPrompt(s).key).not.toBe(first.key);
  });
});

describe("会話が前へ進む", () => {
  it("定型を出し切っても会話は終わらせず、開いた問いを返す", () => {
    let s = converse(["犬を飼うか迷う", "転職も決めきれない", "犬の方", "今週まで", "自分で決められる", "不安だから", "何も進まない"]);
    for (let i = 0; i < 10; i++) {
      const p = fallbackPrompt(s);
      s = addAppTurn(addUserTurn(s, `答え${i}`), p.text, p.key);
    }
    const last = fallbackPrompt(s);
    expect(last.key).toBe("open");
    expect(last.text).toBeTruthy();
  });

  it("候補が2件以上あれば、どれが本命かを聞く段に入る", () => {
    const s = converse(["犬を飼うかどうか迷ってる", "転職するかどうかも決めきれない"]);
    expect(s.asked).toContain("pick");
  });

  it("候補が出ていないうちは、絞る問いを出さない", () => {
    let s = addUserTurn(emptyBrainstorm(), "うーん、特にないかな");
    expect(fallbackPrompt(s).key).not.toBe("pick");
    s = addUserTurn(s, "強いて言えば疲れている");
    expect(fallbackPrompt(s).key).not.toBe("pick");
  });
});

describe("候補の抽出", () => {
  it("会話全体から取り直す(あとの発言も拾う)", () => {
    let s = addUserTurn(emptyBrainstorm(), "うーん、特にないかな");
    expect(s.candidates).toHaveLength(0);
    s = addUserTurn(s, "あ、豆柴の小太郎を買うかどうか検討しています。");
    expect(s.candidates.map((c) => c.text).join()).toContain("小太郎");
  });

  it("本人の発言だけが本文になる(アプリの問いは混ぜない)", () => {
    let s = addUserTurn(emptyBrainstorm(), "犬を飼うか迷う");
    s = addAppTurn(s, "他にも引っかかっていることはありますか?", "more");
    expect(transcript(s)).toBe("犬を飼うか迷う");
  });

  it("空の発言は無視する", () => {
    expect(addUserTurn(emptyBrainstorm(), "   ").turns).toHaveLength(0);
  });
});

describe("AIへ渡す情報", () => {
  it("診断で効いてくる論点を、AIへの手がかりとして渡せる", () => {
    expect(USEFUL_TO_SURFACE.length).toBeGreaterThan(0);
    // 命令ではなく論点なので、疑問符で終わる問い文にはしない
    for (const u of USEFUL_TO_SURFACE) expect(u, u).not.toMatch(/[?？]$/);
  });
});

describe("次に進めるか", () => {
  it("候補があって2回以上話していれば、決断に進める", () => {
    let s = addUserTurn(emptyBrainstorm(), "犬を飼うかどうか迷ってる。");
    expect(readyToDecide(s)).toBe(false);
    s = addUserTurn(s, "世話をどう分けるかも決まっていない。");
    expect(readyToDecide(s)).toBe(true);
  });
});

describe("助言をしない(役割の線引き)", () => {
  it("すべての定型文が、助言ではなく問いになっている", () => {
    const advice = /した方(がいい|が良い)|すべきです|おすすめ|良いと思います|正解/;
    let s = emptyBrainstorm();
    for (let i = 0; i < 12; i++) {
      const p = fallbackPrompt(s);
      expect(p.text, p.text).not.toMatch(advice);
      expect(/[?？。]$/.test(p.text), p.text).toBe(true);
      s = addAppTurn(addUserTurn(s, `犬を飼うかどうか${i}`), p.text, p.key);
    }
  });
});

describe("問いが話題を奪わない", () => {
  it("領域(仕事・家庭など)を決めつける問いを出さない", () => {
    // 本人が言っていない前提を置くと、考えている最中の話題から引き剥がしてしまう
    const presumes = /仕事以外|プライベート|家庭では|職場では/;
    let s = emptyBrainstorm();
    for (let i = 0; i < 12; i++) {
      const p = fallbackPrompt(s);
      expect(p.text, p.text).not.toMatch(presumes);
      s = addAppTurn(addUserTurn(s, `答え${i}`), p.text, p.key);
    }
  });
});

describe("決めてみないかと誘うタイミング", () => {
  /** 会話を組み立てる。件数ではなく流れで判断していることを確かめる */
  function talk(...said: string[]): BrainstormState {
    let s = emptyBrainstorm();
    for (const t of said) {
      s = addUserTurn(s, t);
      s = addAppTurn(s, "はい。", undefined);
    }
    return s;
  }

  it("話し始めたばかりでは誘わない", () => {
    expect(shouldInvite(talk("犬を飼うか迷ってる"), null)).toBe(false);
    expect(shouldInvite(talk("犬を飼うか迷ってる", "世話が心配"), null)).toBe(false);
  });

  it("決めごとが1つも見えていなければ誘わない", () => {
    expect(shouldInvite(talk("疲れた", "よく寝ていない", "特にない"), null)).toBe(false);
  });

  it("受入テスト: 「特にない」で止まったら誘う(出しきったサイン)", () => {
    const s = talk("犬を飼うかどうか迷ってる", "世話は妻に頼ることになりそう", "特にない");
    expect(shouldInvite(s, null)).toBe(true);
  });

  it("受入テスト: 新しい決めごとが2往復出なければ誘う(流れが終わったサイン)", () => {
    const s = talk("犬を飼うかどうか迷ってる", "費用は月3万円くらい", "妻とは何度か話した");
    expect(s.candidates).toHaveLength(1);
    expect(shouldInvite(s, null)).toBe(true);
  });

  it("まだ新しい決めごとが出ている間は誘わない(話を遮らない)", () => {
    const s = talk("犬を飼うかどうか迷ってる", "転職するかどうかも決めきれない", "実家の帰省もまだ決めてない");
    expect(s.candidates.length).toBeGreaterThan(1);
    expect(shouldInvite(s, null)).toBe(false);
  });

  it("件数では決めない(2件あっても、まだ出ている最中なら誘わない)", () => {
    const s = talk("犬を飼うかどうか迷う", "転職するかどうかも迷う");
    expect(s.candidates).toHaveLength(2);
    expect(shouldInvite(s, null)).toBe(false);
  });

  it("一度断られたら、しばらく黙る", () => {
    const s = talk("犬を飼うかどうか迷ってる", "費用は月3万円くらい", "妻とは何度か話した");
    expect(shouldInvite(s, 3)).toBe(false);
    const more = addAppTurn(addUserTurn(addAppTurn(addUserTurn(s, "まだ考え中"), "はい。"), "他にもある"), "はい。");
    expect(shouldInvite(more, 3)).toBe(false);
  });

  it("黙る期間が過ぎて、また落ち着いたら誘う", () => {
    let s = talk("犬を飼うかどうか迷ってる", "費用は月3万円くらい", "妻とは何度か話した");
    for (const t of ["まだ考え中", "うーん", "特にない"]) {
      s = addAppTurn(addUserTurn(s, t), "はい。");
    }
    expect(shouldInvite(s, 3)).toBe(true);
  });
});
