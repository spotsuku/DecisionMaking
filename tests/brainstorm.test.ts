// 書き出しの対話のテスト。
// 助言をしないこと、段階が進むこと、候補が会話全体から取れることを固定する。

import { describe, it, expect } from "vitest";
import {
  addAppTurn, addUserTurn, emptyBrainstorm, nextPrompt,
  readyToDecide, stageOf, transcript,
} from "../src/lib/brainstorm";

describe("会話の段階", () => {
  it("最初は出してもらう段階", () => {
    expect(stageOf(emptyBrainstorm())).toBe("SPREAD");
    expect(nextPrompt(emptyBrainstorm())).toContain("そのまま話して");
  });

  it("候補が複数見つかったら、絞る段階に進む", () => {
    let s = addUserTurn(emptyBrainstorm(), "犬を飼うかどうか迷ってる。");
    s = addUserTurn(s, "転職するかどうかも決めきれない。");
    expect(s.candidates.length).toBeGreaterThanOrEqual(2);
    expect(stageOf(s)).toBe("NARROW");
    expect(nextPrompt(s)).toContain("いちばん");
  });

  it("候補が1つに寄れば、期限や決定権を確かめる段階になる", () => {
    let s = addUserTurn(emptyBrainstorm(), "犬を飼うかどうか迷ってる。");
    s = addUserTurn(s, "世話の分担が気になっている。");
    expect(s.candidates).toHaveLength(1);
    expect(stageOf(s)).toBe("SHARPEN");
  });

  it("同じ問いを続けて出さない", () => {
    let s = emptyBrainstorm();
    const asked: string[] = [];
    for (let i = 0; i < 3; i++) {
      const q = nextPrompt(s);
      asked.push(q);
      s = addAppTurn(addUserTurn(s, `思いつくこと${i}`), q);
    }
    expect(new Set(asked).size).toBeGreaterThan(1);
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
    s = addAppTurn(s, "他にも引っかかっていることはありますか?");
    expect(transcript(s)).toBe("犬を飼うか迷う");
  });

  it("空の発言は無視する", () => {
    expect(addUserTurn(emptyBrainstorm(), "   ").turns).toHaveLength(0);
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
  it("定型文はすべて問いで終わるか、話すよう促す文である", () => {
    let s = emptyBrainstorm();
    const advice = /した方(がいい|が良い)|すべきです|おすすめ|良いと思います|正解/;
    for (let i = 0; i < 12; i++) {
      const q = nextPrompt(s);
      expect(q, q).not.toMatch(advice);
      expect(/[?？。]$/.test(q), q).toBe(true);
      s = addAppTurn(addUserTurn(s, `犬を飼うかどうか${i}`), q);
    }
  });
});
