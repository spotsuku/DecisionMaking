// ジャーナリング(書き出し)と決断候補の抽出。
// 抽出はルールベースの「提案」であり、決断にするかどうかは本人が選ぶ(INV-05 / 6.1)。

export interface JournalEntry {
  id: string;
  text: string;
  createdAt: string;
}

/** QUESTION = すでに問いの形 / SIGNAL = 未決・停滞の兆候(問いは本人が立てる) */
export type CandidateKind = "QUESTION" | "SIGNAL";

export interface Candidate {
  text: string;
  kind: CandidateKind;
}

/**
 * 問いの形になっている表現。そのまま決断の問いにできる。
 * 動詞を固定しない(「買うかどうか」「辞めるかどうか」を等しく拾う)。
 */
const QUESTION_PATTERNS: RegExp[] = [
  /かどうか/,
  /べきか/,
  /(?:どちら|どっち)(?:に|を|が)?(?:する|しよう|すべき|選|いい)/,
  /(?:迷|悩)(?:って|んで|う|む|い)/,
  /決め(?:られない|かねて|あぐねて|きれない|てない|ていない)/,
  /決断(?:できない|しきれない)/,
  /踏ん切り(?:が)?(?:つかない|つきません)/,
  /踏み切れ(?:ない|ません)/,
];

/**
 * 未決・停滞の兆候。それ自体は問いではないので、決断化は本人に委ねる。
 * 「検討している」「情報が足りない」「両方走らせる」は、
 * 設計書1.1が決断回避の代表的な説明として名指ししている表現。
 */
const SIGNAL_PATTERNS: RegExp[] = [
  /検討(?:して|中)/,
  /情報が(?:足りない|少ない|不足)/,
  /両方(?:を)?(?:走らせ|進め|やる|やっ)/,
  /どう(?:する|しよう|したら|すれば|したもの)/,
  /様子(?:を)?見/,
  /保留/,
  /後回し/,
  /先延ばし/,
  /放置/,
  /ずるずる/,
  /決まって(?:ない|いない)/,
  /まだ(?:決めて|取って|やって|返事|連絡|着手|手を付け|手をつけ)/,
];

/** 音声入力の言いよどみ。候補タイトルに残ると読みにくいので落とす。 */
const LEADING_FILLER = /^(?:えーと|えっと|ええと|あの+|まあ|なんか|そのー|うーん|はい)[、,\s]*/;

/**
 * 格助詞・接続で終わる断片は、文がまだ続いている。
 * 音声入力は句点が細切れに入るため、これがないと
 * 「豆柴の小太郎を」と「買うかどうか」が別の文に切れてしまう。
 */
const CONTINUES = /(?:[をがはにへともでや、,]|から|ので|けど|けれど|ため|まま)$/;

const MAX_LEN = 120;
const MIN_LEN = 4;

/** 書き出しを、意味のまとまり単位の文へ復元する。 */
function toSentences(text: string): string[] {
  const fragments = text
    .split(/[。\n!?！?]+/)
    .map((s) => s.replace(LEADING_FILLER, "").trim())
    .filter(Boolean);

  const out: string[] = [];
  let buffer = "";
  for (const fragment of fragments) {
    const joined = buffer ? buffer + fragment : fragment;
    if (CONTINUES.test(fragment) && joined.length < MAX_LEN) {
      buffer = joined;
      continue;
    }
    out.push(joined);
    buffer = "";
  }
  if (buffer) out.push(buffer);

  return out.filter((s) => s.length >= MIN_LEN && s.length <= MAX_LEN);
}

/**
 * 自由記述から決断候補を抽出する。
 * 問いの形(最大5件)を先に、停滞の兆候(最大3件)を後に返す。
 */
export function extractCandidates(text: string): Candidate[] {
  const seen = new Set<string>();
  const questions: Candidate[] = [];
  const signals: Candidate[] = [];

  for (const sentence of toSentences(text)) {
    if (seen.has(sentence)) continue;
    if (QUESTION_PATTERNS.some((p) => p.test(sentence))) {
      seen.add(sentence);
      questions.push({ text: sentence, kind: "QUESTION" });
    } else if (SIGNAL_PATTERNS.some((p) => p.test(sentence))) {
      seen.add(sentence);
      signals.push({ text: sentence, kind: "SIGNAL" });
    }
  }

  return [...questions.slice(0, 5), ...signals.slice(0, 3)];
}

/** 候補文から決断タイトルを作る(先頭30文字) */
export function candidateTitle(candidate: string): string {
  const t = candidate.replace(/\s+/g, " ").trim();
  return t.length <= 30 ? t : `${t.slice(0, 29)}…`;
}
