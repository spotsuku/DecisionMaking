"use client";

// 料金プラン。3件目の決断を始めようとしたときに、ここへ来る。

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { PLANS, estimateMonthlyYen, type PlanCode } from "@/lib/plan";
import { getPlan, setPlan, getUsage, setOverageCap } from "@/lib/billing";
import { IconBack } from "@/components/icons";

export default function PlansPage() {
  const router = useRouter();
  const [plan, setPlanState] = useState<PlanCode>("FREE");
  const [used, setUsed] = useState(0);
  const [billed, setBilled] = useState(0);
  const [cap, setCap] = useState(5000);
  const [busy, setBusy] = useState<PlanCode | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const u = getUsage();
    setPlanState(getPlan());
    setUsed(getPlan() === "FREE" ? u.decisionsTotal : u.decisionsThisPeriod);
    setBilled(estimateMonthlyYen(getPlan(), u));
    setCap(u.overageCapYen);
  }, []);

  const subscribe = async (code: PlanCode) => {
    setError(null);
    setBusy(code);
    try {
      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ plan: code }),
      });
      const body = (await res.json()) as { url?: string; error?: string };
      if (body.url) {
        window.location.href = body.url;
        return;
      }
      setError(
        body.error === "not_configured"
          ? "決済がまだ設定されていません。管理者にお問い合わせください。"
          : "決済ページを開けませんでした。時間をおいて試してください。"
      );
    } catch {
      setError("通信できませんでした。");
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <div className="appbar">
        <button className="back" onClick={() => router.back()} aria-label="戻る"><IconBack /></button>
        <span className="title">プラン</span>
      </div>

      <div className="card" style={{ marginTop: 4 }}>
        <div className="card-meta" style={{ fontWeight: 700 }}>いまの状況</div>
        <div style={{ fontSize: 14, marginTop: 4, lineHeight: 1.9 }}>
          プラン: <strong>{PLANS[plan].label}</strong>
          <br />
          {plan === "FREE" ? "作った決断" : "今月の決断"}: <strong>{used}</strong> / {PLANS[plan].decisionQuota} 件
          <br />
          今月の請求見込み: <strong>{billed.toLocaleString()}円</strong>
        </div>
      </div>

      {error && <div className="callout">{error}</div>}

      {(["STANDARD", "PRO"] as const).map((code) => {
        const p = PLANS[code];
        return (
          <div key={code} className={`card ${plan === code ? "strong" : ""}`} style={{ marginTop: 12 }}>
            <div className="chips">
              <span className="badge inverse">{p.label}</span>
              {plan === code && <span className="badge soft">利用中</span>}
            </div>
            <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: "-0.02em", margin: "8px 0 2px" }}>
              {p.monthlyYen.toLocaleString()}円
              <span style={{ fontSize: 12.5, fontWeight: 600, color: "var(--ink-soft)" }}> / 月(税抜)</span>
            </div>
            <ul style={{ margin: "8px 0 12px", paddingLeft: "1.2em", fontSize: 13, lineHeight: 1.9 }}>
              {p.features.map((f) => <li key={f}>{f}</li>)}
            </ul>
            <button
              className="btn primary"
              disabled={plan === code || busy !== null}
              onClick={() => subscribe(code)}
            >
              {plan === code ? "利用中です" : busy === code ? "決済ページへ…" : `${p.label}にする`}
            </button>
          </div>
        );
      })}

      <div className="section">従量課金の上限</div>
      <p className="card-meta" style={{ marginTop: -4, lineHeight: 1.8 }}>
        月の枠を超えた決断は1件ごとに課金されます。ここで決めた金額に達したら、
        その月はそれ以上課金されません。使いすぎを止めるための設定です。
      </p>
      <div className="field" style={{ marginTop: 8 }}>
        <label>上限(円 / 月)</label>
        <input
          type="number"
          min={0}
          step={500}
          value={cap}
          onChange={(e) => setCap(Number(e.target.value))}
          onBlur={() => setOverageCap(cap)}
        />
      </div>

      {plan !== "FREE" && (
        <button
          className="btn ghost"
          style={{ marginTop: 16 }}
          onClick={() => {
            if (window.confirm("無料プランに戻します。よろしいですか?")) {
              setPlan("FREE");
              setPlanState("FREE");
            }
          }}
        >
          無料プランに戻す
        </button>
      )}

      <p className="card-meta" style={{ marginTop: 18, lineHeight: 1.8 }}>
        <Link href="/legal/terms">利用規約</Link>
        {" · "}
        <Link href="/legal/tokushoho">特定商取引法に基づく表示</Link>
      </p>
    </>
  );
}
