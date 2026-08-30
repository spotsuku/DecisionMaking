"use client";

// あなたのパターン: 観察できる記録だけから可能性を示す。人格の診断ではない。

import { useDB } from "@/lib/useDB";
import { store } from "@/lib/store";
import { computeIntegrity, detectSelectiveAttribution } from "@/lib/drift";
import { BLOCKER_LABEL } from "@/lib/types";

const METRIC_LABEL: Record<string, string> = {
  clarity: "明確性",
  criteria: "判断基準",
  forecastHonesty: "予測誠実性",
  executionAlignment: "実行整合性",
  outcomeAcceptance: "結果受容",
  revisionQuality: "修正力",
};

export default function IdentityPage() {
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

      <div className="footer-note">
        決断履歴は削除・上書きできません(履歴の不変性)。データはこの端末に保存されます。
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
