// 選択肢を絞る工程のルール。画面から切り離しておく(ここだけはテストできる)。
//
// 工程は3つ。出す → 削る → 選ぶ。
//   出す: 二択から抜ける。ここが決められない一番の原因なので、型を渡して案を増やす。
//   削る: 外した案と理由を残す。あとで「なぜ選ばなかったか」を説明できるように(INV-01)。
//   選ぶ: 本人が言った判断基準で並べて、本人が選ぶ。アプリは点数で答えを出さない(6.1)。

/** 比較表のしるし。点数はつけない */
export type OptionMark = "GOOD" | "MIXED" | "BAD" | "UNKNOWN" | "NONE";

/** 押すたびにこの順で回る */
export const MARK_CYCLE: OptionMark[] = ["NONE", "GOOD", "MIXED", "BAD", "UNKNOWN"];

export const MARK_LABEL: Record<OptionMark, string> = {
  NONE: "—",
  GOOD: "○",
  MIXED: "△",
  BAD: "×",
  UNKNOWN: "?",
};

export function nextMark(current: OptionMark): OptionMark {
  const i = MARK_CYCLE.indexOf(current);
  return MARK_CYCLE[(i + 1) % MARK_CYCLE.length];
}

/** 保存された点数(store.setMark の裏返し)から、しるしへ戻す */
export function markFromScore(score: number | undefined, uncertainty: number | undefined): OptionMark {
  if (uncertainty === 1) return "UNKNOWN";
  if (score === 3) return "GOOD";
  if (score === 2) return "MIXED";
  if (score === 1) return "BAD";
  return "NONE";
}

/**
 * やる / やらない の外に案を作るための型。
 *
 * 決めきれない一番の理由は、二択しか見えていないこと。
 * ここで渡すのは「形」だけで、中身は本人が埋める ── 助言はしない(INV-05)。
 */
export const OPTION_PATTERNS = [
  "条件をつけて受ける",
  "規模を小さくして試す",
  "期限を決めて保留する",
  "相手に条件を出す",
  "一部だけ受ける",
  "別の相手を当たる",
] as const;

/** 型から案を起こしたときの文。中身は本人が書き足す前提 */
export function optionFromPattern(pattern: string): string {
  return `${pattern}${FILL_MARK}`;
}

/** 型から起こしたまま、中身が書かれていない案か */
export function needsFilling(label: string): boolean {
  return label.includes(FILL_MARK);
}

const FILL_MARK = "(内容を記入)";

/**
 * 画面に出す文。記入待ちの印は消す。
 *
 * 印は「まだ本人の言葉になっていない」ことを持っておくためのもので、
 * 読ませる文ではない。Decision Card までこれが出ると意味が通らない。
 */
export function displayLabel(label: string): string {
  return label.replace(FILL_MARK, "").trim();
}

/**
 * 外す理由の型。1タップで済むものを並べ、足りなければ自分の言葉で書く。
 * 理由なしで外させない ── Decision Card の「選ばなかった案」が空欄になる。
 */
export const REJECT_REASONS = [
  "期限に合わない",
  "損失が大きすぎる",
  "自分に決定権がない",
  "気が乗らない",
] as const;

/**
 * 診断の答え(守りたいもの / 諦めてもいいもの)を、比較表の行に割る。
 *
 * 本人の言葉は書き換えない。改行と句点で切って、長すぎるものは切り詰めるだけ。
 * 1つの部にたくさん書かれていても、行は3つまで(表が読めなくなる)。
 */
export function splitCriteriaText(text: string, max = 3): string[] {
  return text
    .split(/[\n。、,]+/)
    .map((s) => s.trim().replace(/^[・\-–—\s]+/, ""))
    .filter((s) => s.length >= 2)
    .map((s) => (s.length <= 24 ? s : `${s.slice(0, 23)}…`))
    .slice(0, max);
}

/** A / B / C … 案の見出し */
export function optionLetter(index: number): string {
  return String.fromCharCode(65 + index);
}
