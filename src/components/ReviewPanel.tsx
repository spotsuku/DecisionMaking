"use client";

// レビュー(S9)と変更(S10): 凍結予測と実績を同じ物差しで比較し、
// 判断・実行・環境のズレを分離する。変更は説明責任つきで新versionを作る。

import { useState } from "react";
import { useDB, fmtDate } from "@/lib/useDB";
import { store } from "@/lib/store";
import { detectSelectiveAttribution } from "@/lib/drift";
import type { Attribution, Decision, DecisionVersion, OutcomeClass } from "@/lib/types";

export function ReviewPanel({
  decision,
  version,
  onRevised,
}: {
  decision: Decision;
  version: DecisionVersion;
  onRevised: () => void;
}) {
  const db = useDB();
  const committedVersion = db.versions
    .filter((v) => v.decisionId === decision.id && v.committedAt)
    .sort((a, b) => b.versionNo - a.versionNo)[0];

  const frozen = committedVersion
    ? db.forecasts.filter((f) => f.versionId === committedVersion.id && f.frozenAt)
    : [];
  const outcomes = committedVersion
    ? db.outcomes.filter((o) => o.versionId === committedVersion.id)
    : [];
  const latestOutcome = outcomes.at(-1);
  const reflection = latestOutcome ? db.reflections.find((r) => r.outcomeId === latestOutcome.id) : undefined;
  const attribution = detectSelectiveAttribution(db);

  // 結果フォーム
  const [summary, setSummary] = useState("");
  const [outcomeClass, setOutcomeClass] = useState<OutcomeClass>("MIXED");
  const [attributionValue, setAttributionValue] = useState<Attribution>("MIXED");
  const [externalFactors, setExternalFactors] = useState("");

  // 振り返りフォーム
  const [gap, setGap] = useState("");
  const [decisionError, setDecisionError] = useState("");
  const [executionError, setExecutionError] = useState("");
  const [environmentChange, setEnvironmentChange] = useState("");
  const [learning, setLearning] = useState("");

  // 変更フォーム
  const [revising, setRevising] = useState(false);
  const [trigger, setTrigger] = useState("");
  const [newEvidence, setNewEvidence] = useState("");
  const [changedAssumption, setChangedAssumption] = useState("");
  const [acknowledged, setAcknowledged] = useState(false);
  const [newQuestion, setNewQuestion] = useState("");
  const [reviseErrors, setReviseErrors] = useState<string[]>([]);

  if (!committedVersion) {
    return (
      <div className="callout neutral">
        レビューは決断の確定後に行います。まず「確定」タブで選択・両面予測・行動を確定してください。
      </div>
    );
  }

  const pos = frozen.find((f) => f.forecastType === "POSITIVE");
  const neg = frozen.find((f) => f.forecastType === "NEGATIVE");
  const base = frozen.find((f) => f.forecastType === "BASELINE");

  return (
    <>
      <h2 className="section">凍結された予測(確定時のまま)</h2>
      <div className="table-wrap">
        <table className="data">
          <thead>
            <tr><th>種類</th><th>予測</th><th>確率</th><th>期限</th></tr>
          </thead>
          <tbody>
            {pos && <tr><td><span className="badge inverse">POSITIVE</span></td><td>{pos.outcomeStatement}</td><td>{pos.probability != null ? `${Math.round(pos.probability * 100)}%` : "—"}</td><td>{fmtDate(pos.horizonAt)}</td></tr>}
            {neg && <tr><td><span className="badge accent">NEGATIVE</span></td><td>{neg.outcomeStatement}{neg.lossLimit && <div className="card-meta">損失上限: {neg.lossLimit}</div>}</td><td>{neg.probability != null ? `${Math.round(neg.probability * 100)}%` : "—"}</td><td>{fmtDate(neg.horizonAt)}</td></tr>}
            {base && <tr><td><span className="badge soft">BASELINE</span></td><td>{base.outcomeStatement}</td><td>—</td><td>—</td></tr>}
          </tbody>
        </table>
      </div>

      {attribution.detected && (
        <div className="callout" style={{ marginTop: 16 }}>
          {attribution.message}
        </div>
      )}

      <h2 className="section">結果の記録</h2>
      {outcomes.map((o) => (
        <div key={o.id} className="card flat">
          <div className="card-row">
            <span className={`badge ${o.outcomeClass === "BAD" ? "accent" : o.outcomeClass === "GOOD" ? "inverse" : "soft"}`}>
              {o.outcomeClass === "GOOD" ? "良い" : o.outcomeClass === "BAD" ? "悪い" : o.outcomeClass === "MIXED" ? "混在" : "不明"}
            </span>
            <span className="card-meta">{fmtDate(o.observedAt)} 観測</span>
            <span className="card-meta">帰属: {o.attribution === "SELF" ? "自分の判断" : o.attribution === "EXTERNAL" ? "外部要因" : "両方"}</span>
          </div>
          <div style={{ fontSize: 14, marginTop: 6 }}>{o.resultSummary}</div>
          {o.externalFactors && <div className="card-meta">外部要因: {o.externalFactors}</div>}
        </div>
      ))}

      {!latestOutcome && decision.status !== "CLOSED" && (
        <div className="card strong">
          <p style={{ marginTop: 0, fontSize: 13.5, color: "var(--ink-soft)" }}>
            良い・悪いにかかわらず、実際に起きたことを記録します。導線は結果の良否で変わりません。
          </p>
          <div className="field">
            <label>実際に起きたこと<span className="req">*</span></label>
            <textarea value={summary} onChange={(e) => setSummary(e.target.value)} />
          </div>
          <div className="form-grid">
            <div className="field">
              <label>結果の分類</label>
              <select value={outcomeClass} onChange={(e) => setOutcomeClass(e.target.value as OutcomeClass)}>
                <option value="GOOD">良い</option>
                <option value="MIXED">混在</option>
                <option value="BAD">悪い</option>
                <option value="UNKNOWN">まだ分からない</option>
              </select>
            </div>
            <div className="field">
              <label>主な要因はどちらでしたか</label>
              <select value={attributionValue} onChange={(e) => setAttributionValue(e.target.value as Attribution)}>
                <option value="SELF">自分の判断・実行</option>
                <option value="EXTERNAL">外部環境</option>
                <option value="MIXED">両方</option>
              </select>
            </div>
          </div>
          <div className="field">
            <label>外部要因(あれば)</label>
            <input type="text" value={externalFactors} onChange={(e) => setExternalFactors(e.target.value)} />
          </div>
          <button
            className="btn accent"
            disabled={!summary.trim()}
            onClick={() => {
              store.recordOutcome(decision.id, {
                resultSummary: summary.trim(),
                outcomeClass,
                attribution: attributionValue,
                externalFactors,
              });
              setSummary("");
            }}
          >
            結果を記録する
          </button>
        </div>
      )}

      {latestOutcome && !reflection && (
        <>
          <h2 className="section">ズレの分解(振り返り)</h2>
          <div className="card strong">
            <p style={{ marginTop: 0, fontSize: 13.5, color: "var(--ink-soft)" }}>
              予測とのズレを、判断・実行・環境の3つに分けます。不確実性の下では、良いプロセスでも悪い結果は起こります。
            </p>
            <div className="field">
              <label>予測と実績のズレ</label>
              <textarea value={gap} onChange={(e) => setGap(e.target.value)} placeholder="どの予測が、どれだけ外れたか / 当たったか" />
            </div>
            <div className="field">
              <label>判断のズレ(decision error) — 決断時に分かり得たのに見落としたもの</label>
              <input type="text" value={decisionError} onChange={(e) => setDecisionError(e.target.value)} />
            </div>
            <div className="field">
              <label>実行のズレ(execution error) — 決めた行動をやり切れなかった部分</label>
              <input type="text" value={executionError} onChange={(e) => setExecutionError(e.target.value)} />
            </div>
            <div className="field">
              <label>環境の変化(environment change) — 決断時に誰にも分からなかったもの</label>
              <input type="text" value={environmentChange} onChange={(e) => setEnvironmentChange(e.target.value)} />
            </div>
            <div className="field">
              <label>学び<span className="req">*</span></label>
              <textarea value={learning} onChange={(e) => setLearning(e.target.value)} placeholder="次の決断で変えること" />
            </div>
            <button
              className="btn primary"
              disabled={!learning.trim()}
              onClick={() => {
                store.recordReflection(latestOutcome.id, {
                  predictionGap: gap,
                  decisionError,
                  executionError,
                  environmentChange,
                  learning: learning.trim(),
                });
              }}
            >
              振り返りを保存
            </button>
          </div>
        </>
      )}

      {reflection && (
        <>
          <h2 className="section">振り返り(記録済み)</h2>
          <div className="card flat">
            <dl className="kv">
              <dt>予測とのズレ</dt><dd>{reflection.predictionGap || "—"}</dd>
              <dt>判断のズレ</dt><dd>{reflection.decisionError || "—"}</dd>
              <dt>実行のズレ</dt><dd>{reflection.executionError || "—"}</dd>
              <dt>環境の変化</dt><dd>{reflection.environmentChange || "—"}</dd>
              <dt>学び</dt><dd style={{ fontWeight: 700 }}>{reflection.learning}</dd>
            </dl>
          </div>
        </>
      )}

      {decision.status !== "CLOSED" && decision.status !== "REVISED" && (
        <>
          <h2 className="section">この先どうしますか</h2>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button className="btn" onClick={() => setRevising(true)}>方針を変更する(新version)</button>
            <button
              className="btn ghost"
              onClick={() => {
                const reason = window.prompt("完了・撤退の理由(履歴に残ります)");
                if (reason !== null) store.closeDecision(decision.id, reason);
              }}
            >
              完了・意図的撤退にする
            </button>
          </div>
          <p className="card-meta" style={{ marginTop: 8 }}>
            変更は罰ではありません。ただし、旧決断の受容と説明を必須とします(変更プロトコル 5.2)。
          </p>
        </>
      )}

      {revising && (
        <div className="card alert" style={{ marginTop: 16 }}>
          <h2 className="section" style={{ marginTop: 0 }}>変更プロトコル</h2>
          <div className="callout neutral" style={{ fontSize: 13 }}>
            旧決断(v{committedVersion.versionNo})は削除されません。変更理由が接続された新しいversionを作ります。
          </div>
          <div className="field">
            <label>変更のきっかけ(trigger)<span className="req">*</span></label>
            <input type="text" value={trigger} onChange={(e) => setTrigger(e.target.value)}
              placeholder="例: 90日レビューで母集団仮説の誤りが判明" />
          </div>
          <div className="field">
            <label>新しく分かった事実、または変わった価値・制約<span className="req">*</span></label>
            <textarea value={newEvidence} onChange={(e) => setNewEvidence(e.target.value)} />
          </div>
          <div className="field">
            <label>変わった前提<span className="req">*</span></label>
            <input type="text" value={changedAssumption} onChange={(e) => setChangedAssumption(e.target.value)} />
          </div>
          <div className="field">
            <label>新しい決断の問い<span className="req">*</span></label>
            <input type="text" value={newQuestion} onChange={(e) => setNewQuestion(e.target.value)}
              placeholder="例: 紹介採用へ集中するか、エージェントを併用するか" />
          </div>
          <label style={{ display: "flex", gap: 10, alignItems: "baseline", fontWeight: 700, fontSize: 14 }}>
            <input type="checkbox" checked={acknowledged} onChange={(e) => setAcknowledged(e.target.checked)} />
            旧決断の予測と実際の結果を確認し、受け入れました。
          </label>
          {reviseErrors.length > 0 && (
            <div className="callout" style={{ marginTop: 10 }}>
              {reviseErrors.map((e, i) => <div key={i}>{e}</div>)}
            </div>
          )}
          <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
            <button
              className="btn accent"
              onClick={() => {
                const result = store.reviseDecision(decision.id, {
                  trigger,
                  newEvidence,
                  changedAssumption,
                  priorResultAcknowledged: acknowledged,
                  newQuestion,
                });
                if (result.ok) {
                  setRevising(false);
                  onRevised();
                } else {
                  setReviseErrors(result.failures);
                }
              }}
            >
              新versionを作成する
            </button>
            <button className="btn ghost" onClick={() => setRevising(false)}>やめる</button>
          </div>
        </div>
      )}
    </>
  );
}
