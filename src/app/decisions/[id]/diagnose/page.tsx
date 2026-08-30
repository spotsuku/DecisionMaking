"use client";

// 診断(一問一画面): 進捗を明示し、1問ずつ答える。
// 第1層(成立条件)チップ・第2層(心理作用)・判断可能性ルーターもこの画面に。

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useDecision } from "@/lib/useDecision";
import { store } from "@/lib/store";
import {
  QUESTION_BANK,
  selectNextQuestion,
  assessGaps,
  assessBlockers,
  routeReadiness,
  classifySafety,
  ALGORITHM_VERSION,
} from "@/lib/diagnosis";
import { BLOCKER_LABEL, GAP_LABEL, READINESS_LABEL, type Readiness } from "@/lib/types";
import { FramePanel } from "@/components/FramePanel";
import { VoiceTextarea } from "@/components/VoiceTextarea";
import { IconBack } from "@/components/icons";

const MAX_QUESTIONS = 7;

export default function DiagnosePage() {
  const router = useRouter();
  const { db, decision, version } = useDecision();
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [showLog, setShowLog] = useState(false);

  const [routing, setRouting] = useState(false);
  const [factsMissing, setFactsMissing] = useState(false);
  const [needsAsk, setNeedsAsk] = useState(false);
  const [testable, setTestable] = useState(false);
  const [unknowable, setUnknowable] = useState(false);
  const [stopCondition, setStopCondition] = useState("");

  const locked = !!version?.committedAt;

  const questions = useMemo(
    () =>
      version
        ? db.questions.filter((q) => q.versionId === version.id).sort((a, b) => a.sequenceNo - b.sequenceNo)
        : [],
    [db, version]
  );
  const answers = version ? db.answers.filter((a) => a.versionId === version.id) : [];
  const answerFor = (qid: string) => answers.find((a) => a.questionId === qid);
  const pendingQuestion = questions.find((q) => !answerFor(q.id));
  const nextDef = useMemo(
    () => (!version || pendingQuestion || locked ? null : selectNextQuestion(db, version, decision?.dueAt ?? null)),
    [db, version, decision, pendingQuestion, locked]
  );

  if (!decision || !version) return null;

  // 保存済みの質問も、記入欄の定義は質問バンクから引く
  const current = pendingQuestion
    ? QUESTION_BANK.find((q) => q.code === pendingQuestion.questionCode) ?? nextDef
    : nextDef;

  const answeredCount = answers.length;
  const gaps = assessGaps(db, version, decision.dueAt);
  const blockers = db.blockers.filter((b) => b.versionId === version.id);
  const latestReadiness = db.readiness
    .filter((r) => r.versionId === version.id)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    .at(-1);
  const safety = classifySafety(decision.domain, answers.map((a) => a.answerText).join(" "));

  const filled = current
    ? current.parts.filter((part) => (draft[part.key] ?? "").trim() !== "")
    : [];
  // 先頭の欄が埋まっていれば次へ進める(任意欄で足止めしない)
  const canSubmit = !!current && (draft[current.parts[0].key] ?? "").trim() !== "";

  const submitAnswer = () => {
    if (!current || !canSubmit) return;
    const q =
      pendingQuestion ??
      store.recordQuestion(version.id, {
        code: current.code,
        text: current.text,
        purpose: current.purpose,
        gap: current.gap,
      });
    const answerJson: Record<string, string> = {};
    for (const part of current.parts) {
      const value = (draft[part.key] ?? "").trim();
      if (value) answerJson[part.key] = value;
    }
    const answerText =
      current.parts.length > 1
        ? filled.map((part) => `${part.label}: ${(draft[part.key] ?? "").trim()}`).join("\n")
        : (draft[current.parts[0].key] ?? "").trim();
    store.recordAnswer(q.id, answerText, answerJson);
    setDraft({});
    const fresh = store.getSnapshot();
    const signals = assessBlockers(fresh, version);
    store.saveBlockers(
      version.id,
      signals.map((s) => ({
        blockerCode: s.code,
        score: s.score,
        confidence: s.confidence,
        evidenceRefs: s.evidence,
        counterQuestion: s.counterQuestion,
        algorithmVersion: ALGORITHM_VERSION,
      }))
    );
  };

  const runRouter = () => {
    const verdict: Readiness = routeReadiness({ factsMissing, needsAsk, testable, unknowable });
    store.saveReadiness(version.id, verdict, gaps.filter((g) => g.missing).map((g) => g.gap), stopCondition || null, "");
    setRouting(false);
  };

  return (
    <>
      <div className="appbar">
        <button className="back" onClick={() => router.push(`/decisions/${decision.id}`)} aria-label="戻る"><IconBack /></button>
        {current && !locked ? (
          <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 12 }}>
            <div className="progressbar">
              <div className="fill" style={{ width: `${Math.min(100, ((answeredCount + 1) / MAX_QUESTIONS) * 100)}%` }} />
            </div>
            <span className="qnum">{Math.min(answeredCount + 1, MAX_QUESTIONS)}/{MAX_QUESTIONS}</span>
          </div>
        ) : (
          <span className="title">診断</span>
        )}
      </div>

      {safety.level !== "NORMAL" && (
        <div className="callout">
          <strong>{safety.reason}</strong>
          <div>{safety.guidance}</div>
        </div>
      )}

      <FramePanel decision={decision} version={version} />

      {locked ? (
        <div className="callout neutral">このversionは確定済みです。診断の記録は変更できません。</div>
      ) : current ? (
        <>
          <div className="chips" style={{ marginTop: 8 }}>
            <span className="badge outline-accent">{GAP_LABEL[current.gap]}</span>
            <span className="card-meta">{current.purpose}</span>
          </div>
          <div className="bigq">{current.text}</div>
          {current.parts.map((part, i) => (
            <div className="field" key={part.key} style={{ marginTop: i === 0 ? 12 : 14 }}>
              {current.parts.length > 1 && (
                <label>
                  {part.label}
                  {part.optional && <span className="card-meta" style={{ marginLeft: 6 }}>任意</span>}
                </label>
              )}
              <VoiceTextarea
                rows={current.parts.length > 1 ? 3 : 5}
                autoFocus={i === 0}
                value={draft[part.key] ?? ""}
                onChange={(next) => setDraft((d) => ({ ...d, [part.key]: next }))}
                placeholder={part.placeholder}
              />
            </div>
          ))}
          <div className="hint" style={{ fontSize: 11.5, color: "var(--ink-faint)", margin: "4px 0 12px" }}>
            話して入力もできます。回答は履歴に残り、あとから根拠として参照されます。
          </div>
          <button className="btn primary" onClick={submitAnswer} disabled={!canSubmit}>
            回答を保存して次へ
          </button>
          <button className="btn ghost" style={{ marginTop: 4 }} onClick={() => router.push(`/decisions/${decision.id}`)}>
            保存して中断する
          </button>
        </>
      ) : (
        <div className="callout neutral">
          必須の問いは一巡しました。下の「いま決められる?」で次の処理を決めてください。
        </div>
      )}

      <div className="section">成立条件の状態</div>
      <div className="chips">
        {gaps.map((g) => (
          <span key={g.gap} className={`badge ${g.missing ? "warn" : "inverse"}`} title={g.detail}>
            {GAP_LABEL[g.gap]} {g.missing ? "—" : "✓"}
          </span>
        ))}
      </div>

      {blockers.length > 0 && (
        <>
          <div className="section">心理作用の可能性</div>
          <p className="card-meta" style={{ marginTop: -4 }}>
            断定ではありません。観察できる記録と、確かめる質問だけを示します。
          </p>
          {blockers.map((b) => (
            <div key={b.id} className="card">
              <div className="chips">
                <span className="badge outline-accent">{BLOCKER_LABEL[b.blockerCode]}</span>
                <span className="card-meta">確信度 {(b.confidence * 100).toFixed(0)}%</span>
              </div>
              <div style={{ fontSize: 13, marginTop: 6 }}>
                {b.evidenceRefs.map((e, i) => (
                  <div key={i}>観察: {e}</div>
                ))}
              </div>
              <div style={{ fontSize: 13.5, marginTop: 6, fontWeight: 700 }}>問い: {b.counterQuestion}</div>
            </div>
          ))}
        </>
      )}

      {!locked && (
        <>
          <div className="section">いま決められる?(判断可能性)</div>
          {latestReadiness && (
            <div className="card">
              <div className="chips">
                <span className="badge inverse">{latestReadiness.verdict}</span>
                <span style={{ fontSize: 13.5, fontWeight: 600 }}>{READINESS_LABEL[latestReadiness.verdict]}</span>
              </div>
              {latestReadiness.stopCondition && (
                <div className="card-meta" style={{ marginTop: 5 }}>停止条件: {latestReadiness.stopCondition}</div>
              )}
            </div>
          )}
          {!routing ? (
            <button className="btn" onClick={() => setRouting(true)}>
              {latestReadiness ? "判定をやり直す" : "いま決められるかを判定する"}
            </button>
          ) : (
            <div className="card strong">
              <p className="card-meta" style={{ marginTop: 0 }}>当てはまるものを選んでください。どれも当てはまらなければTHINK(決められる)です。</p>
              <label className="check-row">
                <input type="checkbox" checked={factsMissing} onChange={(e) => setFactsMissing(e.target.checked)} />
                <span>確認すれば分かる事実が残っている<br /><span className="card-meta">→ RESEARCH: 調査項目と期限を決める</span></span>
              </label>
              <label className="check-row">
                <input type="checkbox" checked={needsAsk} onChange={(e) => setNeedsAsk(e.target.checked)} />
                <span>経験者・権限を持つ人に聞く必要がある<br /><span className="card-meta">→ ASK: 誰に何を聞くかを決める</span></span>
              </label>
              <label className="check-row">
                <input type="checkbox" checked={testable} onChange={(e) => setTestable(e.target.checked)} />
                <span>考えても確定しないが、小さく試せば分かる<br /><span className="card-meta">→ TEST: 最小実験と損失上限を決める</span></span>
              </label>
              <label className="check-row">
                <input type="checkbox" checked={unknowable} onChange={(e) => setUnknowable(e.target.checked)} />
                <span>調べても試しても、誰にも分からない<br /><span className="card-meta">→ BET: 仮説と撤退条件を決めて賭ける</span></span>
              </label>
              <div className="field" style={{ marginTop: 8 }}>
                <label>情報収集の停止条件</label>
                <input type="text" value={stopCondition} onChange={(e) => setStopCondition(e.target.value)}
                  placeholder="例: 金曜までに見積2件。それ以上は集めない" />
              </div>
              <div className="row2">
                <button className="btn primary half" onClick={runRouter}>判定する</button>
                <button className="btn half" onClick={() => setRouting(false)}>やめる</button>
              </div>
            </div>
          )}
          {(latestReadiness?.verdict === "THINK" || latestReadiness?.verdict === "BET" || decision.status === "READY") && (
            <Link href={`/decisions/${decision.id}/commit`}>
              <button className="btn primary" style={{ marginTop: 10 }}>決断の確定へ進む</button>
            </Link>
          )}
        </>
      )}

      {questions.length > 0 && (
        <>
          <button
            className="btn outline"
            style={{ marginTop: 16 }}
            onClick={() => setShowLog((s) => !s)}
          >
            {showLog ? "これまでの問答を閉じる" : `これまでの問答を見る(${answers.length}件)`}
          </button>
          {showLog && (
            <div className="chat">
              {questions.map((q) => {
                const a = answerFor(q.id);
                return (
                  <div key={q.id} style={{ display: "contents" }}>
                    <div className="bubble q">
                      <div className="purpose">{GAP_LABEL[q.gap]} — {q.purpose}</div>
                      {q.text}
                    </div>
                    {a && <div className="bubble a">{a.answerText}</div>}
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </>
  );
}
