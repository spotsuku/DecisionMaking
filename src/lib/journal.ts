// ジャーナリング(書き出し)と決断候補の抽出。
// 抽出はルールベースの「提案」であり、決断にするかどうかは本人が選ぶ(INV-05 / 6.1)。

export interface JournalEntry {
  id: string;
  text: string;
  createdAt: string;
}

/** 決断が隠れていそうな文のパターン。断定せず候補として返す。 */
const CANDIDATE_PATTERNS: RegExp[] = [
  /するかどうか/,
  /するか、?しないか/,
  /(?:する|やる|やめる|続ける|買う|行く|移る|変える|辞める)か(?:で)?(?:迷|悩)/,
  /どうする/,
  /どうしよう/,
  /迷って/,
  /悩んで/,
  /決め(?:てない|ていない|られない|かねて|あぐねて)/,
  /決まってない/,
  /後回し/,
  /先延ばし/,
  /放置し/,
  /まだ(?:決めて|取って|やって|返事して|連絡して)(?:い)?ない/,
  /ずるずる/,
];

/**
 * 自由記述から決断候補の文を抽出する。
 * 文単位に分割し、迷い・未決のパターンに当たるものを最大5件返す。
 */
export function extractCandidates(text: string): string[] {
  const sentences = text
    .split(/[。\n!?！?]+/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 6 && s.length <= 120);

  const seen = new Set<string>();
  const out: string[] = [];
  for (const s of sentences) {
    if (!CANDIDATE_PATTERNS.some((p) => p.test(s))) continue;
    if (seen.has(s)) continue;
    seen.add(s);
    out.push(s);
    if (out.length >= 5) break;
  }
  return out;
}

/** 候補文から決断タイトルを作る(先頭30文字) */
export function candidateTitle(candidate: string): string {
  const t = candidate.replace(/\s+/g, " ").trim();
  return t.length <= 30 ? t : `${t.slice(0, 29)}…`;
}
