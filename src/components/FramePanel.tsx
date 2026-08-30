"use client";

// S1 Frame: 問い・主体・期限の編集。COMMITTED後は編集不可(不変履歴)。

import { useState } from "react";
import { store } from "@/lib/store";
import type { Decision, DecisionVersion } from "@/lib/types";

export function FramePanel({ decision, version }: { decision: Decision; version: DecisionVersion }) {
  const locked = !!version.committedAt;
  const [open, setOpen] = useState(!version.question || !version.ownerRole || !decision.dueAt);
  const [question, setQuestion] = useState(version.question);
  const [ownerRole, setOwnerRole] = useState(version.ownerRole);
  const [dueAt, setDueAt] = useState(decision.dueAt ? decision.dueAt.slice(0, 10) : "");

  if (locked) return null;

  if (!open) {
    return (
      <div className="card flat">
        <div className="card-row">
          <span className="card-meta">
            決める人: {version.ownerRole || "未設定"} / 期限: {decision.dueAt ? decision.dueAt.slice(0, 10) : "未設定"}
          </span>
          <button className="btn ghost small" style={{ marginLeft: "auto" }} onClick={() => setOpen(true)}>編集</button>
        </div>
      </div>
    );
  }

  return (
    <div className="card strong">
      <h2 className="section" style={{ marginTop: 0 }}>何を・誰が・いつまでに決めるか</h2>
      <div className="field">
        <label>何を決めますか?<span className="req">*</span></label>
        <textarea value={question} onChange={(e) => setQuestion(e.target.value)} />
        <div className="hint">決めることが分かる一文で。選択肢はこのあと整理します。</div>
      </div>
      <div className="form-grid">
        <div className="field">
          <label>誰が決めますか<span className="req">*</span></label>
          <input type="text" value={ownerRole} onChange={(e) => setOwnerRole(e.target.value)}
            placeholder="例: 自分 / 上司と合議 / 決裁は役員" />
        </div>
        <div className="field">
          <label>いつまでに決めますか<span className="req">*</span></label>
          <input type="date" value={dueAt} onChange={(e) => setDueAt(e.target.value)} />
        </div>
      </div>
      <button
        className="btn primary"
        onClick={() => {
          store.updateFrame(decision.id, {
            question,
            ownerRole,
            dueAt: dueAt ? new Date(dueAt).toISOString() : null,
          });
          setOpen(false);
        }}
      >
        保存
      </button>
    </div>
  );
}
