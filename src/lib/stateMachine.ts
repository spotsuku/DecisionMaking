// 意思決定の状態機械(2.3)と決断成立ルール(4.6)。
// 業務状態はこの決定的ロジックだけが更新する。LLM/推論は状態を確定しない(2.2)。

import type {
  ActionItem,
  DB,
  DecisionState,
  DecisionVersion,
  Forecast,
  OptionItem,
} from "./types";

export const STATE_ORDER: DecisionState[] = [
  "DRAFT",
  "DIAGNOSING",
  "GATHERING",
  "READY",
  "COMMITTED",
  "IN_ACTION",
  "REVIEW",
  "REVISED",
  "CLOSED",
];

/** 許可された状態遷移。これ以外は拒否する。 */
const TRANSITIONS: Record<DecisionState, DecisionState[]> = {
  DRAFT: ["DIAGNOSING", "CLOSED"],
  DIAGNOSING: ["GATHERING", "READY", "CLOSED"],
  GATHERING: ["DIAGNOSING", "READY", "CLOSED"],
  READY: ["COMMITTED", "DIAGNOSING", "CLOSED"],
  COMMITTED: ["IN_ACTION", "REVIEW", "REVISED", "CLOSED"],
  IN_ACTION: ["REVIEW", "REVISED", "CLOSED"],
  REVIEW: ["IN_ACTION", "REVISED", "CLOSED"],
  REVISED: [],
  CLOSED: [],
};

export function canTransition(from: DecisionState, to: DecisionState): boolean {
  return TRANSITIONS[from]?.includes(to) ?? false;
}

export interface CommitInput {
  userConfirmed: boolean;
  selectedOptionId: string | null;
  options: Pick<OptionItem, "id" | "active" | "rejectedReason">[];
  forecasts: Pick<Forecast, "forecastType" | "outcomeStatement" | "horizonAt" | "lossLimit" | "probability">[];
  acceptedTradeoff: string | null;
  actions: Pick<ActionItem, "text" | "actionRole" | "dueAt">[];
  reviewAt: string | null;
}

export interface CommitGateResult {
  ok: boolean;
  failures: { code: string; message: string }[];
}

/**
 * 決断成立ルール(4.6) + Commit gate(4.7)。
 * すべて満たさない限り COMMITTED にならない(INV-02, INV-05)。
 */
export function evaluateCommitGate(input: CommitInput): CommitGateResult {
  const failures: CommitGateResult["failures"] = [];

  if (!input.userConfirmed) {
    failures.push({ code: "USER_CONFIRM", message: "本人の確定操作が必要です。AI出力だけでは決断になりません。" });
  }
  if (!input.selectedOptionId) {
    failures.push({ code: "CHOICE", message: "選択肢を一つに絞ってください。" });
  }
  const rejected = input.options.filter((o) => o.id !== input.selectedOptionId && o.active);
  if (input.selectedOptionId && rejected.some((o) => !o.rejectedReason || o.rejectedReason.trim() === "")) {
    failures.push({ code: "REJECT_REASON", message: "選ばなかった案には却下理由が必要です。" });
  }
  const positives = input.forecasts.filter(
    (f) => f.forecastType === "POSITIVE" && f.outcomeStatement.trim() !== "" && f.horizonAt
  );
  if (positives.length === 0) {
    failures.push({ code: "POSITIVE", message: "ポジティブ予測(実現したい結果・期限)が1件以上必要です。" });
  }
  const negatives = input.forecasts.filter(
    (f) => f.forecastType === "NEGATIVE" && f.outcomeStatement.trim() !== ""
  );
  if (negatives.length === 0) {
    failures.push({ code: "NEGATIVE", message: "ネガティブ予測(起こり得る悪い結果)が1件以上必要です。" });
  } else if (negatives.every((f) => !f.lossLimit || f.lossLimit.trim() === "")) {
    failures.push({ code: "LOSS_LIMIT", message: "ネガティブ予測には引き受ける損失の上限が必要です。" });
  }
  if (!input.acceptedTradeoff || input.acceptedTradeoff.trim() === "") {
    failures.push({ code: "TRADEOFF", message: "受け入れるトレードオフを明示してください。" });
  }
  const advance = input.actions.filter(
    (a) => a.actionRole === "ADVANCE" && a.text.trim() !== "" && a.dueAt
  );
  if (advance.length === 0) {
    failures.push({ code: "ACTION", message: "決めたあとに動く、いちばん小さな一歩と、その期限が必要です。" });
  }
  if (!input.reviewAt) {
    failures.push({ code: "REVIEW_AT", message: "予測と実績を比較するレビュー日が必要です。" });
  }

  return { ok: failures.length === 0, failures };
}

/** S1 Frame: 問い・主体・期限がそろっているか */
export function frameComplete(v: Pick<DecisionVersion, "question" | "ownerRole">, dueAt: string | null): boolean {
  return v.question.trim() !== "" && v.ownerRole.trim() !== "" && !!dueAt;
}

export type ReadinessDisplay = "FRAME" | "GATHER" | "DECIDABLE" | "ACT";

/** 準備度の4段階表示(4.8)。0-100点の偽の精密さは出さない。 */
export function readinessDisplay(db: DB, decisionId: string): ReadinessDisplay {
  const decision = db.decisions.find((d) => d.id === decisionId);
  if (!decision) return "FRAME";
  const version = db.versions
    .filter((v) => v.decisionId === decisionId)
    .sort((a, b) => b.versionNo - a.versionNo)[0];
  if (!version) return "FRAME";

  if (decision.status === "COMMITTED" || decision.status === "IN_ACTION") {
    const acts = db.actions.filter((a) => a.versionId === version.id);
    if (acts.some((a) => a.status !== "COMPLETED" && a.status !== "CANCELLED")) return "ACT";
    return "ACT";
  }
  if (!frameComplete(version, decision.dueAt)) return "FRAME";

  // 「決められる」は、比較する材料と判断可能性がそろってから(4.8)。
  // 問いを立てただけの状態で確定へ誘導すると、Commit gateで弾かれる行き止まりになる。
  const latestReadiness = db.readiness
    .filter((r) => r.versionId === version.id)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    .at(-1);
  if (!latestReadiness) return "GATHER";
  if (latestReadiness.verdict !== "THINK" && latestReadiness.verdict !== "BET") return "GATHER";

  const activeOptions = db.options.filter((o) => o.versionId === version.id && o.active).length;
  if (activeOptions < 2) return "GATHER";

  return "DECIDABLE";
}

export const READINESS_DISPLAY_LABEL: Record<ReadinessDisplay, { label: string; cta: string }> = {
  FRAME: { label: "問いを定める", cta: "何を決めるか整理する" },
  GATHER: { label: "材料をそろえる", cta: "次に確かめる" },
  DECIDABLE: { label: "決められる", cta: "決断を確定する" },
  ACT: { label: "動いて学ぶ", cta: "最初の一歩を実行する" },
};
