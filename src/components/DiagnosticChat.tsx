"use client";

// Diagnostic Chat(8章): 一問ずつ診断。質問の目的を明示し、回答を保存する。
// 二層診断(4.2)と判断可能性ルーター(4.3)をこの画面で完結させる。

import { useMemo, useState } from "react";
import { useDB } from "@/lib/useDB";
import { store } from "@/lib/store";
import {
  selectNextQuestion,
  assessGaps,
  assessBlockers,
  routeReadiness,
  classifySafety,
  ALGORITHM_VERSION,
} from "@/lib/diagnosis";
import type { Decision, DecisionVersion, Readiness } from "@/lib/types";
import { BLOCKER_LABEL, GAP_LABEL, READINESS_LABEL } from "@/lib/types";

export function DiagnosticChat({ decision, version }: { decision: Decision; version: DecisionVersion }) {
  const db = useDB();
  const [draft, setDraft] = useState("");
  const locked = !!version.committedAt;

  const questions = db.questions
    .filter((q) => q.versionId === version.id)
    .sort((a, b) => a.sequenceNo - b.sequenceNo);
  const answers = db.answers.filter((a) => a.versionId === version.id);
  const answerFor = (qid: string) => answers.find((a) => a.questionId === qid);

  const pendingQuestion = questions.find((q) => !answerFor(q.id));
  const nextDef = useMemo(
    () => (pendingQuestion || locked ? null : selectNextQuestion(db, version, decision.dueAt)),
    [db, version, decision.dueAt, pendingQuestion, locked]
  );

  const gaps = assessGaps(db, version, decision.dueAt);
  const blockers = db.blockers.filter((b) => b.versionId === version.id);
  const latestReadiness = db.readiness
    .filter((r) => r.versionId === version.id)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    .at(-1);

  const safety = classifySafety(decision.domain, answers.map((a) => a.answerText).join(" "));

  const ask = () => {
    if (!nextDef) return;
    store.recordQuestion(version.id, {
      code: nextDef.code,
      text: nextDef.text,
      purpose: nextDef.purpose,
      gap: nextDef.gap,
    });
  };

  const answer = () => {
    if (!pendingQuestion || !draft.trim()) return;
    store.recordAnswer(pendingQuestion.id, draft.trim());
    setDraft("");
    // 回答のたびに心理作用を再評価して保存(根拠つきのみ)
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

  // ---------------- 判断可能性ルーター(S2)
  const [routing, setRouting] = useState(false);
  const [factsMissing, setFactsMissing] = useState(false);
  const [needsAsk, setNeedsAsk] = useState(false);
  const [testable, setTestable] = useState(false);
  const [unknowable, setUnknowable] = useState(false);
  const [stopCondition, setStopCondition] = useState("");

  const runRouter = () => {
    const verdict: Readiness = routeReadiness({ factsMissing, needsAsk, testable, unknowable });
    const missing = gaps.filter((g) => g.missing).map((g) => g.gap);
    store.saveReadiness(version.id, verdict, missing, stopCondition || null, "");
    setRouting(false);
  };

  return (
    <>
      {safety.level !== "NORMAL" && (
        <div className="callout">
          <strong>{safety.reason}</strong>
          <div>{safety.guidance}</div>
        </div>
      )}

      <h2 className="section">一問ずつ考える(二層診断)</h2>

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

      {locked ? (
        <div className="callout neutral">このversionは確定済みです。診断履歴は変更できません。</div>
      ) : pendingQuestion ? (
        <div className="card strong">
          <div className="field">
            <label>回答</label>
            <textarea value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="思ったことをそのまま書いてください" />
          </div>
          <button className="btn accent" onClick={answer} disabled={!draft.trim()}>回答を保存</button>
        </div>
      ) : nextDef ? (
        <button className="btn primary" onClick={ask}>次の質問を受け取る({questions.length + 1}/7)</button>
      ) : (
        <div className="callout neutral">
          必須の問いは一巡しました。下の「判断可能性」を判定して、次の処理を決めてください。
        </div>
      )}

      <h2 className="section">成立条件の状態(第1層)</h2>
      <ul className="gate-list">
        {gaps.map((g) => (
          <li key={g.gap} className={g.missing ? "ng" : "ok"}>
            <strong>{GAP_LABEL[g.gap]}</strong> {g.detail}
          </li>
        ))}
      </ul>

      {blockers.length > 0 && (
        <>
          <h2 className="section">心理作用の可能性(第2層)</h2>
          <p className="card-meta" style={{ marginTop: -6 }}>
            断定ではありません。観察できる記録と、それを確かめる質問だけを提示します。
          </p>
          {blockers.map((b) => (
            <div key={b.id} className="card">
              <div className="card-row">
                <span className="badge outline-accent">{BLOCKER_LABEL[b.blockerCode]}</span>
                <span className="card-meta">確信度 {(b.confidence * 100).toFixed(0)}%</span>
              </div>
              <div style={{ fontSize: 13.5, marginTop: 8 }}>
                {b.evidenceRefs.map((e, i) => (
                  <div key={i}>観察: {e}</div>
                ))}
              </div>
              <div style={{ fontSize: 14, marginTop: 8, fontWeight: 600 }}>問い: {b.counterQuestion}</div>
            </div>
          ))}
        </>
      )}

      {!locked && (
        <>
          <h2 className="section">判断可能性(S2 Readiness)</h2>
          {latestReadiness && (
            <div className="card flat">
              <div className="card-row">
                <span className="badge inverse">{latestReadiness.verdict}</span>
                <span>{READINESS_LABEL[latestReadiness.verdict]}</span>
              </div>
              {latestReadiness.stopCondition && (
                <div className="card-meta" style={{ marginTop: 6 }}>停止条件: {latestReadiness.stopCondition}</div>
              )}
            </div>
          )}
          {!routing ? (
            <button className="btn" onClick={() => setRouting(true)}>
              {latestReadiness ? "判定をやり直す" : "いま決められるかを判定する"}
            </button>
          ) : (
            <div className="card strong">
              <p style={{ marginTop: 0, fontSize: 14 }}>当てはまるものにチェックしてください。</p>
              <div className="field">
                <label style={{ fontWeight: 600 }}>
                  <input type="checkbox" checked={factsMissing} onChange={(e) => setFactsMissing(e.target.checked)} />{" "}
                  確認すれば分かる事実が、まだ確認できていない(→ RESEARCH)
                </label>
                <label style={{ fontWeight: 600 }}>
                  <input type="checkbox" checked={needsAsk} onChange={(e) => setNeedsAsk(e.target.checked)} />{" "}
                  経験者・相場観・権限を持つ人に聞かないと分からない(→ ASK)
                </label>
                <label style={{ fontWeight: 600 }}>
                  <input type="checkbox" checked={testable} onChange={(e) => setTestable(e.target.checked)} />{" "}
                  考えても確定しないが、小さく試せば分かる(→ TEST)
                </label>
                <label style={{ fontWeight: 600 }}>
                  <input type="checkbox" checked={unknowable} onChange={(e) => setUnknowable(e.target.checked)} />{" "}
                  調べても試しても、将来は誰にも分からない(→ BET)
                </label>
              </div>
              <div className="field">
                <label>情報収集の停止条件(いつ・何がそろったら打ち切るか)</label>
                <input type="text" value={stopCondition} onChange={(e) => setStopCondition(e.target.value)}
                  placeholder="例: 金曜までに見積2件。それ以上は集めない" />
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button className="btn accent" onClick={runRouter}>判定する</button>
                <button className="btn ghost" onClick={() => setRouting(false)}>やめる</button>
              </div>
            </div>
          )}
          <p className="card-meta" style={{ marginTop: 10 }}>
            どれにも当てはまらなければ THINK(材料と基準がそろっている)として「決められる」状態になります。
          </p>
        </>
      )}
    </>
  );
}
