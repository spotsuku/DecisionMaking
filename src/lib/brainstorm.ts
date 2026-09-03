// 迷いを書き出す段階の会話。
//
// ここは診断と役割が違う。
//   診断(4.2/4.6)は、決める問いが定まったあとに成立条件を埋める工程なので、
//   何を聞くかをルールが決める。順序も打ち切りも決まっている。
//   一方この段階は、まだ何を決めるかも分かっていない。台本どおりに問いを並べると
//   会話が不自然になり、本人が話したいことから引き剥がしてしまう。
//   だから会話そのものはAIに任せ、ルールは背後で決断候補を拾うことに徹する。
//
// このファイルが持つのは2つだけ:
//   1. 会話の記録と、そこから取り出した決断候補
//   2. AIが使えないときの定型の問い(会話を止めないための最低限)
//
// 変わらない線引き: 答えを出さない。助言もしない。決めるのは本人(6.1 / INV-05)。

import { extractCandidates, type Candidate } from "./journal";
import { isNonAnswer } from "./diagnosis";

export interface Turn {
  from: "USER" | "APP";
  text: string;
}

export interface BrainstormState {
  turns: Turn[];
  /** これまでに見つかった決断候補 */
  candidates: Candidate[];
  /** すでに聞いた問いのキー。同じことは二度聞かない */
  asked: string[];
  /** 本人が話すたびの候補数。新しい決めごとが出なくなったかを見る */
  counts: number[];
}

export const emptyBrainstorm = (): BrainstormState => ({ turns: [], candidates: [], asked: [], counts: [] });

/** 会話全体の本文(候補の抽出はここに対して行う) */
export function transcript(state: BrainstormState): string {
  return state.turns.filter((t) => t.from === "USER").map((t) => t.text).join("\n");
}

const userTurns = (s: BrainstormState) => s.turns.filter((t) => t.from === "USER").length;

export interface Prompt {
  key: string;
  intent: string;
  text: string;
  /** この問いを出してよい条件 */
  when: (s: BrainstormState) => boolean;
}

/**
 * AIが使えないときの問い。上から順に、条件を満たす未使用のものを選ぶ。
 * これは会話の代役であって、設計の主役ではない。
 * AIが動いているときは使われない。
 */
const FALLBACK_PROMPTS: Prompt[] = [
  {
    key: "more",
    intent: "他に抱えている決めごとを引き出す",
    text: "他にも、頭の片隅に引っかかっていることはありますか?",
    when: (s) => userTurns(s) < 3,
  },
  {
    // 「他にない」で止まる人は、思い出せていないだけのことが多い。
    // 領域を指定すると話題を奪うので、思い出す手がかりだけを渡す。
    key: "recall",
    intent: "思い出す手がかりを渡す。領域は指定しない",
    text: "小さなことでも大丈夫です。返事を保留しているもの、後回しにしていることはありませんか?",
    when: (s) => s.candidates.length < 2 && userTurns(s) < 4,
  },
  {
    key: "pick",
    intent: "複数出てきた中から、本命を本人に選ばせる",
    text: "この中で、いちばん引っかかっているのはどれですか?",
    when: (s) => s.candidates.length >= 2,
  },
  {
    key: "deadline",
    intent: "決断の期限を確かめる",
    text: "それは、いつまでに決まっていないと困りますか?",
    when: () => true,
  },
  {
    key: "owner",
    intent: "決定権が本人にあるかを確かめる",
    text: "その件、あなた一人で決められますか。それとも誰かの合意が要りますか?",
    when: () => true,
  },
  {
    key: "blocker",
    intent: "詰まりの正体が情報不足か、決めた後への不安かを分ける",
    text: "決めきれないのは、情報が足りないからですか。それとも決めたあとが不安だからですか?",
    when: () => true,
  },
  {
    key: "cost",
    intent: "決めずに置いた場合の損失を意識してもらう",
    text: "このまま決めずに置いておくと、何が起きますか?",
    when: () => true,
  },
];

const OPENING: Prompt = {
  key: "opening",
  intent: "まず出してもらう",
  text: "いま頭にあることを、そのまま話してみてください。まとまっていなくて大丈夫です。",
  when: () => true,
};

/** 定型の問いを出し切ったあと。会話は終わらせず、開いたまま続ける */
const OPEN_ENDED: Prompt = {
  key: "open",
  intent: "話を続けてもらう",
  text: "もう少し聞かせてください。その件で、いま一番引っかかっているのはどこですか?",
  when: () => true,
};

/**
 * AIが応答できないときの問い。会話を止めないための代役。
 * 文面ではなくキーで既出を判定するので、AIが言い換えても重複しない。
 */
export function fallbackPrompt(state: BrainstormState): Prompt {
  if (state.turns.length === 0) return OPENING;
  const asked = new Set(state.asked);
  return FALLBACK_PROMPTS.find((p) => !asked.has(p.key) && p.when(state)) ?? OPEN_ENDED;
}

/** 会話全体から決断候補を取り直す(あとの発言で表現が整うことがある) */
export function refreshCandidates(state: BrainstormState): Candidate[] {
  return extractCandidates(transcript(state));
}

/** 本人の発言を1つ足して、候補を取り直す */
export function addUserTurn(state: BrainstormState, said: string): BrainstormState {
  const text = said.trim();
  if (!text) return state;
  const next: BrainstormState = { ...state, turns: [...state.turns, { from: "USER", text }] };
  const candidates = refreshCandidates(next);
  return { ...next, candidates, counts: [...state.counts, candidates.length] };
}

/** アプリの発言を足す。キーを渡すと「聞いた」として記録する */
export function addAppTurn(state: BrainstormState, text: string, key?: string): BrainstormState {
  return {
    ...state,
    turns: [...state.turns, { from: "APP", text }],
    asked: key && !state.asked.includes(key) ? [...state.asked, key] : state.asked,
  };
}

/** 決断へ進める状態か */
export function readyToDecide(state: BrainstormState): boolean {
  return state.candidates.length > 0 && userTurns(state) >= 2;
}
