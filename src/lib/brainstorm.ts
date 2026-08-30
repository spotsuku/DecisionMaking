// 書き出しを「一人で書く」から「話しながら絞り込む」へ変える。
//
// 役割の線引きは診断と同じ:
//   このアプリは答えを出さない。助言もしない。
//   本人が言ったことを受け止めて、次の一手が見える問いを1つだけ返す。
//   決めるべきことが見えてきたら、候補として並べる。選ぶのは本人(INV-05)。
//
// ここはルールベースの土台。AIがあれば文面だけ差し替わるが、
// 「次に何を聞くか」の判断はここが持つ。

import { extractCandidates, type Candidate } from "./journal";

export interface Turn {
  from: "USER" | "APP";
  text: string;
}

/** 会話の段階。順に深くしていく */
export type Stage =
  /** まだ量が足りない。とにかく出してもらう */
  | "SPREAD"
  /** 複数出てきた。どれが本命かを絞る */
  | "NARROW"
  /** 1つに寄ってきた。決断として立てられるか確かめる */
  | "SHARPEN";

export interface BrainstormState {
  turns: Turn[];
  /** これまでに見つかった決断候補 */
  candidates: Candidate[];
}

export const emptyBrainstorm = (): BrainstormState => ({ turns: [], candidates: [] });

/** 会話全体の本文(候補の抽出はここに対して行う) */
export function transcript(state: BrainstormState): string {
  return state.turns.filter((t) => t.from === "USER").map((t) => t.text).join("\n");
}

const OPENING =
  "いま頭にあることを、そのまま話してみてください。まとまっていなくて大丈夫です。";

/** 段階ごとの問い。同じ問いを続けて出さないよう、使った数で選ぶ */
const PROMPTS: Record<Stage, string[]> = {
  SPREAD: [
    "他にも、頭の片隅に引っかかっていることはありますか?",
    "仕事以外ではどうですか。家のこと、お金のこと、体のこと。",
    "「そのうちやろう」と思ったまま、手をつけていないことはありますか?",
    "最近、返事や連絡を保留にしているものはありますか?",
  ],
  NARROW: [
    "この中で、いちばん引っかかっているのはどれですか?",
    "どれか1つが片づくとしたら、どれがいちばん楽になりますか?",
    "放っておくと、いちばん困ることになるのはどれですか?",
  ],
  SHARPEN: [
    "それは、いつまでに決まっていないと困りますか?",
    "決めきれないのは、情報が足りないからですか。それとも決めたあとが不安だからですか?",
    "その件、あなた一人で決められますか。それとも誰かの合意が要りますか?",
  ],
};

export function stageOf(state: BrainstormState): Stage {
  const said = state.turns.filter((t) => t.from === "USER").length;
  const found = state.candidates.length;
  if (found === 0 || said < 2) return "SPREAD";
  if (found >= 2) return "NARROW";
  return "SHARPEN";
}

/**
 * 次にアプリが返す文を決める。
 * 受け止め(本人の言葉を1つ拾う)+ 問い1つ。助言はしない。
 */
export function nextPrompt(state: BrainstormState): string {
  if (state.turns.length === 0) return OPENING;
  const stage = stageOf(state);
  const pool = PROMPTS[stage];
  // その段階で何回聞いたかで回す。同じ文を続けない
  const asked = state.turns.filter((t) => t.from === "APP" && pool.includes(t.text)).length;
  return pool[asked % pool.length];
}

/** 会話全体から決断候補を取り直す(あとの発言で表現が整うことがある) */
export function refreshCandidates(state: BrainstormState): Candidate[] {
  return extractCandidates(transcript(state));
}

/** 本人の発言を1つ足して、候補と次の問いを更新する */
export function addUserTurn(state: BrainstormState, said: string): BrainstormState {
  const text = said.trim();
  if (!text) return state;
  const next: BrainstormState = { turns: [...state.turns, { from: "USER", text }], candidates: [] };
  next.candidates = refreshCandidates(next);
  return next;
}

export function addAppTurn(state: BrainstormState, text: string): BrainstormState {
  return { ...state, turns: [...state.turns, { from: "APP", text }] };
}

/** もう十分に出た、と伝えてよいか */
export function readyToDecide(state: BrainstormState): boolean {
  return state.candidates.length > 0 && state.turns.filter((t) => t.from === "USER").length >= 2;
}
