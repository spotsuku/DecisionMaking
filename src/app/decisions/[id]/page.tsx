"use client";

// 決断ハブ(ハブ&スポーク): 次の一歩を最上位に、各記録へは行リストから掘る。

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useDecision } from "@/lib/useDecision";
import { useDB, fmtDate, isOverdue } from "@/lib/useDB";
import { store } from "@/lib/store";
import { detectDrift } from "@/lib/drift";
import { readinessDisplay, READINESS_DISPLAY_LABEL } from "@/lib/stateMachine";
import { STATE_LABEL, DOMAIN_LABEL } from "@/lib/types";
import { IconBack, IconChevron, IconWarn } from "@/components/icons";

export default function DecisionHubPage() {
  const router = useRouter();
  const { db, decision, version } = useDecision();

  if (!decision || !version) {
    return (
      <>
        <div className="appbar">
          <button className="back" onClick={() => router.push("/")} aria-label="戻る"><IconBack /></button>
          <span className="title">見つかりません</span>
        </div>
        <p className="card-meta">この決断はこの端末に存在しません。</p>
      </>
    );
  }

  const committed = !!version.committedAt;
  const drift = detectDrift(db, decision.id);
  const disp = readinessDisplay(db, decision.id);
  const cta = READINESS_DISPLAY_LABEL[disp];
  const stageIndex = ["FRAME", "GATHER", "DECIDABLE", "ACT"].indexOf(disp);

  const pendingActions = db.actions
    .filter((a) => a.decisionId === decision.id && a.status !== "COMPLETED" && a.status !== "CANCELLED")
    .sort((a, b) => a.dueAt.localeCompare(b.dueAt));
  const nextAction = pendingActions[0];

  // 段階ラベルだけでは何をすればよいか分からないので、次の一歩を具体的に示す。
  // 材料がそろう前に確定へ誘導すると、Commit gateで弾かれる行き止まりになる。
  const nextStep = (() => {
    const base = `/decisions/${decision.id}`;
    if (disp === "FRAME") return { label: "問いと期限を決める", href: `${base}/diagnose` };
    if (disp === "DECIDABLE") return { label: "決断を確定する", href: `${base}/commit` };
    const readiness = db.readiness
      .filter((r) => r.versionId === version.id)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      .at(-1);
    if (!readiness) return { label: "診断を始める", href: `${base}/diagnose` };
    if (readiness.verdict !== "THINK" && readiness.verdict !== "BET") {
      return { label: "次に確かめる", href: `${base}/materials` };
    }
    return { label: "選択肢を整理する", href: `${base}/materials` };
  })();

  const menu: { label: string; href: string; show: boolean }[] = [
    { label: "診断の記録", href: `/decisions/${decision.id}/diagnose`, show: true },
    { label: "材料(基準・選択肢・証拠)", href: `/decisions/${decision.id}/materials`, show: true },
    { label: "決断の確定", href: `/decisions/${decision.id}/commit`, show: !committed },
    { label: "Decision Card", href: `/decisions/${decision.id}/card`, show: committed },
    { label: "実行の記録", href: `/decisions/${decision.id}/actions`, show: committed },
    {
      label: decision.reviewAt ? `レビュー(${fmtDate(decision.reviewAt)} 予定)` : "レビュー",
      href: `/decisions/${decision.id}/review`,
      show: committed,
    },
    { label: `履歴 — v${decision.currentVersionNo}`, href: `/decisions/${decision.id}/history`, show: true },
  ];

  return (
    <>
      <div className="appbar">
        <button className="back" onClick={() => router.push("/")} aria-label="戻る"><IconBack /></button>
        <span className="title" style={{ fontSize: 16 }}>{decision.title}</span>
      </div>

      <div className="chips">
        <span className="badge inverse">{STATE_LABEL[decision.status]}</span>
        <span className="badge soft">{DOMAIN_LABEL[decision.domain]}</span>
        <span className="badge soft">v{decision.currentVersionNo}</span>
        {decision.dueAt && (
          <span className="card-meta">
            期限 {fmtDate(decision.dueAt)}
            {isOverdue(decision.dueAt) && !committed && " (超過)"}
          </span>
        )}
      </div>
      <p style={{ fontSize: 15, fontWeight: 600, margin: "10px 0 4px" }}>{version.question}</p>
      <div style={{ display: "flex", gap: 12, alignItems: "center", margin: "8px 0 4px" }}>
        <div className="meter">
          {[0, 1, 2, 3].map((i) => (
            <span key={i} className={`seg ${i <= stageIndex ? (i === stageIndex ? "on accent" : "on") : ""}`} />
          ))}
        </div>
        <span style={{ fontSize: 12.5, fontWeight: 700 }}>{cta.label}</span>
      </div>

      {drift.drifting && (
        <div className="callout">
          <IconWarn />
          <strong>Drift</strong> — {drift.message}
          <div style={{ marginTop: 10 }}>
            <Link href={`/decisions/${decision.id}/review`}>
              <span className="chip-btn">変更を検討する</span>
            </Link>
          </div>
        </div>
      )}

      {nextAction ? (
        <div className="card strong" style={{ marginTop: 12 }}>
          <div className="card-meta" style={{ fontWeight: 700 }}>
            次の一歩(期限 {fmtDate(nextAction.dueAt)})
          </div>
          <div style={{ fontSize: 15, fontWeight: 700, margin: "4px 0 10px" }}>{nextAction.text}</div>
          <div className="row2">
            <button
              className="btn primary half"
              style={{ minHeight: 44 }}
              onClick={() => {
                const ev = window.prompt("完了の証拠(外部に残る痕跡)");
                if (ev !== null) store.actionEvent(nextAction.id, "COMPLETED", "", ev);
              }}
            >
              完了した
            </button>
            <button
              className="btn half"
              style={{ minHeight: 44 }}
              onClick={() => {
                const note = window.prompt("何に詰まっていますか?");
                if (note !== null) store.actionEvent(nextAction.id, "BLOCKED", note);
              }}
            >
              詰まっている
            </button>
          </div>
        </div>
      ) : (
        decision.status !== "CLOSED" && (
          <Link href={nextStep.href}>
            <button className="btn primary" style={{ marginTop: 12 }}>{nextStep.label}</button>
          </Link>
        )
      )}

      <div style={{ marginTop: 14 }}>
        {menu.filter((m) => m.show).map((m) => (
          <Link key={m.href} href={m.href}>
            <span className="menu-row">
              {m.label}
              <span className="chev"><IconChevron /></span>
            </span>
          </Link>
        ))}
      </div>

      {decision.status !== "CLOSED" && decision.status !== "REVISED" && (
        <button
          className="btn ghost"
          style={{ marginTop: 16 }}
          onClick={() => {
            const reason = window.prompt("完了・意図的撤退の理由(履歴に残ります)");
            if (reason !== null) {
              try {
                store.closeDecision(decision.id, reason);
              } catch (e) {
                window.alert(e instanceof Error ? e.message : String(e));
              }
            }
          }}
        >
          完了・意図的撤退にする
        </button>
      )}
    </>
  );
}
