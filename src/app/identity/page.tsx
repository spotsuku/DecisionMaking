"use client";

// Identity(8章): 長期パターン。逃避傾向・実行率・修正力を、根拠となる記録つきで表示する。
// 人格タイプは付けない(9.1)。件数が少ないうちは断定しない(10.1)。

import { useDB } from "@/lib/useDB";
import { computeIntegrity, detectSelectiveAttribution } from "@/lib/drift";
import { BLOCKER_LABEL } from "@/lib/types";

const METRIC_LABEL: Record<string, { label: string; desc: string }> = {
  clarity: { label: "明確性", desc: "問い・主体・期限がそろった決断" },
  criteria: { label: "判断基準", desc: "比較の物差し(2件以上)を使った決断" },
  forecastHonesty: { label: "予測誠実性", desc: "結果前に両面予測を凍結した決断" },
  executionAlignment: { label: "実行整合性", desc: "行動が選択と一致した決断" },
  outcomeAcceptance: { label: "結果受容", desc: "良否にかかわらず結果を記録した決断" },
  revisionQuality: { label: "修正力", desc: "理由と旧結果の受容を伴った変更" },
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
      <h1 className="page-title">あなたのパターン</h1>
      <p className="page-sub">
        観察できる記録だけから可能性を示します。人格の診断ではありません。
      </p>

      {committedCount < 3 && (
        <div className="callout neutral">
          確定した決断がまだ {committedCount} 件です。件数が少ないうちは、傾向を断定できません。
          3件以上たまると、パターンの候補が表示されます。
        </div>
      )}

      <h2 className="section">Decision Integrity</h2>
      <div className="table-wrap">
        <table className="data">
          <thead>
            <tr><th>指標</th><th>定義</th><th>実績</th></tr>
          </thead>
          <tbody>
            {Object.entries(integrity).map(([key, m]) => (
              <tr key={key}>
                <td style={{ fontWeight: 700, whiteSpace: "nowrap" }}>{METRIC_LABEL[key].label}</td>
                <td>{METRIC_LABEL[key].desc}</td>
                <td style={{ whiteSpace: "nowrap" }}>
                  {m.total === 0 ? "—" : (
                    <>
                      <strong>{m.met}</strong> / {m.total}
                      {m.total > 0 && m.met < m.total && key === "forecastHonesty" && (
                        <span className="badge outline-accent" style={{ marginLeft: 8 }}>要注意</span>
                      )}
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2 className="section">行動の立ち上がり</h2>
      <div className="card flat">
        <div className="card-row">
          <span>24時間以内に最初の行動を開始した割合</span>
          <strong style={{ marginLeft: "auto", fontSize: 20 }}>
            {actions.length === 0 ? "—" : `${started24h.length} / ${actions.length}`}
          </strong>
        </div>
        <div className="card-meta">外部世界に痕跡が残った行動だけを数えています。</div>
      </div>

      {attribution.detected && (
        <>
          <h2 className="section">帰属の記録</h2>
          <div className="callout">{attribution.message}</div>
        </>
      )}

      {blockerCounts.size > 0 && committedCount >= 3 && (
        <>
          <h2 className="section">繰り返し観察された心理作用の候補</h2>
          {[...blockerCounts.entries()]
            .sort((a, b) => b[1] - a[1])
            .map(([code, count]) => (
              <div key={code} className="card flat">
                <div className="card-row">
                  <span className="badge outline-accent">{BLOCKER_LABEL[code as keyof typeof BLOCKER_LABEL]}</span>
                  <span className="card-meta">{count} 回観察</span>
                </div>
              </div>
            ))}
          <p className="card-meta">これは診断ではなく、記録の集計です。当てはまらないと感じたら、その感覚のほうを信じてください。</p>
        </>
      )}
    </>
  );
}
