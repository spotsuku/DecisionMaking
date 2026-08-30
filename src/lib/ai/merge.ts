// ルールの結果とAIの提案を合わせる。
//
// ルールを先に置く理由: ルールは同じ入力に必ず同じ結果を返し、根拠も説明できる。
// AIは「ルールが取りこぼしたもの」を足す役で、ルールの結果を書き換えない。
// AIが落ちても、ルールの結果だけで画面は成立する。

import type { Candidate } from "../journal";
import type { SourcedCandidate } from "./types";

const MAX_CANDIDATES = 8;

/** 表記ゆれを吸収して同じ候補かを見る */
function norm(text: string): string {
  return text.replace(/[\s。、,.!?！?「」『』]/g, "");
}

function overlaps(a: string, b: string): boolean {
  const [x, y] = [norm(a), norm(b)];
  if (!x || !y) return false;
  return x === y || x.includes(y) || y.includes(x);
}

export function mergeCandidates(
  rules: Candidate[],
  ai: { text: string; kind: "QUESTION" | "SIGNAL" }[]
): SourcedCandidate[] {
  const out: SourcedCandidate[] = rules.map((c) => ({ ...c, source: "RULE" }));
  for (const c of ai) {
    const text = c.text.trim();
    if (!text) continue;
    if (out.some((existing) => overlaps(existing.text, text))) continue;
    out.push({ text, kind: c.kind, source: "AI" });
  }
  // 問いを先に、兆候を後に。ルール由来を各グループの先頭へ
  const rank = (c: SourcedCandidate) =>
    (c.kind === "QUESTION" ? 0 : 10) + (c.source === "RULE" ? 0 : 1);
  return out.sort((a, b) => rank(a) - rank(b)).slice(0, MAX_CANDIDATES);
}

/**
 * 欄への振り分けを合わせる。
 * AIの値は「本人の発言に実在する文字列」であることを確かめてから採用する。
 * 作文されていたらルールの結果を使う(INV-04: 根拠のない出力を通さない)。
 */
export function mergeSplit(
  said: string,
  rules: Record<string, string>,
  ai: Record<string, string>,
  partKeys: string[]
): { values: Record<string, string>; source: "RULE" | "AI" } {
  const body = norm(said);
  const values: Record<string, string> = {};
  for (const key of partKeys) {
    const value = (ai[key] ?? "").trim();
    if (!value) continue;
    if (!body.includes(norm(value))) return { values: rules, source: "RULE" };
    values[key] = value;
  }
  if (Object.keys(values).length === 0) return { values: rules, source: "RULE" };
  return { values, source: "AI" };
}
