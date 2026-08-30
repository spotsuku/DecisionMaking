"use client";

// 実行(S8): 行動イベントの記録。Drift検知のため、行動がどの案に向かうかを持つ。

import { useState } from "react";
import { useDB, fmtDate, fmtDateTime, isOverdue } from "@/lib/useDB";
import { store } from "@/lib/store";
import { detectDrift } from "@/lib/drift";
import type { ActionRole, Decision, DecisionVersion } from "@/lib/types";

const ROLE_LABEL: Record<ActionRole, string> = {
  ADVANCE: "前進",
  MITIGATE: "リスク低減",
  EXIT_PREP: "撤退準備",
};

export function ActionPanel({ decision, version }: { decision: Decision; version: DecisionVersion }) {
  const db = useDB();
  const actions = db.actions.filter((a) => a.decisionId === decision.id).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const options = db.options.filter((o) => o.versionId === version.id && o.active);
  const drift = detectDrift(db, decision.id);
  const committed = !!version.committedAt;

  const [text, setText] = useState("");
  const [role, setRole] = useState<ActionRole>("ADVANCE");
  const [optionId, setOptionId] = useState<string>(version.selectedOptionId ?? "");
  const [dueAt, setDueAt] = useState(new Date(Date.now() + 86400000).toISOString().slice(0, 10));

  if (!committed && actions.length === 0) {
    return (
      <div className="callout neutral">
        行動は決断の確定(Commit)と同時に定義されます。決断なしの行動が増えると「曖昧なまま進行」として検知されます(3.6)。
      </div>
    );
  }

  return (
    <>
      {drift.drifting && (
        <div className="callout">
          <strong>Decision Drift</strong> — {drift.message}
          <div style={{ marginTop: 6, fontSize: 12.5 }}>
            変更する場合は「レビュー」タブから、旧決断を残したまま新versionを作成してください。
          </div>
        </div>
      )}

      <h2 className="section">行動</h2>
      {actions.map((a) => {
        const events = db.actionEvents.filter((e) => e.actionId === a.id).sort((x, y) => x.occurredAt.localeCompare(y.occurredAt));
        const opt = db.options.find((o) => o.id === a.optionId);
        const overdue = a.status !== "COMPLETED" && isOverdue(a.dueAt);
        return (
          <div key={a.id} className={`card ${overdue ? "alert" : ""}`}>
            <div className="card-row">
              <span className="badge soft">{ROLE_LABEL[a.actionRole]}</span>
              <span className="card-title" style={{ fontSize: 14.5 }}>{a.text}</span>
              <span className={`badge ${a.status === "COMPLETED" ? "inverse" : a.status === "BLOCKED" ? "accent" : ""}`}>
                {a.status === "PENDING" ? "未着手" : a.status === "STARTED" ? "実行中" : a.status === "COMPLETED" ? "完了" : a.status === "BLOCKED" ? "詰まり" : "中止"}
              </span>
            </div>
            <div className="card-meta" style={{ marginTop: 4 }}>
              期限 {fmtDate(a.dueAt)}{overdue && " ・ 期限超過"}
              {opt && <> ・ 向かう案: {opt.label}</>}
              {a.completionEvidence && <> ・ 完了証拠: {a.completionEvidence}</>}
            </div>
            {a.status !== "COMPLETED" && a.status !== "CANCELLED" && (
              <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
                {a.status === "PENDING" && (
                  <button className="btn small" onClick={() => store.actionEvent(a.id, "STARTED", "")}>開始した</button>
                )}
                <button
                  className="btn small accent"
                  onClick={() => {
                    const ev = window.prompt("完了の証拠(送ったメール、実施した打合せ等、外部に残る痕跡)");
                    if (ev !== null) store.actionEvent(a.id, "COMPLETED", "", ev);
                  }}
                >
                  完了した
                </button>
                <button className="btn small ghost" onClick={() => {
                  const note = window.prompt("何に詰まっていますか?");
                  if (note !== null) store.actionEvent(a.id, "BLOCKED", note);
                }}>詰まっている</button>
              </div>
            )}
            {events.length > 0 && (
              <div className="card-meta" style={{ marginTop: 8 }}>
                {events.map((e) => (
                  <div key={e.id}>{fmtDateTime(e.occurredAt)} — {e.eventType}{e.note && `: ${e.note}`}</div>
                ))}
              </div>
            )}
          </div>
        );
      })}

      {committed && decision.status !== "CLOSED" && (
        <>
          <h2 className="section">行動を追加</h2>
          <div className="card">
            <div className="field">
              <label>行動<span className="req">*</span></label>
              <input type="text" value={text} onChange={(e) => setText(e.target.value)} placeholder="外部に痕跡が残る行動" />
            </div>
            <div className="form-grid">
              <div className="field">
                <label>種類</label>
                <select value={role} onChange={(e) => setRole(e.target.value as ActionRole)}>
                  <option value="ADVANCE">前進</option>
                  <option value="MITIGATE">リスク低減</option>
                  <option value="EXIT_PREP">撤退準備</option>
                </select>
              </div>
              <div className="field">
                <label>期限</label>
                <input type="date" value={dueAt} onChange={(e) => setDueAt(e.target.value)} />
              </div>
            </div>
            <div className="field">
              <label>この行動はどの案に向かうものですか?</label>
              <select value={optionId} onChange={(e) => setOptionId(e.target.value)}>
                {options.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.label}{o.id === version.selectedOptionId ? "(選択した案)" : ""}
                  </option>
                ))}
              </select>
              <div className="hint">選択した案と違う案への行動が2件以上続くと、Decision Driftとして通知されます。</div>
            </div>
            <button
              className="btn small"
              disabled={!text.trim()}
              onClick={() => {
                store.addAction(decision.id, text.trim(), role, new Date(dueAt).toISOString(), optionId || null);
                setText("");
              }}
            >
              追加
            </button>
          </div>
        </>
      )}
    </>
  );
}
