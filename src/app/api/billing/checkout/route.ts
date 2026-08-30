// 決済ページの発行。鍵が無ければ not_configured を返すだけで、アプリは止めない。

import { NextResponse } from "next/server";
import { stripe, priceIdFor } from "@/lib/stripe";
import type { PlanCode } from "@/lib/plan";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const sk = stripe();
  let plan: PlanCode;
  try {
    ({ plan } = (await request.json()) as { plan: PlanCode });
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }
  if (plan !== "STANDARD" && plan !== "PRO") {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }

  const price = priceIdFor(plan);
  if (!sk || !price) return NextResponse.json({ error: "not_configured" }, { status: 503 });

  const origin = new URL(request.url).origin;
  try {
    const session = await sk.checkout.sessions.create({
      mode: "subscription",
      line_items: [{ price, quantity: 1 }],
      success_url: `${origin}/plans?checkout=done`,
      cancel_url: `${origin}/plans?checkout=cancelled`,
      // 従量分は「決断1件ごと」に別途計上する。ここでは月額だけを契約する
      metadata: { plan },
    });
    return NextResponse.json({ url: session.url });
  } catch (e) {
    console.error("[billing/checkout]", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "unavailable" }, { status: 502 });
  }
}
