"use client";

// Decision Workspace(8章): 判断基準(S4)と証拠(S6)。
// 事実/仮説/意見を分離し、情報収集の逃避を検知する。
//
// 選択肢(S5)と比較はここから外した ── /decisions/[id]/options に移した。
// 同じものを2画面で足せると、どちらが本物か分からなくなる。

import { useState } from "react";
import { useDB } from "@/lib/useDB";
import { store } from "@/lib/store";
import { useRouter } from "next/navigation";
import { detectGatheringEscape } from "@/lib/diagnosis";
import { buildProposals, type Proposal } from "@/lib/proposals";
import type { Decision, DecisionVersion, EvidenceItem } from "@/lib/types";
import { displayLabel } from "@/lib/options";

export function Workspace({ decision, version }: { decision: Decision; version: DecisionVersion }) {
  const db = useDB();
  const router = useRouter();
  const locked = !!version.committedAt;
  const criteria = db.criteria.filter((c) => c.versionId === version.id);
  const options = db.options.filter((o) => o.versionId === version.id);
  const evidence = db.evidence.filter((e) => e.versionId === version.id);

  const gatherWarn = detectGatheringEscape(db, version.id);

  // 判断基準フォーム
  const [cLabel, setCLabel] = useState("");
  const [cDef, setCDef] = useState("");
  const [cWeight, setCWeight] = useState(3);
  const [cMin, setCMin] = useState("");
  const [err, setErr] = useState<string | null>(null);

  // 証拠フォーム
  const [eType, setEType] = useState<EvidenceItem["type"]>("FACT");
  const [eStatement, setEStatement] = useState("");
  const [eReliability, setEReliability] = useState<EvidenceItem["reliability"]>("MEDIUM");

  // 診断で本人が話した内容から、材料の下書きを出す。空欄の前で止まらないように
  const proposals = locked ? [] : buildProposals(db, version);
  const acceptProposal = (p: Proposal) =>
    guard(() => {
      if (p.kind === "CRITERION") store.addCriterion(version.id, p.label, "", 3, "");
      else store.addEvidence(version.id, p.evidenceType ?? "HYPOTHESIS", p.label, "MEDIUM", null);
    });

  const Proposals = ({ kind }: { kind: Proposal["kind"] }) => {
    const items = proposals.filter((p) => p.kind === kind);
    if (items.length === 0) return null;
    return (
      <div className="proposals">
        <div className="ph">診断で話したことから ── 押すと追加できます</div>
        {items.map((p) => (
          <button key={p.label} className="prop" onClick={() => acceptProposal(p)}>
            <span className="pt">{p.label}</span>
            <span className="ps">{p.source}</span>
            <span className="pa">＋</span>
          </button>
        ))}
      </div>
    );
  };

  const guard = (fn: () => void) => {
    setErr(null);
    try {
      fn();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <>
      {locked && (
        <div className="callout neutral">このversionは確定済みです。材料は閲覧のみできます。</div>
      )}
      {gatherWarn && <div className="callout">{gatherWarn}</div>}
      {err && <div className="callout">{err}</div>}

      <h2 className="section">判断基準(3〜5個)</h2>
      <p className="card-meta" style={{ marginTop: -6, lineHeight: 1.8 }}>
        どの案を選ぶかを比べるための、ものさしです。「何を守りたいか」「何なら諦められるか」を
        一言にしたものが、そのままものさしになります。3つあれば十分です。
      </p>
      <Proposals kind="CRITERION" />
      {criteria.map((c) => (
        <div key={c.id} className="card flat">
          <div className="card-row">
            <span className="card-title" style={{ fontSize: 14.5 }}>{c.label}</span>
            <span className="badge soft">重み {c.weight}</span>
            {!locked && (
              <button className="btn ghost small" style={{ marginLeft: "auto" }}
                onClick={() => guard(() => store.removeCriterion(c.id))}>削除</button>
            )}
          </div>
          {c.definition && <div className="card-meta">{c.definition}</div>}
          {c.minimumThreshold && <div className="card-meta">最低条件: {c.minimumThreshold}</div>}
        </div>
      ))}
      {!locked && (
        <div className="card">
          <div className="form-grid">
            <div className="field">
              <label>基準名<span className="req">*</span></label>
              <input type="text" value={cLabel} onChange={(e) => setCLabel(e.target.value)} placeholder="例: 家族との時間" />
            </div>
            <div className="field">
              <label>重み(1-5)</label>
              <input type="number" min={1} max={5} value={cWeight} onChange={(e) => setCWeight(Number(e.target.value))} />
            </div>
          </div>
          <div className="form-grid">
            <div className="field">
              <label>定義</label>
              <input type="text" value={cDef} onChange={(e) => setCDef(e.target.value)} placeholder="どう見るか" />
            </div>
            <div className="field">
              <label>最低条件</label>
              <input type="text" value={cMin} onChange={(e) => setCMin(e.target.value)} placeholder="ここを割ったら選ばない" />
            </div>
          </div>
          <button className="btn small" disabled={!cLabel.trim()}
            onClick={() => guard(() => { store.addCriterion(version.id, cLabel.trim(), cDef, cWeight, cMin); setCLabel(""); setCDef(""); setCMin(""); })}>
            基準を追加
          </button>
        </div>
      )}

      <h2 className="section">選択肢</h2>
      <p className="card-meta" style={{ marginTop: -6, lineHeight: 1.8 }}>
        案を出す・削る・選ぶは、専用の画面で行います。ここでは今ある案だけを表示します。
      </p>
      {options.length === 0 ? (
        <div className="empty">まだ案がありません。</div>
      ) : (
        options.map((o) => (
          <div key={o.id} className="card flat" style={{ opacity: o.active ? 1 : 0.55 }}>
            <div className="card-row">
              <span className="card-title" style={{ fontSize: 14.5 }}>{displayLabel(o.label)}</span>
              {!o.active && <span className="badge soft">除外</span>}
              {version.selectedOptionId === o.id && <span className="badge accent">選択</span>}
            </div>
            {o.description && <div className="card-meta">{o.description}</div>}
            {o.rejectedReason && (
              <div className="card-meta" style={{ color: "var(--accent-dark)" }}>外した理由: {o.rejectedReason}</div>
            )}
          </div>
        ))
      )}
      <button className="btn outline" onClick={() => router.push(`/decisions/${decision.id}/options`)}>
        選択肢の画面へ
      </button>

      <h2 className="section">証拠(事実・仮説・意見を分ける)</h2>
      <p className="card-meta" style={{ marginTop: -6, lineHeight: 1.8 }}>
        判断のもとにしている材料を、確かめた事実・まだ確かめていない仮説・誰かの意見に分けて置きます。
        分けておくと、あとで結果を振り返るときに「何を勘違いしていたか」が分かります。
      </p>
      <Proposals kind="EVIDENCE" />
      {evidence.map((e) => (
        <div key={e.id} className="card flat">
          <div className="card-row">
            <span className={`badge ${e.type === "FACT" ? "inverse" : e.type === "HYPOTHESIS" ? "" : "soft"}`}>
              {e.type === "FACT" ? "事実" : e.type === "HYPOTHESIS" ? "仮説" : "意見"}
            </span>
            <span className="badge soft">信頼度 {e.reliability}</span>
          </div>
          <div style={{ fontSize: 14, marginTop: 6 }}>{e.statement}</div>
        </div>
      ))}
      {!locked && (
        <div className="card">
          <div className="form-grid">
            <div className="field">
              <label>種類</label>
              <select value={eType} onChange={(e) => setEType(e.target.value as EvidenceItem["type"])}>
                <option value="FACT">事実(確認済み)</option>
                <option value="HYPOTHESIS">仮説(未確認)</option>
                <option value="OPINION">意見(誰かの見解)</option>
              </select>
            </div>
            <div className="field">
              <label>信頼度</label>
              <select value={eReliability} onChange={(e) => setEReliability(e.target.value as EvidenceItem["reliability"])}>
                <option value="HIGH">高</option>
                <option value="MEDIUM">中</option>
                <option value="LOW">低</option>
              </select>
            </div>
          </div>
          <div className="field">
            <label>内容<span className="req">*</span></label>
            <input type="text" value={eStatement} onChange={(e) => setEStatement(e.target.value)}
              placeholder="例: 月の費用は3万円と分かった" />
          </div>
          <button className="btn small" disabled={!eStatement.trim()}
            onClick={() => guard(() => { store.addEvidence(version.id, eType, eStatement.trim(), eReliability, null); setEStatement(""); })}>
            証拠を追加
          </button>
        </div>
      )}
    </>
  );
}
