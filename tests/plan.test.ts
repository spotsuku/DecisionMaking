// 料金プランと利用上限のテスト

import { describe, it, expect } from "vitest";
import {
  PLANS,
  canStartDecision,
  canUseAI,
  estimateMonthlyYen,
  estimateCostYen,
  grossMargin,
  rollPeriod,
  applyStart,
  emptyUsage,
  DEFAULT_OVERAGE_CAP_YEN,
  type Usage,
} from "../src/lib/plan";

const usage = (o: Partial<Usage> = {}): Usage => ({ ...emptyUsage("2026-08-01"), ...o });

describe("無料枠(決断3件目から課金)", () => {
  it("2件目までは無料で始められる", () => {
    expect(canStartDecision("FREE", usage({ decisionsTotal: 0 })).allowed).toBe(true);
    expect(canStartDecision("FREE", usage({ decisionsTotal: 1 })).allowed).toBe(true);
  });

  it("受入テスト: 3件目は月額への案内になる(勝手に課金しない)", () => {
    const v = canStartDecision("FREE", usage({ decisionsTotal: 2 }));
    expect(v.allowed).toBe(false);
    expect(v.reason).toBe("UPGRADE_REQUIRED");
    expect(v.charge).toBe(0);
  });

  it("無料枠は累計で数える(月が変わっても戻らない)", () => {
    const rolled = rollPeriod(usage({ decisionsTotal: 2, decisionsThisPeriod: 2 }), "2026-09-01");
    expect(rolled.decisionsThisPeriod).toBe(0);
    expect(canStartDecision("FREE", rolled).allowed).toBe(false);
  });
});

describe("従量課金(月額も無制限にしない)", () => {
  it("枠の中は追加請求なし", () => {
    const v = canStartDecision("STANDARD", usage({ decisionsThisPeriod: 9 }));
    expect(v).toEqual({ allowed: true, charge: 0, reason: "INCLUDED" });
  });

  it("受入テスト: 枠を超えたら、始める前に金額を返す", () => {
    const v = canStartDecision("STANDARD", usage({ decisionsThisPeriod: 10 }));
    expect(v.allowed).toBe(true);
    expect(v.charge).toBe(180);
    expect(v.reason).toBe("OVERAGE");
  });

  it("本人が決めた従量上限に達したら止まる(青天井にしない)", () => {
    const v = canStartDecision("STANDARD", usage({ decisionsThisPeriod: 40, overageYen: 4900 }));
    expect(v.allowed).toBe(false);
    expect(v.reason).toBe("OVERAGE_CAP");
  });

  it("既定の従量上限は5,000円", () => {
    expect(emptyUsage("2026-08-01").overageCapYen).toBe(DEFAULT_OVERAGE_CAP_YEN);
  });

  it("月が変われば従量の実績はリセットされる", () => {
    const rolled = rollPeriod(usage({ decisionsThisPeriod: 12, overageYen: 360 }), "2026-09-01");
    expect(rolled.overageYen).toBe(0);
    expect(rolled.overageCapYen).toBe(DEFAULT_OVERAGE_CAP_YEN);
  });
});

describe("利用状況の更新", () => {
  it("従量で始めた分は請求見込みに乗る", () => {
    let u = usage({ decisionsThisPeriod: 10 });
    u = applyStart(u, canStartDecision("STANDARD", u));
    expect(u.overageYen).toBe(180);
    expect(estimateMonthlyYen("STANDARD", u)).toBe(1480 + 180);
  });

  it("始められなかったときは何も増えない", () => {
    const u = usage({ decisionsTotal: 2 });
    expect(applyStart(u, canStartDecision("FREE", u))).toEqual(u);
  });
});

describe("AIの呼び出し上限(原価の安全弁)", () => {
  it("上限までは呼べる", () => {
    expect(canUseAI("STANDARD", 39)).toBe(true);
    expect(canUseAI("STANDARD", 40)).toBe(false);
  });
  it("プロは上限が多い", () => {
    expect(canUseAI("PRO", 40)).toBe(true);
  });
});

describe("単価が原価に対して成立している", () => {
  it("有料プランの粗利は70%以上ある", () => {
    expect(grossMargin("STANDARD")).toBeGreaterThan(0.7);
    expect(grossMargin("PRO")).toBeGreaterThan(0.7);
  });

  it("従量単価も原価上限を大きく上回る", () => {
    for (const code of ["STANDARD", "PRO"] as const) {
      const over = PLANS[code].overageYen!;
      expect(over).toBeGreaterThan(estimateCostYen(1) * 3);
    }
  });

  it("枠を使い切っても月額が原価を下回らない", () => {
    for (const code of ["STANDARD", "PRO"] as const) {
      expect(PLANS[code].monthlyYen).toBeGreaterThan(estimateCostYen(PLANS[code].decisionQuota));
    }
  });
});
