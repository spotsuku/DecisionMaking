"use client";

import { useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useDB, fmtDate } from "@/lib/useDB";
import { STATE_LABEL, DOMAIN_LABEL } from "@/lib/types";
import { readinessDisplay, READINESS_DISPLAY_LABEL } from "@/lib/stateMachine";
import { detectDrift } from "@/lib/drift";
import { DiagnosticChat } from "@/components/DiagnosticChat";
import { Workspace } from "@/components/Workspace";
import { CommitPanel } from "@/components/CommitPanel";
import { DecisionCardView } from "@/components/DecisionCardView";
import { ActionPanel } from "@/components/ActionPanel";
import { ReviewPanel } from "@/components/ReviewPanel";
import { HistoryPanel } from "@/components/HistoryPanel";
import { FramePanel } from "@/components/FramePanel";

type Tab = "diagnose" | "workspace" | "commit" | "card" | "action" | "review" | "history";

const TAB_LABEL: Record<Tab, string> = {
  diagnose: "診断",
  workspace: "材料",
  commit: "確定",
  card: "カード",
  action: "実行",
  review: "レビュー",
  history: "履歴",
};

export default function DecisionPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const db = useDB();
  const decision = db.decisions.find((d) => d.id === params.id);
  const version = useMemo(
    () =>
      db.versions
        .filter((v) => v.decisionId === params.id)
        .sort((a, b) => b.versionNo - a.versionNo)[0],
    [db, params.id]
  );

  const committed = !!version?.committedAt;
  const defaultTab: Tab = !decision
    ? "diagnose"
    : decision.status === "REVIEW" || db.outcomes.some((o) => o.versionId === version?.id)
    ? "review"
    : committed
    ? "action"
    : decision.status === "READY"
    ? "commit"
    : "diagnose";
  const [tab, setTab] = useState<Tab>(defaultTab);

  if (!decision || !version) {
    return (
      <>
        <h1 className="page-title">見つかりません</h1>
        <p className="page-sub">この決断はこの端末に存在しません。</p>
        <Link href="/" className="btn">ホームへ</Link>
      </>
    );
  }

  const disp = readinessDisplay(db, decision.id);
  const cta = READINESS_DISPLAY_LABEL[disp];
  const drift = detectDrift(db, decision.id);
  const stageIndex = ["FRAME", "GATHER", "DECIDABLE", "ACT"].indexOf(disp);

  return (
    <>
      <div style={{ marginTop: 32 }}>
        <div className="card-row">
          <h1 className="page-title" style={{ margin: 0 }}>{decision.title}</h1>
        </div>
        <div className="card-row" style={{ marginTop: 10 }}>
          <span className="badge inverse">{STATE_LABEL[decision.status]}</span>
          <span className="badge soft">{DOMAIN_LABEL[decision.domain]}</span>
          <span className="badge">v{decision.currentVersionNo}</span>
          <span className="card-meta">期限 {fmtDate(decision.dueAt)}</span>
          {decision.reviewAt && <span className="card-meta">レビュー {fmtDate(decision.reviewAt)}</span>}
        </div>
        <p style={{ fontSize: 16, marginTop: 12, fontWeight: 600 }}>{version.question || "(問い未設定)"}</p>

        <div className="card-row" style={{ gap: 16 }}>
          <div className="meter" title="準備度(4段階)">
            {[0, 1, 2, 3].map((i) => (
              <span key={i} className={`seg ${i <= stageIndex ? (i === stageIndex ? "on accent" : "on") : ""}`} />
            ))}
          </div>
          <span style={{ fontSize: 13, fontWeight: 700 }}>{cta.label}</span>
          <span className="card-meta">→ {cta.cta}</span>
        </div>
      </div>

      {drift.drifting && (
        <div className="callout" style={{ marginTop: 16 }}>
          <strong>Decision Drift</strong> — {drift.message}
        </div>
      )}

      <div className="tabs">
        {(Object.keys(TAB_LABEL) as Tab[]).map((t) => (
          <button key={t} className={tab === t ? "active" : ""} onClick={() => setTab(t)}>
            {TAB_LABEL[t]}
          </button>
        ))}
      </div>

      {tab === "diagnose" && (
        <>
          <FramePanel decision={decision} version={version} />
          <DiagnosticChat decision={decision} version={version} />
        </>
      )}
      {tab === "workspace" && <Workspace decision={decision} version={version} />}
      {tab === "commit" && <CommitPanel decision={decision} version={version} onCommitted={() => setTab("card")} />}
      {tab === "card" && <DecisionCardView decision={decision} version={version} />}
      {tab === "action" && <ActionPanel decision={decision} version={version} />}
      {tab === "review" && <ReviewPanel decision={decision} version={version} onRevised={() => { setTab("diagnose"); router.refresh(); }} />}
      {tab === "history" && <HistoryPanel decision={decision} />}
    </>
  );
}
