"use client";

// Decision Card(8章): 選択・両面予測・引受・24h行動・撤退条件の共有可能な要約。

import { useDB, fmtDate } from "@/lib/useDB";
import type { Decision, DecisionVersion } from "@/lib/types";
import { displayLabel } from "@/lib/options";

export function DecisionCardView({ decision, version }: { decision: Decision; version: DecisionVersion }) {
  const db = useDB();
  const committed = !!version.committedAt;

  const selected = db.options.find((o) => o.id === version.selectedOptionId);
  const rejected = db.options.filter((o) => o.versionId === version.id && o.id !== version.selectedOptionId && o.active);
  const forecasts = db.forecasts.filter((f) => f.versionId === version.id && (committed ? f.frozenAt : true));
  const pos = forecasts.find((f) => f.forecastType === "POSITIVE");
  const neg = forecasts.find((f) => f.forecastType === "NEGATIVE");
  const base = forecasts.find((f) => f.forecastType === "BASELINE");
  const commitment = db.commitments.find((c) => c.versionId === version.id);
  const actions = db.actions.filter((a) => a.versionId === version.id);

  if (!committed) {
    return (
      <div className="callout neutral">
        Decision Card は決断を確定すると作成されます(仮カード)。現時点の内容は「確定」タブで編集できます。
      </div>
    );
  }

  return (
    <>
      <div className="dcard">
        <div className="dcard-head">
          <span className="label">DECISION CARD</span>
          <span className="title">{decision.title}</span>
          <span style={{ marginLeft: "auto", fontSize: 12, color: "#d4d4d8" }}>
            v{version.versionNo} ・ {fmtDate(version.committedAt)} 確定
          </span>
        </div>
        <div className="dcard-body">
          <div className="dcard-section">
            <div className="k">問い</div>
            <div className="v">{version.question}</div>
          </div>
          <div className="dcard-section">
            <div className="k">選択</div>
            <div className="v" style={{ fontWeight: 700 }}>{selected ? displayLabel(selected.label) : ""}</div>
            {version.rationale && <div className="sub">{version.rationale}</div>}
            {rejected.length > 0 && (
              <div className="sub">
                選ばなかった案: {rejected.map((o) => `${displayLabel(o.label)}(${o.rejectedReason ?? "—"})`).join(" / ")}
              </div>
            )}
          </div>
          {pos && (
            <div className="dcard-section">
              <div className="k pos">ポジティブ予測</div>
              <div className="v">{pos.outcomeStatement}</div>
              <div className="sub">
                確率 {pos.probability != null ? `${Math.round(pos.probability * 100)}%` : "—"} ・ 期限 {fmtDate(pos.horizonAt)}
                {pos.leadingIndicator && <> ・ 先行指標: {pos.leadingIndicator}</>}
              </div>
            </div>
          )}
          {neg && (
            <div className="dcard-section">
              <div className="k neg">ネガティブ予測</div>
              <div className="v">{neg.outcomeStatement}</div>
              <div className="sub">
                確率 {neg.probability != null ? `${Math.round(neg.probability * 100)}%` : "—"}
                {neg.lossLimit && <> ・ 損失上限: {neg.lossLimit}</>}
                {neg.leadingIndicator && <> ・ 早期警戒: {neg.leadingIndicator}</>}
              </div>
            </div>
          )}
          {base && (
            <div className="dcard-section">
              <div className="k">ベースライン(何も変えない場合)</div>
              <div className="v">{base.outcomeStatement}</div>
            </div>
          )}
          {commitment && (
            <div className="dcard-section">
              <div className="k">引き受けるもの</div>
              <div className="v">{commitment.acceptedTradeoff}</div>
              <div className="sub">
                {commitment.lossLimit && <>損失上限: {commitment.lossLimit} ・ </>}
                {commitment.stopCondition ? <>撤退条件: {commitment.stopCondition} ・ </> : null}
                レビュー {fmtDate(commitment.reviewAt)}
              </div>
            </div>
          )}
          <div className="dcard-section">
            <div className="k">最初の行動</div>
            {actions.map((a) => (
              <div key={a.id} className="v" style={{ fontSize: 14 }}>
                <span className="badge soft" style={{ marginRight: 8 }}>
                  {a.actionRole === "ADVANCE" ? "前進" : a.actionRole === "MITIGATE" ? "リスク低減" : "撤退準備"}
                </span>
                {a.text} <span className="sub" style={{ display: "inline" }}>(期限 {fmtDate(a.dueAt)})</span>
              </div>
            ))}
          </div>
          {version.confidence != null && (
            <div className="dcard-section">
              <div className="k">確定時の自信</div>
              <div className="v">{Math.round(version.confidence * 100)}%(結果観測前に凍結済み)</div>
            </div>
          )}
        </div>
      </div>
      <p className="card-meta">
        このカードの予測は確定時に凍結されています。レビューでは、この凍結値と実績を同じ物差しで比較します。
      </p>
    </>
  );
}
