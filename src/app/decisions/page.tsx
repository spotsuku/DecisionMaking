"use client";

// すべての決断 / 今週決めたこと

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { useDB, fmtDate, daysBetween, isOverdue } from "@/lib/useDB";
import { STATE_LABEL, CLOSE_KIND_LABEL, DOMAIN_LABEL } from "@/lib/types";
import { IconBack, IconChevron } from "@/components/icons";

function DecisionsList() {
  const db = useDB();
  const router = useRouter();
  const params = useSearchParams();
  const weekOnly = params.get("filter") === "week";
  const nowIso = new Date().toISOString();
  const weekAgo = Date.now() - 7 * 86400000;

  let list = db.decisions.filter((d) => !d.hidden);
  if (weekOnly) {
    const decidedIds = new Set(
      db.versions
        .filter((v) => v.committedAt && new Date(v.committedAt).getTime() >= weekAgo)
        .map((v) => v.decisionId)
    );
    list = list.filter((d) => decidedIds.has(d.id));
  }
  const open = list.filter((d) => d.status !== "CLOSED");
  const closed = list.filter((d) => d.status === "CLOSED");

  return (
    <>
      <div className="appbar">
        <button className="back" onClick={() => router.push("/")} aria-label="戻る"><IconBack /></button>
        <span className="title">{weekOnly ? "今週決めたこと" : "すべての決断"}</span>
      </div>

      {list.length === 0 && (
        <div className="empty">{weekOnly ? "今週確定した決断はまだありません。" : "まだ決断がありません。"}</div>
      )}

      {open
        .sort((a, b) => (a.dueAt ?? "9999").localeCompare(b.dueAt ?? "9999"))
        .map((d) => (
          <Link key={d.id} href={`/decisions/${d.id}`}>
            <div className="card obs">
              <div className="body">
                <div className="name">{d.title}</div>
                <div className="chips" style={{ marginTop: 5 }}>
                  <span className={`badge ${d.status === "COMMITTED" || d.status === "IN_ACTION" ? "inverse" : ""}`}>
                    {d.status === "CLOSED" && d.closeKind ? CLOSE_KIND_LABEL[d.closeKind] : STATE_LABEL[d.status]}
                  </span>
                  <span className="badge soft">{DOMAIN_LABEL[d.domain]}</span>
                  {isOverdue(d.dueAt) && d.status !== "COMMITTED" && d.status !== "IN_ACTION" && (
                    <span className="badge accent">期限超過</span>
                  )}
                  <span className="card-meta">
                    {d.dueAt ? `期限 ${fmtDate(d.dueAt)}` : `${daysBetween(d.createdAt, nowIso)}日考え中`} ・ v{d.currentVersionNo}
                  </span>
                </div>
              </div>
              <span className="chev"><IconChevron /></span>
            </div>
          </Link>
        ))}

      {closed.length > 0 && (
        <>
          <div className="section">完了・撤退</div>
          {closed.map((d) => (
            <Link key={d.id} href={`/decisions/${d.id}`}>
              <div className="card obs" style={{ opacity: 0.7 }}>
                <div className="body">
                  <div className="name">{d.title}</div>
                  <div className="fact">完了 {fmtDate(d.closedAt)} ・ v{d.currentVersionNo}</div>
                </div>
                <span className="chev"><IconChevron /></span>
              </div>
            </Link>
          ))}
        </>
      )}
    </>
  );
}

export default function DecisionsPage() {
  return (
    <Suspense>
      <DecisionsList />
    </Suspense>
  );
}
