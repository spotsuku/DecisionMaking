// Stripeからの通知で契約状態を反映する。
//
// 署名を検証しないと、誰でも「有料になった」と偽の通知を送れる。
// 署名鍵が無い場合は受け付けない(黙って通すより、決済が動かない方が安全)。

import { NextResponse } from "next/server";
import Stripe from "stripe";
import { stripe, planForPrice } from "@/lib/stripe";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const sk = stripe();
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!sk || !secret) return NextResponse.json({ error: "not_configured" }, { status: 503 });

  const signature = request.headers.get("stripe-signature");
  if (!signature) return NextResponse.json({ error: "no_signature" }, { status: 400 });

  let event: Stripe.Event;
  try {
    // 署名検証には生のボディが必要
    event = sk.webhooks.constructEvent(await request.text(), signature, secret);
  } catch (e) {
    console.error("[billing/webhook] 署名の検証に失敗", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "bad_signature" }, { status: 400 });
  }

  switch (event.type) {
    case "customer.subscription.created":
    case "customer.subscription.updated": {
      const sub = event.data.object;
      const plan = planForPrice(sub.items.data[0]?.price?.id);
      const active = sub.status === "active" || sub.status === "trialing";
      console.info("[billing] 契約の更新", { customer: sub.customer, plan, active });
      // TODO: profiles.plan を更新する(Supabase の service role キーが必要)
      break;
    }
    case "customer.subscription.deleted": {
      console.info("[billing] 契約の終了", { customer: event.data.object.customer });
      // TODO: profiles.plan を FREE に戻す
      break;
    }
    default:
      break;
  }
  return NextResponse.json({ received: true });
}
