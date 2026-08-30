"use client";

// あなたのパターン: 観察できる記録だけから可能性を示す。人格の診断ではない。

import { useEffect, useState } from "react";
import Link from "next/link";
import { useDB } from "@/lib/useDB";
import { store } from "@/lib/store";
import { computeIntegrity, detectSelectiveAttribution } from "@/lib/drift";
import { BLOCKER_LABEL } from "@/lib/types";
import { isAiEnabled, setAiEnabled } from "@/lib/settings";
import { useAuth, signOut } from "@/lib/auth";
import { AI_VENDOR } from "@/lib/legal";
import { IconChevron } from "@/components/icons";

const METRIC_LABEL: Record<string, string> = {
  clarity: "明確性",
  criteria: "判断基準",
  forecastHonesty: "予測誠実性",
  executionAlignment: "実行整合性",
  outcomeAcceptance: "結果受容",
  revisionQuality: "修正力",
};

export default function IdentityPage() {
  // localStorage はサーバー描画では読めないので、描画後に反映する
  const [aiOn, setAiOn] = useState(true);
  useEffect(() => setAiOn(isAiEnabled()), []);
  const auth = useAuth();

  const db = useDB();
  const integrity = computeIntegrity(db);
  const attribution = detectSelectiveAttribution(db);
  const committedCount = db.versions.filter((v) => v.committedAt).length;

  const actions = db.actions;
  const started24h = actions.filter((a) => {
    const created = new Date(a.createdAt).getTime();
    const startEvent = db.actionEvents.find(
      (e) => e.actionId === a.id && (e.eventType === "STARTED" || e.eventType === "COMPLETED")
    );
    if (!startEvent) return false;
    return new Date(startEvent.occurredAt).getTime() - created <= 86400000;
  });

  const blockerCounts = new Map<string, number>();
  for (const b of db.blockers) {
    blockerCounts.set(b.blockerCode, (blockerCounts.get(b.blockerCode) ?? 0) + 1);
  }

  return (
    <>
      <div className="appbar">
        <span className="title">あなたのパターン</span>
      </div>
      <p className="card-meta" style={{ margin: "0 0 12px" }}>
        記録から見えてきたことだけをお伝えします。性格の診断ではありません。
      </p>

      {committedCount < 3 && (
        <div className="callout neutral">
          確定した決断がまだ {committedCount} 件です。件数が少ないうちは、傾向を断定できません。
          3件以上たまると、パターンの候補が表示されます。
        </div>
      )}

      <div className="card strong">
        <div className="card-meta" style={{ fontWeight: 700 }}>24時間以内に最初の行動を開始</div>
        <div className="stat">
          <span className="num">
            {actions.length === 0 ? "—" : started24h.length}
            {actions.length > 0 && <span style={{ fontSize: 18, color: "var(--ink-soft)" }}> / {actions.length}</span>}
          </span>
          <span className="card-meta">外部に痕跡が残った行動のみ</span>
        </div>
      </div>

      <div className="section">Decision Integrity</div>
      {Object.entries(integrity).map(([key, m]) => {
        const ratio = m.total === 0 ? 0 : m.met / m.total;
        const warn = key === "forecastHonesty" && m.total > 0 && ratio < 1;
        return (
          <div key={key} className="ibar">
            <span className="label">{METRIC_LABEL[key]}</span>
            <div className="track">
              <div className={`fill ${warn ? "warn" : ""}`} style={{ width: `${ratio * 100}%` }} />
            </div>
            <span className="n">{m.total === 0 ? "—" : `${m.met}/${m.total}`}</span>
          </div>
        );
      })}

      {attribution.detected && (
        <>
          <div className="section">帰属の記録</div>
          <div className="callout" style={{ fontSize: 12 }}>{attribution.message}</div>
        </>
      )}

      {blockerCounts.size > 0 && committedCount >= 3 && (
        <>
          <div className="section">繰り返し観察された心理作用の候補</div>
          <div className="chips">
            {[...blockerCounts.entries()]
              .sort((a, b) => b[1] - a[1])
              .map(([code, count]) => (
                <span key={code} className="badge outline-accent">
                  {BLOCKER_LABEL[code as keyof typeof BLOCKER_LABEL]} ×{count}
                </span>
              ))}
          </div>
          <p className="card-meta" style={{ marginTop: 10 }}>
            これは診断ではなく、記録の集計です。当てはまらないと感じたら、その感覚のほうを信じてください。
          </p>
        </>
      )}

      <div className="section">アカウント</div>
      {auth.status === "SIGNED_IN" ? (
        <div className="card">
          <div style={{ fontSize: 14, fontWeight: 700 }}>{auth.account.email ?? "ログイン中"}</div>
          <div className="card-meta" style={{ marginTop: 4 }}>
            記録はアカウントに保存され、他の端末からも見られます。
          </div>
          <button className="btn ghost" style={{ marginTop: 8, minHeight: 40 }} onClick={() => void signOut()}>
            ログアウト
          </button>
        </div>
      ) : auth.status === "ANONYMOUS" ? (
        <div className="card">
          <div style={{ fontSize: 14, fontWeight: 700 }}>登録なしで使っています</div>
          <div className="card-meta" style={{ marginTop: 4, lineHeight: 1.8 }}>
            記録はこの端末にだけ入っています。ブラウザのデータを消すと消え、
            他の端末からは見られません。
          </div>
          <Link href="/signup?next=/identity">
            <button className="btn primary" style={{ marginTop: 10, minHeight: 42 }}>
              登録して記録を保存する
            </button>
          </Link>
        </div>
      ) : null}

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

      <div style={{ marginTop: 14 }}>
        {[
          { label: "プライバシーポリシー", href: "/legal/privacy" },
          { label: "利用規約", href: "/legal/terms" },
          { label: "特定商取引法に基づく表示", href: "/legal/tokushoho" },
        ].map((m) => (
          <Link key={m.href} href={m.href}>
            <span className="menu-row">
              {m.label}
              <span className="chev"><IconChevron /></span>
            </span>
          </Link>
        ))}
      </div>

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
          JSONエクスポート
        </button>
      </div>
    </>
  );
}
