"use client";

// Decision Workspace(8章): 判断基準(S4)・選択肢(S5)・証拠(S6)。
// 事実/仮説/意見を分離し、基準なしの選択肢拡張・情報収集の逃避を検知する。

import { useState } from "react";
import { useDB } from "@/lib/useDB";
import { store } from "@/lib/store";
import { detectGatheringEscape, detectOptionExpansion } from "@/lib/diagnosis";
import type { Decision, DecisionVersion, EvidenceItem } from "@/lib/types";

export function Workspace({ decision, version }: { decision: Decision; version: DecisionVersion }) {
  const db = useDB();
  const locked = !!version.committedAt;
  const criteria = db.criteria.filter((c) => c.versionId === version.id);
  const options = db.options.filter((o) => o.versionId === version.id);
  const activeOptions = options.filter((o) => o.active);
  const evidence = db.evidence.filter((e) => e.versionId === version.id);
  const scores = db.optionScores;

  const gatherWarn = detectGatheringEscape(db, version.id);
  const expandWarn = detectOptionExpansion(db, version.id);

  // 判断基準フォーム
  const [cLabel, setCLabel] = useState("");
  const [cDef, setCDef] = useState("");
  const [cWeight, setCWeight] = useState(3);
  const [cMin, setCMin] = useState("");
  const [err, setErr] = useState<string | null>(null);

  // 選択肢フォーム
  const [oLabel, setOLabel] = useState("");
  const [oDesc, setODesc] = useState("");
  const [oReason, setOReason] = useState("");

  // 証拠フォーム
  const [eType, setEType] = useState<EvidenceItem["type"]>("FACT");
  const [eStatement, setEStatement] = useState("");
  const [eReliability, setEReliability] = useState<EvidenceItem["reliability"]>("MEDIUM");

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
      {expandWarn && <div className="callout">{expandWarn}</div>}
      {err && <div className="callout">{err}</div>}

      <h2 className="section">判断基準(3〜5個)</h2>
      <p className="card-meta" style={{ marginTop: -6 }}>何を守り、何を諦めるか。比較の物差しを先に決めます。</p>
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
              <input type="text" value={cLabel} onChange={(e) => setCLabel(e.target.value)} placeholder="例: 月間コスト" />
            </div>
            <div className="field">
              <label>重み(1-5)</label>
              <input type="number" min={1} max={5} value={cWeight} onChange={(e) => setCWeight(Number(e.target.value))} />
            </div>
          </div>
          <div className="form-grid">
            <div className="field">
              <label>定義</label>
              <input type="text" value={cDef} onChange={(e) => setCDef(e.target.value)} placeholder="どう測るか" />
            </div>
            <div className="field">
              <label>最低条件</label>
              <input type="text" value={cMin} onChange={(e) => setCMin(e.target.value)} placeholder="これを下回る案は却下" />
            </div>
          </div>
          <button className="btn small" disabled={!cLabel.trim()}
            onClick={() => guard(() => { store.addCriterion(version.id, cLabel.trim(), cDef, cWeight, cMin); setCLabel(""); setCDef(""); setCMin(""); })}>
            基準を追加
          </button>
        </div>
      )}

      <h2 className="section">選択肢(2〜4個)</h2>
      {activeOptions.length >= 5 && (
        <div className="callout">選択肢が5件以上あります。基準で比較し、絞り込みましょう。</div>
      )}
      {options.map((o) => (
        <div key={o.id} className="card flat" style={{ opacity: o.active ? 1 : 0.55 }}>
          <div className="card-row">
            <span className="card-title" style={{ fontSize: 14.5 }}>{o.label}</span>
            {!o.active && <span className="badge soft">除外</span>}
            {version.selectedOptionId === o.id && <span className="badge accent">選択</span>}
            {!locked && o.active && (
              <button className="btn ghost small" style={{ marginLeft: "auto" }}
                onClick={() => {
                  const reason = window.prompt("この案を外す理由(却下理由として履歴に残ります)");
                  if (reason !== null) guard(() => store.deactivateOption(o.id, reason));
                }}>
                除外
              </button>
            )}
          </div>
          {o.description && <div className="card-meta">{o.description}</div>}
          {o.addedReason && <div className="card-meta">追加理由: {o.addedReason}</div>}
          {o.rejectedReason && <div className="card-meta" style={{ color: "var(--accent-dark)" }}>却下理由: {o.rejectedReason}</div>}
        </div>
      ))}
      {!locked && (
        <div className="card">
          <div className="form-grid">
            <div className="field">
              <label>選択肢<span className="req">*</span></label>
              <input type="text" value={oLabel} onChange={(e) => setOLabel(e.target.value)} placeholder="例: 紹介採用へ集中する" />
            </div>
            <div className="field">
              <label>説明</label>
              <input type="text" value={oDesc} onChange={(e) => setODesc(e.target.value)} />
            </div>
          </div>
          {activeOptions.length >= 4 && (
            <div className="field">
              <label>追加理由(新しい事実)<span className="req">*</span></label>
              <input type="text" value={oReason} onChange={(e) => setOReason(e.target.value)}
                placeholder="5件目以降は、比較基準を変える新事実が必要です" />
            </div>
          )}
          <button className="btn small" disabled={!oLabel.trim()}
            onClick={() => guard(() => { store.addOption(version.id, oLabel.trim(), oDesc, oReason); setOLabel(""); setODesc(""); setOReason(""); })}>
            選択肢を追加
          </button>
        </div>
      )}

      {activeOptions.length > 0 && criteria.length > 0 && (
        <>
          <h2 className="section">比較(選択肢 × 基準)</h2>
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>選択肢</th>
                  {criteria.map((c) => (
                    <th key={c.id}>{c.label}<br /><span style={{ fontWeight: 400 }}>重み{c.weight}</span></th>
                  ))}
                  <th>加重計</th>
                </tr>
              </thead>
              <tbody>
                {activeOptions.map((o) => {
                  let total = 0;
                  return (
                    <tr key={o.id}>
                      <td style={{ fontWeight: 600 }}>{o.label}</td>
                      {criteria.map((c) => {
                        const s = scores.find((x) => x.optionId === o.id && x.criterionId === c.id);
                        total += (s?.score ?? 0) * c.weight;
                        return (
                          <td key={c.id}>
                            {locked ? (
                              s?.score ?? "—"
                            ) : (
                              <select
                                value={s?.score ?? ""}
                                onChange={(e) => store.setScore(o.id, c.id, Number(e.target.value), "")}
                                style={{ width: 64 }}
                              >
                                <option value="">—</option>
                                {[1, 2, 3, 4, 5].map((n) => (
                                  <option key={n} value={n}>{n}</option>
                                ))}
                              </select>
                            )}
                          </td>
                        );
                      })}
                      <td style={{ fontWeight: 700 }}>{total || "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="card-meta">スコアは整理のための道具です。合計点が高い案を選ぶ義務はありません。最終選択はあなたが確定します。</p>
        </>
      )}

      <h2 className="section">証拠(事実・仮説・意見を分ける)</h2>
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
              placeholder="例: 昨年の媒体経由応募は月12件(ATS実績)" />
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
