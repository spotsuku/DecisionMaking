"use client";

// Commitウィザード(5ステップ): 選択 → 両面予測 → 引き受け → 最小行動 → 確定。
// ゲート(4.6/4.7)をすべて満たすまで COMMITTED にならない。

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useDecision } from "@/lib/useDecision";
import { store } from "@/lib/store";
import { useAuth, needsAccount } from "@/lib/auth";
import { evaluateCommitGate } from "@/lib/stateMachine";
import { displayLabel } from "@/lib/options";
import { IconBack } from "@/components/icons";
import { DateField } from "@/components/DateField";

const STEPS = ["選択", "両面予測", "引き受けるもの", "最小行動", "確定"];

function isoFromLocal(dateStr: string): string {
  return dateStr ? new Date(dateStr).toISOString() : "";
}
function plusDays(days: number): string {
  return new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);
}

export default function CommitWizardPage() {
  const router = useRouter();
  const { db, decision, version } = useDecision();
  const auth = useAuth();
  const [askAccount, setAskAccount] = useState(false);
  const [step, setStep] = useState(0);

  const options = version ? db.options.filter((o) => o.versionId === version.id && o.active) : [];

  const [selectedOptionId, setSelectedOptionId] = useState<string>(version?.selectedOptionId ?? "");
  const [rationale, setRationale] = useState(version?.rationale ?? "");
  const [rejectReasons, setRejectReasons] = useState<Record<string, string>>({});

  const [posStatement, setPosStatement] = useState("");
  const [posProb, setPosProb] = useState(60);
  const [posHorizon, setPosHorizon] = useState(plusDays(30));
  const [posIndicator, setPosIndicator] = useState("");
  const [negStatement, setNegStatement] = useState("");
  const [negProb, setNegProb] = useState(30);
  const [negLossLimit, setNegLossLimit] = useState("");
  const [negIndicator, setNegIndicator] = useState("");
  const [baseStatement, setBaseStatement] = useState("");

  const [tradeoff, setTradeoff] = useState("");
  const [stopCondition, setStopCondition] = useState("");
  const [reviewAt, setReviewAt] = useState(plusDays(7));

  const [actionText, setActionText] = useState("");
  const [actionDue, setActionDue] = useState(plusDays(1));
  const [mitigateText, setMitigateText] = useState("");

  const [confirmed, setConfirmed] = useState(false);
  const [confidence, setConfidence] = useState(70);
  const [failures, setFailures] = useState<{ code: string; message: string }[]>([]);

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
      actions: actionText.trim() ? [{ text: actionText, actionRole: "ADVANCE", dueAt: isoFromLocal(actionDue) }] : [],
      reviewAt: isoFromLocal(reviewAt) || null,
    });
  }, [confirmed, selectedOptionId, options, rejectReasons, posStatement, posHorizon, posProb, negStatement, negProb, negLossLimit, tradeoff, actionText, actionDue, reviewAt]);

  if (!decision || !version) return null;

  if (version.committedAt) {
    return (
      <>
        <div className="appbar">
          <button className="back" onClick={() => router.push(`/decisions/${decision.id}`)} aria-label="戻る"><IconBack /></button>
          <span className="title">確定</span>
        </div>
        <div className="callout neutral">
          この決断は確定済みです。方針を変える場合はレビューから、旧決断を残したまま新versionを作ります。
        </div>
        <Link href={`/decisions/${decision.id}/card`}><button className="btn primary">Decision Cardを見る</button></Link>
      </>
    );
  }

  if (options.length < 2) {
    return (
      <>
        <div className="appbar">
          <button className="back" onClick={() => router.push(`/decisions/${decision.id}`)} aria-label="戻る"><IconBack /></button>
          <span className="title">確定</span>
        </div>
        <div className="callout neutral">
          確定には、比較した選択肢が2件以上必要です。まず「材料」で選択肢と判断基準を整理してください。
        </div>
        <Link href={`/decisions/${decision.id}/materials`}><button className="btn primary">材料を整理する</button></Link>
      </>
    );
  }

  const doCommit = () => {
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
    // 結果を残す段でだけアカウントを求める(ここまでは登録なしで進める)
    if (needsAccount(auth)) return setAskAccount(true);

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
      router.push(`/decisions/${decision.id}/card`);
    } else {
      setFailures(result.failures);
    }
  };

  return (
    <>
      <div className="appbar">
        <button
          className="back"
          onClick={() => (step > 0 ? setStep(step - 1) : router.push(`/decisions/${decision.id}`))}
          aria-label="戻る"
        >
          <IconBack />
        </button>
        <span className="title">{STEPS[step]}</span>
        <div className="steps" style={{ marginLeft: "auto" }}>
          {STEPS.map((_, i) => (
            <span key={i} className={`s ${i < step ? "done" : i === step ? "now" : ""}`} />
          ))}
        </div>
      </div>

      {step === 0 && (
        <>
          <p className="card-meta" style={{ margin: "0 0 12px" }}>選択肢をひとつに絞り、選ばなかった案に理由を残します。</p>
          {options.map((o) => (
            <div key={o.id} className={`card ${selectedOptionId === o.id ? "strong" : ""}`}>
              <label className="check-row" style={{ padding: 0 }}>
                <input type="radio" name="opt" checked={selectedOptionId === o.id} onChange={() => setSelectedOptionId(o.id)} />
                <span style={{ flex: 1 }}>
                  {displayLabel(o.label)}
                  {o.description && <div className="card-meta" style={{ fontWeight: 400 }}>{o.description}</div>}
                </span>
                {selectedOptionId === o.id && <span className="badge inverse">これを選ぶ</span>}
              </label>
              {selectedOptionId && selectedOptionId !== o.id && (
                <div className="field" style={{ marginTop: 8, marginBottom: 0 }}>
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
            <textarea rows={2} value={rationale} onChange={(e) => setRationale(e.target.value)} placeholder="どの基準がこの選択を支持したか" />
          </div>
          <button className="btn primary" disabled={!selectedOptionId} onClick={() => setStep(1)}>次へ: 両面予測</button>
        </>
      )}

      {step === 1 && (
        <>
          <p className="card-meta" style={{ margin: "0 0 12px" }}>
            実現したい未来には楽観的に、失敗の可能性には悲観的に。両方を凍結してから決めます。
          </p>
          <div className="card">
            <div className="chips"><span className="badge inverse">▲ ポジティブ予測</span></div>
            <div className="field" style={{ margin: "10px 0 8px" }}>
              <label>実現したい結果<span className="req">*</span></label>
              <textarea rows={2} value={posStatement} onChange={(e) => setPosStatement(e.target.value)} placeholder="例: 90日で紹介経由の内定2名" />
            </div>
            <div className="form-grid">
              <div className="field"><label>実現確率 %</label><input type="number" min={1} max={99} value={posProb} onChange={(e) => setPosProb(Number(e.target.value))} /></div>
              <div className="field"><label>観測期限<span className="req">*</span></label><DateField value={posHorizon} onChange={setPosHorizon} /></div>
            </div>
            <div className="field" style={{ marginBottom: 0 }}>
              <label>先行指標</label>
              <input type="text" value={posIndicator} onChange={(e) => setPosIndicator(e.target.value)} placeholder="例: 2週間で紹介依頼10件" />
            </div>
          </div>
          <div className="card">
            <div className="chips"><span className="badge accent">▼ ネガティブ予測</span></div>
            <div className="field" style={{ margin: "10px 0 8px" }}>
              <label>起こり得る悪い結果<span className="req">*</span></label>
              <textarea rows={2} value={negStatement} onChange={(e) => setNegStatement(e.target.value)} placeholder="例: 紹介が集まらず採用が3ヶ月遅れる" />
            </div>
            <div className="form-grid">
              <div className="field"><label>発生確率 %</label><input type="number" min={1} max={99} value={negProb} onChange={(e) => setNegProb(Number(e.target.value))} /></div>
              <div className="field"><label>損失上限<span className="req">*</span></label><input type="text" value={negLossLimit} onChange={(e) => setNegLossLimit(e.target.value)} placeholder="例: 3ヶ月と30万円まで" /></div>
            </div>
            <div className="field" style={{ marginBottom: 0 }}>
              <label>早期警戒指標</label>
              <input type="text" value={negIndicator} onChange={(e) => setNegIndicator(e.target.value)} placeholder="例: 1ヶ月で候補者0名なら警戒" />
            </div>
          </div>
          <div className="field">
            <label>ベースライン(推奨) — 何も変えなかった場合</label>
            <input type="text" value={baseStatement} onChange={(e) => setBaseStatement(e.target.value)} placeholder="例: 現状のまま応募は月12件、内定0〜1名" />
          </div>
          <button className="btn primary" disabled={!posStatement.trim() || !negStatement.trim()} onClick={() => setStep(2)}>
            次へ: 引き受けるもの
          </button>
        </>
      )}

      {step === 2 && (
        <>
          <p className="card-meta" style={{ margin: "0 0 12px" }}>決断前に決めるのは「変えられるもの」。決断後に残るのは「受け入れるもの」。</p>
          <div className="field">
            <label>受け入れるトレードオフ<span className="req">*</span></label>
            <input type="text" value={tradeoff} onChange={(e) => setTradeoff(e.target.value)} placeholder="例: 母集団の広さを捨て、質とスピードを取る" />
          </div>
          <div className="field">
            <label>撤退条件(stop condition)</label>
            <input type="text" value={stopCondition} onChange={(e) => setStopCondition(e.target.value)} placeholder="例: 60日で候補者2名未満なら撤退" />
          </div>
          <div className="field">
            <label>レビュー日<span className="req">*</span></label>
            <DateField value={reviewAt} onChange={setReviewAt} />
            <div className="hint">短期は7日後、中期は30日後が目安。予測と実績をこの日に比較します。</div>
          </div>
          <button className="btn primary" disabled={!tradeoff.trim() || !reviewAt} onClick={() => setStep(3)}>次へ: 最小行動</button>
        </>
      )}

      {step === 3 && (
        <>
          <p className="card-meta" style={{ margin: "0 0 12px" }}>頭の中の作業ではなく、外部に痕跡が残る行動。原則24時間以内。</p>
          <div className="field">
            <label>いちばん小さな一歩<span className="req">*</span></label>
            <input type="text" value={actionText} onChange={(e) => setActionText(e.target.value)} placeholder="例: 社員3名に紹介依頼のメッセージを送る" />
          </div>
          <div className="field">
            <label>行動期限<span className="req">*</span></label>
            <DateField value={actionDue} onChange={setActionDue} />
          </div>
          <div className="field">
            <label>リスク低減行動(任意)</label>
            <input type="text" value={mitigateText} onChange={(e) => setMitigateText(e.target.value)} placeholder="例: 媒体契約は解約せず休止に留める" />
          </div>
          <button className="btn primary" disabled={!actionText.trim() || !actionDue} onClick={() => setStep(4)}>次へ: 確定</button>
        </>
      )}

      {step === 4 && (
        <>
          <ul className="gate-list" style={{ marginTop: 4 }}>
            {[
              { code: "CHOICE", label: `選択: ${options.find((o) => o.id === selectedOptionId)?.label ?? "未選択"}` },
              { code: "REJECT_REASON", label: "選ばなかった案に却下理由がある" },
              { code: "POSITIVE", label: `ポジティブ予測 ${posProb}% ・ 期限あり` },
              { code: "NEGATIVE", label: `ネガティブ予測 ${negProb}%` },
              { code: "LOSS_LIMIT", label: "損失上限を引き受けた" },
              { code: "TRADEOFF", label: "トレードオフを受け入れた" },
              { code: "ACTION", label: "最小行動と期限がある" },
              { code: "REVIEW_AT", label: "レビュー日がある" },
            ].map((g) => {
              const failed = gatePreview.failures.some((f) => f.code === g.code);
              return (
                <li key={g.code} className={failed ? "ng" : "ok"}>
                  {g.label}
                </li>
              );
            })}
          </ul>
          <div className="callout neutral" style={{ fontSize: 12 }}>
            確定すると予測は凍結され、レビューで実績と同じ物差しで比較されます。あとから書き換えることはできません。
          </div>
          <div className="card strong">
            <label className="check-row">
              <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />
              これは私の決断です。予測を凍結し、結果と比較することに同意します。
            </label>
            <div className="field" style={{ margin: "10px 0 0" }}>
              <label>この決断への自信 %</label>
              <input type="number" min={1} max={99} value={confidence} onChange={(e) => setConfidence(Number(e.target.value))} />
            </div>
          </div>
          {failures.length > 0 && (
            <div className="callout">
              {failures.map((f) => (
                <div key={f.code}>{f.message}</div>
              ))}
            </div>
          )}
          {askAccount && (
            <div className="callout">
              <strong>結果を保存するにはアカウントが必要です</strong>
              <div style={{ marginTop: 6, lineHeight: 1.9 }}>
                ここまでの入力はこの端末に残っています。登録するとそのまま保存され、
                他の端末からも見られるようになります。
              </div>
              <div className="row2" style={{ marginTop: 10 }}>
                <Link href={`/signup?next=${encodeURIComponent(`/decisions/${decision.id}/commit`)}`} style={{ display: "block" }}>
                  <button className="btn primary half">登録して保存する</button>
                </Link>
                <button className="btn half" onClick={() => setAskAccount(false)}>あとにする</button>
              </div>
            </div>
          )}
          <button className="btn primary" style={{ minHeight: 54 }} disabled={!gatePreview.ok} onClick={doCommit}>
            {needsAccount(auth) ? "登録して決断を確定する" : "決断を確定する"}
          </button>
        </>
      )}
    </>
  );
}
