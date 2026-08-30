"use client";

// 課金の状態。ログインしていない間は端末内で数え、ログイン後はDBの値を使う。
//
// 大事なのは「黙って課金しない」こと。枠を超える操作の前に必ず金額を出す。

import { store } from "./store";
import {
  canStartDecision,
  emptyUsage,
  rollPeriod,
  type PlanCode,
  type StartVerdict,
  type Usage,
} from "./plan";

const PLAN_KEY = "dm.billing.plan";
const USAGE_KEY = "dm.billing.usage";

/** 課金期間の始まり(いまは暦月)。DB接続後は契約日ベースに置き換える */
export function currentPeriodStart(at: Date = new Date()): string {
  return `${at.getFullYear()}-${String(at.getMonth() + 1).padStart(2, "0")}-01`;
}

export function getPlan(): PlanCode {
  if (typeof window === "undefined") return "FREE";
  try {
    const v = window.localStorage.getItem(PLAN_KEY);
    return v === "STANDARD" || v === "PRO" ? v : "FREE";
  } catch {
    return "FREE";
  }
}

export function setPlan(plan: PlanCode) {
  try {
    window.localStorage.setItem(PLAN_KEY, plan);
  } catch {
    // 保存できなくても無料プランとして動く
  }
}

/**
 * 利用実績。決断の総数は記録そのものから数えるので、
 * カウンタがずれても実態と食い違わない。
 */
export function getUsage(): Usage {
  const period = currentPeriodStart();
  let stored = emptyUsage(period);
  if (typeof window !== "undefined") {
    try {
      const raw = window.localStorage.getItem(USAGE_KEY);
      if (raw) stored = { ...stored, ...(JSON.parse(raw) as Partial<Usage>) };
    } catch {
      // 壊れていたら初期値で続ける
    }
  }
  const usage = rollPeriod(stored, period);

  const decisions = store.getSnapshot().decisions;
  return {
    ...usage,
    decisionsTotal: decisions.length,
    decisionsThisPeriod: decisions.filter((d) => d.createdAt >= `${period}T00:00:00`).length,
  };
}

export function saveUsage(usage: Usage) {
  try {
    window.localStorage.setItem(USAGE_KEY, JSON.stringify(usage));
  } catch {
    // 保存できなくても、決断の件数からは数え直せる
  }
}

/** 新しい決断を始めてよいか。課金が要るなら金額つきで返す */
export function checkStart(): StartVerdict & { plan: PlanCode; usage: Usage } {
  const plan = getPlan();
  const usage = getUsage();
  return { ...canStartDecision(plan, usage), plan, usage };
}

/** 従量で始めたことを記録する */
export function recordOverage(charge: number) {
  if (charge <= 0) return;
  const usage = getUsage();
  saveUsage({ ...usage, overageYen: usage.overageYen + charge });
}

export function setOverageCap(yen: number) {
  saveUsage({ ...getUsage(), overageCapYen: Math.max(0, Math.round(yen)) });
}
