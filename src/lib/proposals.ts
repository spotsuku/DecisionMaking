// 材料(判断基準・選択肢・証拠)の下書きを、診断で本人が話した内容から作る。
//
// 材料ページが空欄だけだと、何を書けばいいのか分からない。
// でも本人はすでに診断で答えている ──「何を守り、何を諦めるか」は判断基準そのものだし、
// 「何が分かれば判断が変わるか」はまだ確かめていない証拠そのもの。
// それを持ってきて、一押しで足せるようにする。
//
// 出すのは候補であり、足すかどうかは本人が決める(INV-05)。
// source には「どの回答から来たか」を必ず持たせる(INV-04: 根拠のない提案をしない)。

import type { DB, DecisionVersion, EvidenceItem } from "./types";

export type ProposalKind = "CRITERION" | "OPTION" | "EVIDENCE";

export interface Proposal {
  kind: ProposalKind;
  /** 追加される値 */
  label: string;
  /** どこから来たか(画面に出す) */
  source: string;
  /** 証拠のときの種類 */
  evidenceType?: EvidenceItem["type"];
}

/** 長い答えは物差しの名前にならないので、頭の部分だけ使う */
function short(text: string, max = 24): string {
  const t = text.replace(/\s+/g, " ").trim().replace(/[。.]+$/, "");
  const head = t.split(/[。、,]/)[0].trim() || t;
  return head.length <= max ? head : `${head.slice(0, max - 1)}…`;
}

/**
 * 問いから選択肢を作る。
 *   「〜かどうか」 → 「〜」「見送る」
 *   「AかBか」    → 「A」「B」
 * どちらでもなければ何も出さない(無理に作らない)。
 *
 * 否定形は作らない。「犬を迎える」→「犬を迎えるしない」のような
 * 壊れた日本語になるため、活用は機械的に扱わず、対になる選択肢を置く。
 */
export function optionsFromQuestion(question: string): string[] {
  const q = question.replace(/\s+/g, "").replace(/[?？。]+$/, "");
  if (!q) return [];

  const either = q.match(/^(.+?)か[、,](.+?)か$/);
  if (either) {
    const [a, b] = [either[1], either[2]];
    if (!a || !b || a.length > 30 || b.length > 30) return [];
    return [a, b];
  }

  const yesNo = q.match(/^(.+?)かどうか$/);
  if (yesNo) {
    const stem = yesNo[1];
    if (!stem || stem.length > 30) return [];
    return [stem, "見送る"];
  }
  return [];
}

export function buildProposals(db: DB, version: DecisionVersion): Proposal[] {
  const answers = db.answers.filter((a) => a.versionId === version.id && !a.skipped);
  const byCode = (code: string) => answers.find((a) => a.questionCode === code)?.answerJson ?? {};

  const criteria = db.criteria.filter((c) => c.versionId === version.id);
  const options = db.options.filter((o) => o.versionId === version.id);
  const evidence = db.evidence.filter((e) => e.versionId === version.id);

  const out: Proposal[] = [];
  const add = (p: Proposal) => {
    if (!p.label.trim()) return;
    if (out.some((x) => x.kind === p.kind && x.label === p.label)) return;
    out.push(p);
  };

  // ---- 判断基準: 守るもの・諦めるもの・損失の上限
  const criteriaAnswer = byCode("Q_CRITERIA");
  if (criteriaAnswer.protect) {
    add({ kind: "CRITERION", label: short(criteriaAnswer.protect), source: "守りたいものとして答えた内容" });
  }
  if (criteriaAnswer.giveup) {
    add({ kind: "CRITERION", label: short(criteriaAnswer.giveup), source: "諦めてもいいものとして答えた内容" });
  }
  const worst = byCode("Q_WORST_CASE");
  if (worst.loss) {
    add({ kind: "CRITERION", label: short(worst.loss), source: "引き受けられる損失の上限として答えた内容" });
  }

  // ---- 選択肢: 問いの形から
  for (const label of optionsFromQuestion(version.question)) {
    add({ kind: "OPTION", label, source: "この決断の問いから" });
  }

  // ---- 証拠: まだ確かめていないこと・失敗しそうな筋道
  const info = byCode("Q_INFO_STOP");
  if (info.missing) {
    add({
      kind: "EVIDENCE",
      label: short(info.missing, 60),
      source: "分かれば評価が変わるとして答えた内容",
      evidenceType: "HYPOTHESIS",
    });
  }
  if (worst.path) {
    add({
      kind: "EVIDENCE",
      label: short(worst.path, 60),
      source: "うまくいかない筋道として答えた内容",
      evidenceType: "HYPOTHESIS",
    });
  }

  // すでに登録済みのものは出さない
  const has = (kind: ProposalKind, label: string) =>
    kind === "CRITERION"
      ? criteria.some((c) => c.label === label)
      : kind === "OPTION"
      ? options.some((o) => o.label === label)
      : evidence.some((e) => e.statement === label);

  return out.filter((p) => !has(p.kind, p.label));
}
