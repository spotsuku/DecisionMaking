"use client";

// Commit(S7/S8): 選択・両面予測・引受・最小行動・レビュー日を本人が確定する。
// Commit gate(4.6/4.7)をすべて満たすまで COMMITTED にならない。

import { useMemo, useState } from "react";
import { useDB } from "@/lib/useDB";
import { store } from "@/lib/store";
import { evaluateCommitGate } from "@/lib/stateMachine";
import type { Decision, DecisionVersion } from "@/lib/types";

function isoFromLocal(dateStr: string): string {
  return dateStr ? new Date(dateStr).toISOString() : "";
}

function plusDays(days: number): string {
  const d = new Date(Date.now() + days * 86400000);
  return d.toISOString().slice(0, 10);
}

export function CommitPanel({
  decision,
  version,
  onCommitted,
}: {
  decision: Decision;
  version: DecisionVersion;
  onCommitted: () => void;
}) {
  const db = useDB();
  const options = db.options.filter((o) => o.versionId === version.id && o.active);
  const committed = !!version.committedAt;

  const draftPos = db.forecasts.find((f) => f.versionId === version.id && f.forecastType === "POSITIVE" && !f.frozenAt);
  const draftNeg = db.forecasts.find((f) => f.versionId === version.id && f.forecastType === "NEGATIVE" && !f.frozenAt);
  const draftBase = db.forecasts.find((f) => f.versionId === version.id && f.forecastType === "BASELINE" && !f.frozenAt);

  const [selectedOptionId, setSelectedOptionId] = useState<string>(version.selectedOptionId ?? "");
  const [rationale, setRationale] = useState(version.rationale);
  const [confidence, setConfidence] = useState<number>(70);
  const [rejectReasons, setRejectReasons] = useState<Record<string, string>>({});

  const [posStatement, setPosStatement] = useState(draftPos?.outcomeStatement ?? "");
  const [posProb, setPosProb] = useState<number>(draftPos?.probability ? draftPos.probability * 100 : 60);
  const [posHorizon, setPosHorizon] = useState(draftPos?.horizonAt ? draftPos.horizonAt.slice(0, 10) : plusDays(30));
  const [posIndicator, setPosIndicator] = useState(draftPos?.leadingIndicator ?? "");

  const [negStatement, setNegStatement] = useState(draftNeg?.outcomeStatement ?? "");
  const [negProb, setNegProb] = useState<number>(draftNeg?.probability ? draftNeg.probability * 100 : 30);
  const [negLossLimit, setNegLossLimit] = useState(draftNeg?.lossLimit ?? "");
  const [negIndicator, setNegIndicator] = useState(draftNeg?.leadingIndicator ?? "");

  const [baseStatement, setBaseStatement] = useState(draftBase?.outcomeStatement ?? "");

  const [tradeoff, setTradeoff] = useState("");
  const [stopCondition, setStopCondition] = useState("");
  const [reviewAt, setReviewAt] = useState(plusDays(7));

  const [actionText, setActionText] = useState("");
  const [actionDue, setActionDue] = useState(plusDays(1));
  const [mitigateText, setMitigateText] = useState("");

  const [confirmed, setConfirmed] = useState(false);
  const [failures, setFailures] = useState<{ code: string; message: string }[]>([]);

  // ゲートのライブ判定(押す前に何が足りないかを見せる)
  const gatePreview = useMemo(() => {
    return evaluateCommitGate({
      userConfirmed: confirmed,
      selectedOptionId: selectedOptionId || null,
      options: options.map((o) => ({
        id: o.id,
        active: o.active,
        rejectedReason: o.id === selectedOptionId ? null : rejectReasons[o.id] ?? o.rejectedReason,
      })),
      forecasts: [
        { forecastType: "POSITIVE", outcomeStatement: posStatement, horizonAt: isoFromLocal(posHorizon), lossLimit: null, probability: posProb / 100 },
        { forecastType: "NEGATIVE", outcomeStatement: negStatement, horizonAt: isoFromLocal(posHorizon), lossLimit: negLossLimit, probability: negProb / 100 },
      ],
      acceptedTradeoff: tradeoff,
      actions: actionText.trim()
        ? [{ text: actionText, actionRole: "ADVANCE", dueAt: isoFromLocal(actionDue) }]
        : [],
      reviewAt: isoFromLocal(reviewAt) || null,
    });
  }, [confirmed, selectedOptionId, options, rejectReasons, posStatement, posHorizon, posProb, negStatement, negProb, negLossLimit, tradeoff, actionText, actionDue, reviewAt]);

  if (committed) {
    return (
      <div className="callout neutral">
        この決断は確定済みです。「カード」タブで内容を、「実行」タブで行動を確認できます。
        方針を変える場合は「レビュー」タブから、旧決断を残したまま新しいversionを作成します。
      </div>
    );
  }

  if (options.length < 2) {
    return (
      <div className="callout neutral">
        確定には、比較した選択肢が2件以上必要です。「材料」タブで選択肢と判断基準を整理してください。
      </div>
    );
  }

  const doCommit = () => {
    // 予測を下書き保存してからコミット
    store.upsertForecast(version.id, "POSITIVE", {
      outcomeStatement: posStatement,
      probability: posProb / 100,
      horizonAt: isoFromLocal(posHorizon),
      leadingIndicator: posIndicator || null,
    });
    store.upsertForecast(version.id, "NEGATIVE", {
      outcomeStatement: negStatement,
      probability: negProb / 100,
      horizonAt: isoFromLocal(posHorizon),
      lossLimit: negLossLimit || null,
      leadingIndicator: negIndicator || null,
    });
    if (baseStatement.trim()) {
      store.upsertForecast(version.id, "BASELINE", {
        outcomeStatement: baseStatement,
        horizonAt: isoFromLocal(posHorizon),
      });
    }
    for (const [optId, reason] of Object.entries(rejectReasons)) {
      if (reason.trim()) store.setOptionRejectedReason(optId, reason.trim());
    }
    const actions: { text: string; actionRole: "ADVANCE" | "MITIGATE"; dueAt: string; optionId: string | null }[] = [
      { text: actionText.trim(), actionRole: "ADVANCE", dueAt: isoFromLocal(actionDue), optionId: selectedOptionId || null },
    ];
    if (mitigateText.trim()) {
      actions.push({ text: mitigateText.trim(), actionRole: "MITIGATE", dueAt: isoFromLocal(reviewAt), optionId: selectedOptionId || null });
    }
    const result = store.commit(decision.id, {
      selectedOptionId,
      rationale,
      confidence: confidence / 100,
      acceptedTradeoff: tradeoff,
      lossLimit: negLossLimit,
      stopCondition,
      reviewAt: isoFromLocal(reviewAt),
      actions,
      userConfirmed: confirmed,
    });
    if (result.ok) {
      onCommitted();
    } else {
      setFailures(result.failures);
    }
  };

  return (
    <>
      <div className="callout neutral">
        決断前に決めるのは「変えられるもの」。決断後に残るのは「受け入れるもの」。
        ここで確定した予測は凍結され、結果と同じ物差しで比較されます。
      </div>

      <h2 className="section">1. 選択(Choice)</h2>
      {options.map((o) => (
        <div key={o.id} className={`card ${selectedOptionId === o.id ? "strong" : "flat"}`}>
          <label style={{ display: "flex", gap: 10, alignItems: "baseline", cursor: "pointer" }}>
            <input
              type="radio"
              name="opt"
              checked={selectedOptionId === o.id}
              onChange={() => setSelectedOptionId(o.id)}
            />
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700 }}>{o.label}</div>
              {o.description && <div className="card-meta">{o.description}</div>}
            </div>
            {selectedOptionId === o.id && <span className="badge accent">これを選ぶ</span>}
          </label>
          {selectedOptionId && selectedOptionId !== o.id && (
            <div className="field" style={{ marginTop: 10, marginBottom: 0 }}>
              <label>却下理由<span className="req">*</span></label>
              <input
                type="text"
                value={rejectReasons[o.id] ?? o.rejectedReason ?? ""}
                onChange={(e) => setRejectReasons((r) => ({ ...r, [o.id]: e.target.value }))}
                placeholder="なぜこの案を選ばないのか"
              />
            </div>
          )}
        </div>
      ))}
      <div className="field">
        <label>選ぶ理由(rationale)</label>
        <textarea value={rationale} onChange={(e) => setRationale(e.target.value)} placeholder="どの基準がこの選択を支持したか" />
      </div>

      <h2 className="section">2. 両面予測(Dual Forecasts)</h2>
      <div className="split">
        <div className="card" style={{ borderTop: "3px solid var(--ink)" }}>
          <div style={{ fontWeight: 800, letterSpacing: "0.06em", fontSize: 13 }}>▲ ポジティブ予測</div>
          <div className="field" style={{ marginTop: 10 }}>
            <label>実現したい結果<span className="req">*</span></label>
            <textarea value={posStatement} onChange={(e) => setPosStatement(e.target.value)}
              placeholder="例: 90日で紹介経由の内定2名" />
          </div>
          <div className="form-grid">
            <div className="field">
              <label>実現確率 {posProb}%</label>
              <input type="number" min={1} max={99} value={posProb} onChange={(e) => setPosProb(Number(e.target.value))} />
            </div>
            <div className="field">
              <label>観測期限<span className="req">*</span></label>
              <input type="date" value={posHorizon} onChange={(e) => setPosHorizon(e.target.value)} />
            </div>
          </div>
          <div className="field">
            <label>先行指標</label>
            <input type="text" value={posIndicator} onChange={(e) => setPosIndicator(e.target.value)}
              placeholder="例: 2週間で紹介依頼10件" />
          </div>
        </div>

        <div className="card" style={{ borderTop: "3px solid var(--accent)" }}>
          <div style={{ fontWeight: 800, letterSpacing: "0.06em", fontSize: 13, color: "var(--accent)" }}>▼ ネガティブ予測</div>
          <div className="field" style={{ marginTop: 10 }}>
            <label>起こり得る悪い結果<span className="req">*</span></label>
            <textarea value={negStatement} onChange={(e) => setNegStatement(e.target.value)}
              placeholder="例: 紹介が集まらず採用が3ヶ月遅れる" />
          </div>
          <div className="form-grid">
            <div className="field">
              <label>発生確率 {negProb}%</label>
              <input type="number" min={1} max={99} value={negProb} onChange={(e) => setNegProb(Number(e.target.value))} />
            </div>
            <div className="field">
              <label>損失上限<span className="req">*</span></label>
              <input type="text" value={negLossLimit} onChange={(e) => setNegLossLimit(e.target.value)}
                placeholder="例: 3ヶ月と紹介インセンティブ30万円まで" />
            </div>
          </div>
          <div className="field">
            <label>早期警戒指標</label>
            <input type="text" value={negIndicator} onChange={(e) => setNegIndicator(e.target.value)}
              placeholder="例: 1ヶ月で候補者0名なら警戒" />
          </div>
        </div>
      </div>
      <div className="field">
        <label>ベースライン予測(推奨) — 何も変えなかった場合に何が起きるか</label>
        <input type="text" value={baseStatement} onChange={(e) => setBaseStatement(e.target.value)}
          placeholder="例: 現状のまま3ヶ月で応募は月12件、内定0〜1名" />
      </div>

      <h2 className="section">3. 引き受けるもの</h2>
      <div className="field">
        <label>受け入れるトレードオフ<span className="req">*</span></label>
        <input type="text" value={tradeoff} onChange={(e) => setTradeoff(e.target.value)}
          placeholder="例: 母集団の広さを捨て、質とスピードを取る" />
      </div>
      <div className="form-grid">
        <div className="field">
          <label>撤退条件(stop condition)</label>
          <input type="text" value={stopCondition} onChange={(e) => setStopCondition(e.target.value)}
            placeholder="例: 60日で候補者2名未満なら撤退" />
        </div>
        <div className="field">
          <label>レビュー日<span className="req">*</span></label>
          <input type="date" value={reviewAt} onChange={(e) => setReviewAt(e.target.value)} />
          <div className="hint">短期は7日後、中期は30日後が目安。</div>
        </div>
      </div>

      <h2 className="section">4. 最小行動(24時間以内)</h2>
      <div className="form-grid">
        <div className="field">
          <label>外部世界への最初の一歩<span className="req">*</span></label>
          <input type="text" value={actionText} onChange={(e) => setActionText(e.target.value)}
            placeholder="例: 社員3名に紹介依頼のメッセージを送る" />
          <div className="hint">頭の中の作業ではなく、外部に痕跡が残る行動。原則24時間以内。</div>
        </div>
        <div className="field">
          <label>行動期限<span className="req">*</span></label>
          <input type="date" value={actionDue} onChange={(e) => setActionDue(e.target.value)} />
        </div>
      </div>
      <div className="field">
        <label>リスク低減行動(MITIGATE・任意)</label>
        <input type="text" value={mitigateText} onChange={(e) => setMitigateText(e.target.value)}
          placeholder="例: 媒体契約は解約せず休止に留める" />
      </div>

      <h2 className="section">5. 確定(Commit gate)</h2>
      <ul className="gate-list">
        {[
          { code: "CHOICE", label: "選択肢を一つに絞った" },
          { code: "REJECT_REASON", label: "選ばなかった案に却下理由がある" },
          { code: "POSITIVE", label: "ポジティブ予測(結果・確率・期限)がある" },
          { code: "NEGATIVE", label: "ネガティブ予測がある" },
          { code: "LOSS_LIMIT", label: "損失上限を引き受けた" },
          { code: "TRADEOFF", label: "トレードオフを受け入れた" },
          { code: "ACTION", label: "最小行動と期限がある" },
          { code: "REVIEW_AT", label: "レビュー日がある" },
          { code: "USER_CONFIRM", label: "本人が確定した" },
        ].map((g) => {
          const failed = gatePreview.failures.some((f) => f.code === g.code);
          return (
            <li key={g.code} className={failed ? "ng" : "ok"}>
              {g.label}
              {failed && (
                <span style={{ marginLeft: "auto", fontSize: 12 }}>
                  {gatePreview.failures.find((f) => f.code === g.code)?.message}
                </span>
              )}
            </li>
          );
        })}
      </ul>

      <div className="card strong">
        <label style={{ display: "flex", gap: 10, alignItems: "baseline", fontWeight: 700 }}>
          <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />
          これは私の決断です。予測を凍結し、結果と比較することに同意します。
        </label>
        <div className="form-grid" style={{ marginTop: 12 }}>
          <div className="field" style={{ marginBottom: 0 }}>
            <label>この決断への自信(confidence) {confidence}%</label>
            <input type="number" min={1} max={99} value={confidence} onChange={(e) => setConfidence(Number(e.target.value))} />
          </div>
        </div>
        <div style={{ marginTop: 16 }}>
          <button className="btn accent" onClick={doCommit} disabled={!gatePreview.ok}>
            決断を確定する
          </button>
        </div>
        {failures.length > 0 && (
          <div className="callout" style={{ marginTop: 12 }}>
            {failures.map((f) => (
              <div key={f.code}>{f.message}</div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
