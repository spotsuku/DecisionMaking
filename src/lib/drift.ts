// Decision Drift 検知(5.1)・選択的帰属の検知(5.3)・Decision Integrity(5.4)。
// 人格を責めず、観察事実として通知する。

import type { DB, DecisionVersion } from "./types";

export interface DriftResult {
  drifting: boolean;
  committedOptionLabel: string | null;
  divergentActionCount: number;
  message: string | null;
}

/**
 * drift = committed_option != inferred_option_from_recent_actions
 *       AND no decision_change event AND divergence >= threshold(2件)
 */
export function detectDrift(db: DB, decisionId: string): DriftResult {
  const none: DriftResult = { drifting: false, committedOptionLabel: null, divergentActionCount: 0, message: null };
  const decision = db.decisions.find((d) => d.id === decisionId);
  if (!decision) return none;

  const committedVersion = db.versions
    .filter((v) => v.decisionId === decisionId && v.committedAt)
    .sort((a, b) => b.versionNo - a.versionNo)[0];
  if (!committedVersion || !committedVersion.selectedOptionId) return none;

  // 変更イベントが最新versionから既にあるなら通知しない
  const hasChange = db.changes.some((c) => c.fromVersionId === committedVersion.id);
  if (hasChange) return none;

  const selected = db.options.find((o) => o.id === committedVersion.selectedOptionId);
  const recentActions = db.actions
    .filter((a) => a.decisionId === decisionId && a.createdAt >= (committedVersion.committedAt ?? ""))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 5);

  const divergent = recentActions.filter(
    (a) => a.optionId && a.optionId !== committedVersion.selectedOptionId
  );
  if (divergent.length < 2) return none; // Drift判定: 2件以上の不一致行動(12章)

  const otherLabel = db.options.find((o) => o.id === divergent[0].optionId)?.label ?? "別の案";
  const committedDate = committedVersion.committedAt
    ? new Date(committedVersion.committedAt).toLocaleDateString("ja-JP")
    : "";
  return {
    drifting: true,
    committedOptionLabel: selected?.label ?? null,
    divergentActionCount: divergent.length,
    message: `${committedDate}の決断は「${selected?.label ?? "選択済みの案"}」です。直近${divergent.length}件の行動は「${otherLabel}」に向いています。続ける/変更する/一時停止する、のどれにしますか?`,
  };
}

// ------------------------------------------------- 選択的帰属の検知(5.3)

export interface AttributionPattern {
  detected: boolean;
  count: number;
  message: string | null;
}

/** 良い結果=自分、悪い結果=外部、が3件以上続いたら「記録」として提示する。断定しない。 */
export function detectSelectiveAttribution(db: DB): AttributionPattern {
  const outcomes = [...db.outcomes].sort((a, b) => a.observedAt.localeCompare(b.observedAt));
  let streak = 0;
  for (const o of outcomes) {
    const selfServing =
      (o.outcomeClass === "GOOD" && o.attribution === "SELF") ||
      (o.outcomeClass === "BAD" && o.attribution === "EXTERNAL");
    if (o.outcomeClass === "GOOD" || o.outcomeClass === "BAD") {
      streak = selfServing ? streak + 1 : 0;
    }
  }
  if (streak >= 3) {
    return {
      detected: true,
      count: streak,
      message: `良い結果では自分の判断を理由にし、悪い結果では外部要因を理由にする記録が${streak}件続いています。今回、自分の判断で変えられた部分はありますか?`,
    };
  }
  return { detected: false, count: streak, message: null };
}

// ---------------------------------------------- Decision Integrity(5.4)

export interface IntegrityMetrics {
  clarity: { met: number; total: number };        // 問い・主体・期限
  criteria: { met: number; total: number };       // 基準2件以上
  forecastHonesty: { met: number; total: number };// 両面予測の凍結
  executionAlignment: { met: number; total: number }; // 行動と選択の接続
  outcomeAcceptance: { met: number; total: number };  // レビュー完了
  revisionQuality: { met: number; total: number };    // 変更の説明責任
}

export function computeIntegrity(db: DB): IntegrityMetrics {
  const committedVersions = db.versions.filter((v) => v.committedAt);
  const m: IntegrityMetrics = {
    clarity: { met: 0, total: 0 },
    criteria: { met: 0, total: 0 },
    forecastHonesty: { met: 0, total: 0 },
    executionAlignment: { met: 0, total: 0 },
    outcomeAcceptance: { met: 0, total: 0 },
    revisionQuality: { met: 0, total: 0 },
  };

  for (const v of committedVersions) {
    const decision = db.decisions.find((d) => d.id === v.decisionId);
    m.clarity.total++;
    if (v.question && v.ownerRole && decision?.dueAt) m.clarity.met++;

    m.criteria.total++;
    const crits = db.criteria.filter((c) => c.versionId === v.id);
    if (crits.length >= 2) m.criteria.met++;

    m.forecastHonesty.total++;
    const fs = db.forecasts.filter((f) => f.versionId === v.id && f.frozenAt);
    if (fs.some((f) => f.forecastType === "POSITIVE") && fs.some((f) => f.forecastType === "NEGATIVE"))
      m.forecastHonesty.met++;

    m.executionAlignment.total++;
    const acts = db.actions.filter((a) => a.versionId === v.id);
    if (acts.length > 0 && acts.every((a) => !a.optionId || a.optionId === v.selectedOptionId))
      m.executionAlignment.met++;

    const commitment = db.commitments.find((c) => c.versionId === v.id);
    if (commitment) {
      m.outcomeAcceptance.total++;
      if (db.outcomes.some((o) => o.versionId === v.id)) m.outcomeAcceptance.met++;
    }
  }

  for (const c of db.changes) {
    m.revisionQuality.total++;
    if (c.priorResultAcknowledged && c.newEvidence.trim() !== "" && c.changedAssumption.trim() !== "")
      m.revisionQuality.met++;
  }
  return m;
}

/** 予測誠実性: 凍結済み予測と結果の照合対象を返す(Review画面用) */
export function frozenForecastsFor(db: DB, version: DecisionVersion) {
  return db.forecasts.filter((f) => f.versionId === version.id && f.frozenAt);
}
