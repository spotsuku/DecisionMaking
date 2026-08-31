"use client";

// マイページ: 自分のこと(ログイン・プラン・設定・規約)をまとめる。
//
// これまでホーム右上の人物アイコンは「あなたのパターン」へ飛んでいた。
// タブの「パターン」と同じ行き先で、しかもアイコンが指すもの(自分の情報)と
// 中身(記録の分析)が違っていた。押した通りの場所を用意する。

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useDB } from "@/lib/useDB";
import { store } from "@/lib/store";
import { useAuth, signOut } from "@/lib/auth";
import { getPlan, getUsage } from "@/lib/billing";
import { PLANS, type Usage } from "@/lib/plan";
import { isAiEnabled, setAiEnabled } from "@/lib/settings";
import { AI_VENDOR } from "@/lib/legal";
import { IconBack, IconChevron, IconUser } from "@/components/icons";

export default function AccountPage() {
  const router = useRouter();
  const auth = useAuth();
  const db = useDB();

  // localStorage はサーバー描画では読めないので、描画後に反映する
  const [aiOn, setAiOn] = useState(true);
  const [plan, setPlan] = useState(PLANS.FREE);
  const [usage, setUsage] = useState<Usage | null>(null);
  useEffect(() => {
    setAiOn(isAiEnabled());
    setPlan(PLANS[getPlan()]);
    setUsage(getUsage());
  }, [db]);

  const committed = db.versions.filter((v) => v.committedAt).length;

  return (
    <>
      <div className="appbar">
        <button className="back" onClick={() => router.push("/")} aria-label="戻る"><IconBack /></button>
        <span className="title">マイページ</span>
      </div>

      {/* だれとして使っているか */}
      {auth.status === "SIGNED_IN" ? (
        <div className="card strong">
          <div className="me">
            <span className="avatar lg"><IconUser /></span>
            <div>
              <div style={{ fontSize: 15, fontWeight: 800 }}>{auth.account.email ?? "ログイン中"}</div>
              <div className="card-meta" style={{ marginTop: 2 }}>
                記録はアカウントに保存され、他の端末からも見られます。
              </div>
            </div>
          </div>
          <button className="btn ghost" style={{ marginTop: 10, minHeight: 42 }} onClick={() => void signOut()}>
            ログアウト
          </button>
        </div>
      ) : (
        <div className="card strong">
          <div className="me">
            <span className="avatar lg"><IconUser /></span>
            <div>
              <div style={{ fontSize: 15, fontWeight: 800 }}>登録なしで使っています</div>
              <div className="card-meta" style={{ marginTop: 2, lineHeight: 1.8 }}>
                記録はこの端末にだけ入っています。ブラウザのデータを消すと消え、
                他の端末からは見られません。
              </div>
            </div>
          </div>
          <Link href="/signup?next=/account">
            <button className="btn primary" style={{ marginTop: 12, minHeight: 46 }}>
              登録・ログインして記録を保存する
            </button>
          </Link>
        </div>
      )}

      {/* いまの契約と使用量 */}
      <div className="section">プラン</div>
      <div className="card">
        <div className="card-row">
          <span style={{ fontSize: 15, fontWeight: 800 }}>{plan.label}</span>
          <span className="card-meta" style={{ marginLeft: "auto" }}>
            {plan.monthlyYen === 0 ? "¥0" : `¥${plan.monthlyYen.toLocaleString()}/月`}
          </span>
        </div>
        {usage && (
          <div className="kv" style={{ marginTop: 10 }}>
            <span>決断</span>
            <span>
              {plan.code === "FREE"
                ? `${usage.decisionsTotal} / ${plan.decisionQuota} 件(累計)`
                : `${usage.decisionsThisPeriod} / ${plan.decisionQuota} 件(今月)`}
            </span>
            <span>確定した決断</span>
            <span>{committed} 件</span>
            {plan.overageYen !== null && (
              <>
                <span>今月の従量</span>
                <span>
                  ¥{usage.overageYen.toLocaleString()}(上限 ¥{usage.overageCapYen.toLocaleString()})
                </span>
              </>
            )}
          </div>
        )}
        <Link href="/plans">
          <span className="chip-btn soft" style={{ marginTop: 12 }}>プランを見る・変える</span>
        </Link>
      </div>

      {/* 記録の分析はタブ側にあるので、ここからも行けるようにする */}
      <div className="section">記録</div>
      <Link href="/identity">
        <span className="menu-row">あなたのパターン<span className="chev"><IconChevron /></span></span>
      </Link>
      <Link href="/decisions">
        <span className="menu-row">すべての決断<span className="chev"><IconChevron /></span></span>
      </Link>

      <div className="section">設定</div>
      <label className="check-row">
        <input
          type="checkbox"
          checked={aiOn}
          onChange={(e) => {
            setAiEnabled(e.target.checked);
            setAiOn(e.target.checked);
          }}
        />
        <span>
          AIの提案を使う
          <br />
          <span className="card-meta">
            書き出しと診断の本文が {AI_VENDOR} の API へ送られます。切っても、ルールベースの提案と
            診断はそのまま使えます。
          </span>
        </span>
      </label>

      <div className="section">規約</div>
      {[
        { label: "プライバシーポリシー", href: "/legal/privacy" },
        { label: "利用規約", href: "/legal/terms" },
        { label: "特定商取引法に基づく表示", href: "/legal/tokushoho" },
      ].map((m) => (
        <Link key={m.href} href={m.href}>
          <span className="menu-row">{m.label}<span className="chev"><IconChevron /></span></span>
        </Link>
      ))}

      <div className="footer-note">
        決断履歴は削除・上書きできません(履歴の不変性)。
        {auth.status === "SIGNED_IN" ? "データはアカウントに保存されます。" : "データはこの端末に保存されます。"}
        <button
          className="btn ghost"
          style={{ marginTop: 6, minHeight: 40 }}
          onClick={() => {
            const blob = new Blob([store.exportJSON()], { type: "application/json" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = "decision-making-export.json";
            a.click();
            URL.revokeObjectURL(url);
          }}
        >
          記録をJSONで書き出す
        </button>
      </div>
    </>
  );
}
