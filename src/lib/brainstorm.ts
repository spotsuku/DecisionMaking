// 書き出しを「一人で書く」から「話しながら絞り込む」へ変える。
//
// 役割の線引きは診断と同じ:
//   このアプリは答えを出さない。助言もしない。
//   まだ分かっていないことを1つずつ聞き、決めるべきことを一緒に浮かび上がらせる。
//   決めるのは本人(INV-05)。
//
// 設計の要点:
//   聞いた問いは「キー」で覚える。文面ではなくキーで管理しないと、
//   AIが言い換えた瞬間に「もう聞いた」が分からなくなり、同じことを永久に聞き続ける。
//   問いは順序つきの一覧で、条件を満たす未使用のものを上から選ぶ。
//   出し切ったら null を返し、会話を閉じて決断へ渡す。

import { extractCandidates, type Candidate } from "./journal";

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
}

export const emptyBrainstorm = (): BrainstormState => ({ turns: [], candidates: [], asked: [] });

/** 会話全体の本文(候補の抽出はここに対して行う) */
export function transcript(state: BrainstormState): string {
  return state.turns.filter((t) => t.from === "USER").map((t) => t.text).join("\n");
}

const userTurns = (s: BrainstormState) => s.turns.filter((t) => t.from === "USER").length;

export interface Prompt {
  key: string;
  /** AIに渡す「この問いで何を確かめたいか」。文面の言い換えはAIに任せる */
  intent: string;
  text: string;
  /** この問いを出してよい条件 */
  when: (s: BrainstormState) => boolean;
}

/**
 * 上から順に、条件を満たす未使用の問いを選ぶ。
 * 前半は広げる問い、後半は1件に寄せてから輪郭を確かめる問い。
 */
const PROMPTS: Prompt[] = [
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

const CLOSING =
  "ひと通り出ましたね。下に並んだ中から、いま決めるものを1つ選んでください。まだ話したければ続けても大丈夫です。";

/**
 * 次の問いを返す。出し切っていれば null。
 * 文面ではなくキーで既出を判定するので、AIが言い換えても重複しない。
 */
export function nextPrompt(state: BrainstormState): Prompt | null {
  if (state.turns.length === 0) return OPENING;
  const asked = new Set(state.asked);
  return PROMPTS.find((p) => !asked.has(p.key) && p.when(state)) ?? null;
}

/** 出し切ったあとに出す締めの文 */
export const closingText = CLOSING;

/** 会話全体から決断候補を取り直す(あとの発言で表現が整うことがある) */
export function refreshCandidates(state: BrainstormState): Candidate[] {
  return extractCandidates(transcript(state));
}

/** 本人の発言を1つ足して、候補を取り直す */
export function addUserTurn(state: BrainstormState, said: string): BrainstormState {
  const text = said.trim();
  if (!text) return state;
  const next: BrainstormState = { ...state, turns: [...state.turns, { from: "USER", text }] };
  return { ...next, candidates: refreshCandidates(next) };
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

/** すでに確かめたことを、AIへ渡すための言葉にする */
export function coveredTopics(state: BrainstormState): string[] {
  const byKey = new Map([...PROMPTS, OPENING].map((p) => [p.key, p.intent]));
  return state.asked.map((k) => byKey.get(k) ?? k);
}
