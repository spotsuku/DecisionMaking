// 料金プランと利用上限(課金の単位は「決断」1件)。
//
// 原価の考え方:
//   1決断を最後まで進めると、抽出・チャット応答・欄への振り分けで
//   おおよそ ¥19 分のトークンを使う。言い換えやリトライの上振れを見て
//   原価上限を ¥37/決断 と置き、粗利75〜85%になるよう単価を決めている。
//   AI_TURNS_PER_DECISION は、その原価上限を実際に守るための安全弁。
//
// ここは純粋な計算だけを置く。課金の実行(Stripe)も保存(DB)もしない。

export type PlanCode = "FREE" | "STANDARD" | "PRO";

export interface PlanDef {
  code: PlanCode;
  label: string;
  /** 月額(税抜・円) */
  monthlyYen: number;
  /** 期間内に新しく始められる決断の数。FREEだけは累計で数える */
  decisionQuota: number;
  /** 枠を超えた1決断あたりの従量単価(円)。nullなら超過できない */
  overageYen: number | null;
  /** 決断1件あたりのAI応答の上限。超えた分はルールベースで続行する */
  aiTurnsPerDecision: number;
  features: string[];
}

export const PLANS: Record<PlanCode, PlanDef> = {
  FREE: {
    code: "FREE",
    label: "無料",
    monthlyYen: 0,
    decisionQuota: 2,
    overageYen: null,
    aiTurnsPerDecision: 40,
    features: [
      "決断は2件まで",
      "AIの提案つきの書き出し・チャット診断",
      "決断成立チェック、Decision Card、レビュー",
    ],
  },
  STANDARD: {
    code: "STANDARD",
    label: "スタンダード",
    monthlyYen: 1480,
    decisionQuota: 10,
    overageYen: 180,
    aiTurnsPerDecision: 40,
    features: [
      "毎月10件の決断",
      "11件目からは1件 ¥180 の従量課金",
      "端末をまたいだ同期、パターン分析",
    ],
  },
  PRO: {
    code: "PRO",
    label: "プロ",
    monthlyYen: 3800,
    decisionQuota: 30,
    overageYen: 150,
    aiTurnsPerDecision: 60,
    features: [
      "毎月30件の決断",
      "31件目からは1件 ¥150 の従量課金",
      "1決断あたりのAI応答上限が多い",
    ],
  },
};

/** 従量課金の既定の上限(円/月)。本人が変更できる安全弁 */
export const DEFAULT_OVERAGE_CAP_YEN = 5000;

/** 1決断あたりの原価上限(円)。単価を決めるときの根拠 */
export const COST_CEILING_YEN_PER_DECISION = 37;

export interface Usage {
  /** 課金期間の開始(ISO) */
  periodStart: string;
  /** 期間内に始めた決断の数 */
  decisionsThisPeriod: number;
  /** 累計の決断数(FREEの判定に使う) */
  decisionsTotal: number;
  /** 期間内に発生した従量課金額(円) */
  overageYen: number;
  /** 本人が設定した従量課金の上限(円) */
  overageCapYen: number;
}

export const emptyUsage = (periodStart: string): Usage => ({
  periodStart,
  decisionsThisPeriod: 0,
  decisionsTotal: 0,
  overageYen: 0,
  overageCapYen: DEFAULT_OVERAGE_CAP_YEN,
});

export type StartVerdict =
  /** 枠の中。追加の請求なし */
  | { allowed: true; charge: 0; reason: "INCLUDED" }
  /** 枠を超えるが従量で続けられる。金額を先に見せて本人が決める */
  | { allowed: true; charge: number; reason: "OVERAGE" }
  /** 無料枠を使い切った。月額へ */
  | { allowed: false; charge: 0; reason: "UPGRADE_REQUIRED" }
  /** 本人が決めた従量上限に達した */
  | { allowed: false; charge: 0; reason: "OVERAGE_CAP" };

/**
 * 新しい決断を始められるか。
 * 課金が発生する場合は、始める前に金額を返す(黙って課金しない)。
 */
export function canStartDecision(plan: PlanCode, usage: Usage): StartVerdict {
  const def = PLANS[plan];
  // 無料プランは累計で数える。月が変わっても増えない
  const used = plan === "FREE" ? usage.decisionsTotal : usage.decisionsThisPeriod;
  if (used < def.decisionQuota) return { allowed: true, charge: 0, reason: "INCLUDED" };
  if (def.overageYen === null) return { allowed: false, charge: 0, reason: "UPGRADE_REQUIRED" };
  if (usage.overageYen + def.overageYen > usage.overageCapYen) {
    return { allowed: false, charge: 0, reason: "OVERAGE_CAP" };
  }
  return { allowed: true, charge: def.overageYen, reason: "OVERAGE" };
}

/**
 * この決断でまだAIを呼べるか。
 * 上限に達しても機能は止めず、ルールベースの応答で続ける(6.1)。
 */
export function canUseAI(plan: PlanCode, turnsUsedForDecision: number): boolean {
  return turnsUsedForDecision < PLANS[plan].aiTurnsPerDecision;
}

/** 今月の請求見込み(円)。月額 + 従量 */
export function estimateMonthlyYen(plan: PlanCode, usage: Usage): number {
  return PLANS[plan].monthlyYen + usage.overageYen;
}

/** 決断n件を進めたときの原価上限(円)。単価の妥当性を確かめるために使う */
export function estimateCostYen(decisions: number): number {
  return decisions * COST_CEILING_YEN_PER_DECISION;
}

/** 粗利率(0-1)。原価上限で見た最悪値 */
export function grossMargin(plan: PlanCode): number {
  const def = PLANS[plan];
  if (def.monthlyYen === 0) return 0;
  const cost = estimateCostYen(def.decisionQuota);
  return (def.monthlyYen - cost) / def.monthlyYen;
}

/** 課金期間が変わったら、期間内カウンタだけ戻す(累計と上限設定は残す) */
export function rollPeriod(usage: Usage, newPeriodStart: string): Usage {
  if (usage.periodStart === newPeriodStart) return usage;
  return { ...usage, periodStart: newPeriodStart, decisionsThisPeriod: 0, overageYen: 0 };
}

/** 決断を1件始めたときの利用状況の更新 */
export function applyStart(usage: Usage, verdict: StartVerdict): Usage {
  if (!verdict.allowed) return usage;
  return {
    ...usage,
    decisionsThisPeriod: usage.decisionsThisPeriod + 1,
    decisionsTotal: usage.decisionsTotal + 1,
    overageYen: usage.overageYen + verdict.charge,
  };
}
