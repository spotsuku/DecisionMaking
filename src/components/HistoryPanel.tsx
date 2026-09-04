"use client";

// 履歴(3.5): 不変のversionタイムライン。旧決断は更新・削除されず、変更理由が接続される。

import { useDB, fmtDate, fmtDateTime } from "@/lib/useDB";
import type { Decision } from "@/lib/types";
import { STATE_LABEL } from "@/lib/types";
import { displayLabel } from "@/lib/options";

export function HistoryPanel({ decision }: { decision: Decision }) {
  const db = useDB();
  const versions = db.versions
    .filter((v) => v.decisionId === decision.id)
    .sort((a, b) => a.versionNo - b.versionNo);
  const changes = db.changes.filter((c) => c.decisionId === decision.id);
  const audit = db.audit
    .filter((e) => e.entityType === "decision" && e.entityId === decision.id)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  return (
    <>
      <div className="callout neutral">
        履歴は正本です。決断を削除・上書きして「最初からそう考えていた」状態を作ることはできません(INV-01)。
      </div>

      <h2 className="section">Versionタイムライン</h2>
      <div className="timeline">
        {versions.map((v) => {
          const selected = db.options.find((o) => o.id === v.selectedOptionId);
          const change = changes.find((c) => c.toVersionId === v.id);
          const outcome = db.outcomes.filter((o) => o.versionId === v.id).at(-1);
          const frozen = db.forecasts.filter((f) => f.versionId === v.id && f.frozenAt);
          const pos = frozen.find((f) => f.forecastType === "POSITIVE");
          const neg = frozen.find((f) => f.forecastType === "NEGATIVE");
          return (
            <div key={v.id} className={`timeline-item ${v.committedAt ? "accent" : ""}`}>
              <div className="card-row">
                <strong>v{v.versionNo}</strong>
                <span className="badge soft">{v.committedAt ? `COMMITTED ${fmtDate(v.committedAt)}` : STATE_LABEL[v.state]}</span>
              </div>
              <div style={{ fontSize: 14, marginTop: 4 }}>{v.question}</div>
              {change && (
                <div className="callout" style={{ margin: "8px 0", fontSize: 13 }}>
                  <strong>変更 v{versions.find((x) => x.id === change.fromVersionId)?.versionNo} → v{v.versionNo}</strong>
                  <div>きっかけ: {change.trigger}</div>
                  <div>新事実: {change.newEvidence}</div>
                  <div>変わった前提: {change.changedAssumption}</div>
                  <div>旧結果の受容: {change.priorResultAcknowledged ? "済み" : "未"}</div>
                </div>
              )}
              {selected && <div className="card-meta">選択: {displayLabel(selected.label)}</div>}
              {pos && <div className="card-meta">▲ {pos.outcomeStatement}</div>}
              {neg && <div className="card-meta" style={{ color: "var(--accent-dark)" }}>▼ {neg.outcomeStatement}</div>}
              {outcome && (
                <div className="card-meta">
                  結果({fmtDate(outcome.observedAt)}): {outcome.resultSummary}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <h2 className="section">監査ログ</h2>
      <div className="table-wrap">
        <table className="data">
          <thead>
            <tr><th>日時</th><th>イベント</th><th>内容</th></tr>
          </thead>
          <tbody>
            {audit.map((e) => (
              <tr key={e.id}>
                <td style={{ whiteSpace: "nowrap" }}>{fmtDateTime(e.createdAt)}</td>
                <td>{e.eventType}</td>
                <td>{e.payloadSummary}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
