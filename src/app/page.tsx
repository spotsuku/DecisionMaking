"use client";

import Link from "next/link";
import { useDB, fmtDate, daysBetween, isOverdue } from "@/lib/useDB";
import { readinessDisplay, READINESS_DISPLAY_LABEL } from "@/lib/stateMachine";
import { detectDrift } from "@/lib/drift";
import { STATE_LABEL, DOMAIN_LABEL } from "@/lib/types";
import { store } from "@/lib/store";

export default function HomePage() {
  const db = useDB();
  const nowIso = new Date().toISOString();
  const visible = db.decisions.filter((d) => !d.hidden);
  const open = visible.filter((d) => d.status !== "CLOSED" && d.status !== "REVISED");
  const closed = visible.filter((d) => d.status === "CLOSED");

  const reviewDue = open.filter(
    (d) => (d.status === "COMMITTED" || d.status === "IN_ACTION") && d.reviewAt && isOverdue(d.reviewAt)
  );

  return (
    <>
      <h1 className="page-title">未決を、決断に変える。</h1>
      <p className="page-sub">
        AIは正解を代行しません。あなたの決断・行動・振り返りを成立させます。
      </p>

      <div style={{ display: "flex", gap: 10, marginBottom: 8 }}>
        <Link href="/decisions/new" className="btn accent">+ 新しい決断を登録する</Link>
      </div>

      {reviewDue.length > 0 && (
        <div className="callout">
          <strong>レビュー待ちが {reviewDue.length} 件あります。</strong>{" "}
          結果の良し悪しにかかわらず、凍結した予測と実績を同じ物差しで比較しましょう。
        </div>
      )}

      <h2 className="section">進行中の決断</h2>
      {open.length === 0 && (
        <div className="empty">
          まだ決断がありません。「新しい決断」から、いま先送りにしている問いを一つ登録してください。
        </div>
      )}
      {open
        .slice()
        .sort((a, b) => (a.dueAt ?? "9999").localeCompare(b.dueAt ?? "9999"))
        .map((d) => {
          const disp = readinessDisplay(db, d.id);
          const cta = READINESS_DISPLAY_LABEL[disp];
          const drift = detectDrift(db, d.id);
          const pendingDays = daysBetween(d.createdAt, nowIso);
          const overdue = isOverdue(d.dueAt) && d.status !== "COMMITTED" && d.status !== "IN_ACTION";
          return (
            <Link key={d.id} href={`/decisions/${d.id}`}>
              <div className={`card ${drift.drifting ? "alert" : ""}`} style={{ cursor: "pointer" }}>
                <div className="card-row">
                  <span className="card-title">{d.title}</span>
                  <span className={`badge ${d.status === "COMMITTED" || d.status === "IN_ACTION" ? "inverse" : ""}`}>
                    {STATE_LABEL[d.status]}
                  </span>
                  <span className="badge soft">{DOMAIN_LABEL[d.domain]}</span>
                  {overdue && <span className="badge accent">期限超過</span>}
                </div>
                <div className="card-meta" style={{ marginTop: 6 }}>
                  期限 {fmtDate(d.dueAt)} ・ 保留 {pendingDays} 日 ・ v{d.currentVersionNo}
                  {d.reviewAt && <> ・ レビュー {fmtDate(d.reviewAt)}</>}
                </div>
                {drift.drifting && (
                  <div style={{ marginTop: 8, fontSize: 13, color: "var(--accent-dark)", fontWeight: 600 }}>
                    ⚠ 決断と行動がずれています — {drift.message}
                  </div>
                )}
                <div style={{ marginTop: 10 }}>
                  <span className="badge outline-accent">次の一歩: {cta.cta}</span>
                </div>
              </div>
            </Link>
          );
        })}

      {closed.length > 0 && (
        <>
          <h2 className="section">完了・撤退した決断</h2>
          {closed.map((d) => (
            <Link key={d.id} href={`/decisions/${d.id}`}>
              <div className="card flat" style={{ cursor: "pointer", opacity: 0.75 }}>
                <div className="card-row">
                  <span className="card-title">{d.title}</span>
                  <span className="badge soft">{STATE_LABEL[d.status]}</span>
                </div>
                <div className="card-meta">完了 {fmtDate(d.closedAt)} ・ v{d.currentVersionNo}</div>
              </div>
            </Link>
          ))}
        </>
      )}

      <div className="footer-note">
        <p>
          決断履歴は削除・上書きできません(履歴の不変性)。データはこの端末に保存されます。
          <button
            className="btn ghost small"
            style={{ marginLeft: 12 }}
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
        </p>
      </div>
    </>
  );
}
