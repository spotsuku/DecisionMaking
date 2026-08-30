// Stripe(サーバー側のみ)。鍵が無いときは null を返し、
// 呼び出し側は「決済は未設定」として扱う。アプリ本体は無料プランで動き続ける。

import Stripe from "stripe";
import type { PlanCode } from "./plan";

let cached: Stripe | null | undefined;

export function stripe(): Stripe | null {
  if (cached !== undefined) return cached;
  const key = process.env.STRIPE_SECRET_KEY;
  cached = key ? new Stripe(key) : null;
  return cached;
}

/** プラン → Stripeの価格ID */
export function priceIdFor(plan: PlanCode): string | null {
  if (plan === "STANDARD") return process.env.NEXT_PUBLIC_STRIPE_PRICE_STANDARD ?? null;
  if (plan === "PRO") return process.env.NEXT_PUBLIC_STRIPE_PRICE_PRO ?? null;
  return null;
}

/** Stripeの価格ID → プラン。webhookで契約内容を読み戻すのに使う */
export function planForPrice(priceId: string | null | undefined): PlanCode | null {
  if (!priceId) return null;
  if (priceId === process.env.NEXT_PUBLIC_STRIPE_PRICE_STANDARD) return "STANDARD";
  if (priceId === process.env.NEXT_PUBLIC_STRIPE_PRICE_PRO) return "PRO";
  return null;
}
