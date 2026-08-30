"use client";

// 診断(一問一画面): 進捗を明示し、1問ずつ答える。
// 第1層(成立条件)チップ・第2層(心理作用)・判断可能性ルーターもこの画面に。

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useDecision } from "@/lib/useDecision";
import { store } from "@/lib/store";
import {
  QUESTION_BANK,
  splitFreeText,
  joinParts,
  chatReply,
  isNonAnswer,
  emptyChatState,
  type ChatState,
  selectNextQuestion,
  assessGaps,
  assessBlockers,
  routeReadiness,
  classifySafety,
  ALGORITHM_VERSION,
} from "@/lib/diagnosis";
import { BLOCKER_LABEL, GAP_LABEL, READINESS_LABEL, type AnswerMode, type Readiness } from "@/lib/types";
import { assistReply, assistSplit } from "@/lib/ai/assist";
import { FramePanel } from "@/components/FramePanel";
import { VoiceTextarea } from "@/components/VoiceTextarea";
import { Composer } from "@/components/Composer";
import { IconBack } from "@/components/icons";

const MAX_QUESTIONS = 7;
const MODE_KEY = "dm.diagnose.mode";

function stripEmpty(values: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.entries(values).filter(([, v]) => v.trim() !== ""));
}

export default function DiagnosePage() {
  const router = useRouter();
  const { db, decision, version } = useDecision();
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [chatDraft, setChatDraft] = useState("");
  // 進行中の1問ぶんのやりとり。確定するまでは画面の中だけに持つ
  const [chat, setChat] = useState<ChatState>(emptyChatState);
  const [turns, setTurns] = useState<{ from: "USER" | "APP"; text: string }[]>([]);
  const [thinking, setThinking] = useState(false);
  const [mode, setMode] = useState<AnswerMode>("CHAT");
  const [showLog, setShowLog] = useState(false);
  // 会話の下に情報を積み上げない。必要なときだけ開く
  const [showState, setShowState] = useState(false);

  // 聞かれ方の好みは人によって違うので、端末に覚えさせる
  useEffect(() => {
    const saved = window.localStorage.getItem(MODE_KEY);
    if (saved === "CHAT" || saved === "FORM") setMode(saved);
  }, []);
  const changeMode = (next: AnswerMode) => {
    // チャットで書きかけの文があれば、欄へ振り分けて引き継ぐ
    if (next === "FORM" && current) {
      const spoken = chatDraft.trim() ? splitFreeText(current, chatDraft) : {};
      setDraft((d) => ({ ...chat.values, ...spoken, ...stripEmpty(d) }));
      setChatDraft("");
    }
    setMode(next);
    window.localStorage.setItem(MODE_KEY, next);
  };

  const [routing, setRouting] = useState(false);
  // 最初は何も済んでいない状態から始める。開いた瞬間に「もう決められる」と
  // 出すと、確かめないまま先へ進んでしまう
  const [factsMissing, setFactsMissing] = useState(true);
  const [needsAsk, setNeedsAsk] = useState(true);
  const [testable, setTestable] = useState(true);
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

  // いま1つの欄だけを聞き直している最中か
  const askingPart = current?.parts.find((p) => p.key === chat.askingPart) ?? null;
  // 先頭の欄が埋まっていれば次へ進める(任意欄で足止めしない)
  const canSubmit = !!current && (draft[current.parts[0].key] ?? "").trim() !== "";

  /** 質問レコードは、答えるかスキップするその時に作る */
  const ensureQuestion = () =>
    pendingQuestion ??
    store.recordQuestion(version.id, {
      code: current!.code,
      text: current!.text,
      purpose: current!.purpose,
      gap: current!.gap,
    });

  const resetTurn = () => {
    setDraft({});
    setChatDraft("");
    setChat(emptyChatState());
    setTurns([]);
    refreshBlockers();
  };

  const saveAnswer = (
    values: Record<string, string>,
    answered: AnswerMode,
    opts: { skipped?: boolean; rawText?: string } = {}
  ) => {
    if (!current) return;
    const answerJson = stripEmpty(values);
    store.recordAnswer(ensureQuestion().id, joinParts(current, answerJson), answerJson, {
      mode: answered,
      rawText: opts.rawText,
      skipped: opts.skipped,
    });
    resetTurn();
  };

  const submitAnswer = () => {
    if (!canSubmit) return;
    saveAnswer(draft, "FORM");
  };

  /**
   * チャットの返事を受けて、次の一手を決める。
   * 内容のない返事をそのまま欄へ入れると会話が噛み合わなくなるので、
   * 聞き直す・欄を埋め直す・記録して次へ、を chatReply が振り分ける。
   */
  const submitChat = async () => {
    if (!current || !chatDraft.trim() || thinking) return;
    const said = chatDraft.trim();

    // 進行を決めるのはルール。AIは言い換えと振り分けだけを助ける(6.1)
    let { turn, values } = chatReply(current, chat, said);

    if (turn.kind !== "REPHRASE" && turn.kind !== "SKIP" && !chat.askingPart) {
      setThinking(true);
      try {
        const split = await assistSplit(current, said);
        const merged = { ...chat.values, ...split.values };
        // 振り分けが変われば、次の一手も決め直す
        const missing = current.parts.find((part) => !part.optional && (merged[part.key] ?? "").trim() === "");
        values = merged;
        turn = missing
          ? { kind: "FOLLOW_UP", partKey: missing.key, text: missing.followUp ?? `${missing.label}は何ですか?` }
          : turn.kind === "FOLLOW_UP"
          ? { kind: "FILED", text: "受け取りました。次に進みます。" }
          : turn;
      } finally {
        setThinking(false);
      }
    }

    const spoken = [...turns, { from: "USER" as const, text: said }];
    // 記録に残すのは中身のある発言だけ。「分からない」は聞き直しのきっかけであって答えではない
    const rawText = spoken
      .filter((t) => t.from === "USER" && !isNonAnswer(t.text))
      .map((t) => t.text)
      .join("\n");

    if (turn.kind === "FILED") {
      saveAnswer(values, "CHAT", { rawText });
      return;
    }
    if (turn.kind === "SKIP") {
      saveAnswer(values, "CHAT", { skipped: true, rawText });
      return;
    }
    const asked = turn;
    setTurns([...spoken, { from: "APP", text: asked.text }]);
    setChat({
      values,
      rephrased: chat.rephrased || asked.kind === "REPHRASE",
      askingPart: asked.kind === "FOLLOW_UP" ? asked.partKey : null,
    });
    setChatDraft("");

    // 定型文のまま先に出しておき、AIの言い換えが返ったら差し替える。
    // 返らなくても会話は成立している
    setThinking(true);
    assistReply(current, asked, said)
      .then((text) => {
        if (text !== asked.text) {
          setTurns((ts) => ts.map((t, i) => (i === ts.length - 1 && t.from === "APP" ? { ...t, text } : t)));
        }
      })
      .finally(() => setThinking(false));
  };

  /** わからない質問は飛ばす。記録は残し、成立条件は埋まっていないままにする */
  const skipQuestion = () => {
    if (!current) return;
    const rawText = turns
      .filter((t) => t.from === "USER" && !isNonAnswer(t.text))
      .map((t) => t.text)
      .join("\n");
    // すでに話してくれた分があれば、それは答えとして残す
    const filed = Object.keys(stripEmpty(chat.values)).length > 0;
    saveAnswer(chat.values, mode, { skipped: !filed, rawText: rawText || undefined });
  };

  function refreshBlockers() {
    if (!version) return;
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
  }

  /**
   * 「残りは調べても試しても誰にも分からない」を選んだ時点で、
   * 残りの手立ては無いと本人が言っている。調査や相談を理由に足止めしない。
   */
  const routerInput = unknowable
    ? { factsMissing: false, needsAsk: false, testable: false, unknowable: true }
    : { factsMissing, needsAsk, testable, unknowable: false };

  // 押す前に結果が見えないと、チェックの意味が分からないまま選ぶことになる
  const preview: Readiness = routeReadiness(routerInput);

  const runRouter = () => {
    const verdict: Readiness = routeReadiness(routerInput);
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

      {(mode === "FORM" || locked) && <FramePanel decision={decision} version={version} />}

      {locked ? (
        <div className="callout neutral">このversionは確定済みです。診断の記録は変更できません。</div>
      ) : current ? (
        <>
          {mode === "CHAT" ? (
            <>
              <div className="chat" style={{ marginTop: 12 }}>
                {questions.map((q) => {
                  const a = answerFor(q.id);
                  const def = QUESTION_BANK.find((d) => d.code === q.questionCode);
                  const said = a?.rawText || a?.answerText || "";
                  return (
                    <div key={q.id} style={{ display: "contents" }}>
                      <div className="bubble q">
                        <div className="purpose">{GAP_LABEL[q.gap]} — {q.purpose}</div>
                        {q.text}
                      </div>
                      {said && (
                        <div className="bubble a">
                          {said.split("\n").map((line, i) => <div key={i}>{line}</div>)}
                        </div>
                      )}
                      {a?.skipped && (
                        <div className="bubble q note">
                          分からないままにしました。ここは「まだ分かっていない」という記録です。
                        </div>
                      )}
                      {(() => {
                        // 古い記録には欄ごとの値が無い。空の「」を出さない
                        if (!a || a.skipped || !def || def.parts.length < 2) return null;
                        const filed = def.parts.filter((part) => a.answerJson[part.key]);
                        if (filed.length === 0) return null;
                        return (
                          <div className="bubble q note">
                            「{filed.map((part) => part.label).join("」「")}」として記録しました。
                          </div>
                        );
                      })()}
                    </div>
                  );
                })}
                {!pendingQuestion && (
                  <div className="bubble q">
                    <div className="purpose">{GAP_LABEL[current.gap]} — {current.purpose}</div>
                    {current.text}
                  </div>
                )}
                {turns.map((t, i) =>
                  t.from === "USER" ? (
                    <div key={i} className="bubble a">{t.text}</div>
                  ) : (
                    <div key={i} className="bubble q">{t.text}</div>
                  )
                )}
              </div>

              <Composer
                value={chatDraft}
                onChange={setChatDraft}
                onSend={submitChat}
                sending={thinking}
                sendLabel="答える"
                placeholder={askingPart ? `${askingPart.label}を話す` : "話してください"}
              />
              <div className="composer-aside">
                <button onClick={skipQuestion}>わからない・飛ばす</button>
                <button onClick={() => changeMode("FORM")}>欄ごとに書く</button>
              </div>
            </>
          ) : (
            <>
              <div className="chips" style={{ marginTop: 12 }}>
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
              <div className="composer-aside">
                <button onClick={skipQuestion}>わからない・飛ばす</button>
                <button onClick={() => changeMode("CHAT")}>チャットで話す</button>
              </div>
            </>
          )}
        </>
      ) : (
        <div className="callout neutral">
          必須の問いは一巡しました。下で、いま決められるかを判定してください。
        </div>
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
              <p className="card-meta" style={{ marginTop: 0, lineHeight: 1.8 }}>
                終えたものにチェックを入れてください。3つそろえば、決められます。
              </p>
              <label className={factsMissing ? "check-row" : "check-row done"}>
                <input type="checkbox" checked={!factsMissing} onChange={(e) => setFactsMissing(!e.target.checked)} />
                <span>
                  確認すれば分かる事実は、網羅した
                  <br /><span className="card-meta">残っているなら → RESEARCH: 調査項目と期限を決める</span>
                </span>
              </label>
              <label className={needsAsk ? "check-row" : "check-row done"}>
                <input type="checkbox" checked={!needsAsk} onChange={(e) => setNeedsAsk(!e.target.checked)} />
                <span>
                  経験者・権限を持つ人に聞き尽くした
                  <br /><span className="card-meta">残っているなら → ASK: 誰に何を聞くかを決める</span>
                </span>
              </label>
              <label className={testable ? "check-row" : "check-row done"}>
                <input type="checkbox" checked={!testable} onChange={(e) => setTestable(!e.target.checked)} />
                <span>
                  考えて確定しないことを小さく試した
                  <br /><span className="card-meta">残っているなら → TEST: 最小実験と損失上限を決める</span>
                </span>
              </label>

              {/* 「誰にも分からない」は詰まりではなく、決められる側の理由。
                  他と並べると、チェックを入れるほど決められなくなるように見えてしまう */}
              {(factsMissing || needsAsk || testable) && (
                <div className="bet-out">
                  <label className="check-row">
                    <input type="checkbox" checked={unknowable} onChange={(e) => setUnknowable(e.target.checked)} />
                    <span>
                      残りは、調べても試しても、誰にも分からない
                      <br /><span className="card-meta">それでも決めるなら → BET: 仮説と撤退条件を決めて賭ける</span>
                    </span>
                  </label>
                </div>
              )}

              <div className="verdict-now">
                <span className="badge inverse">{preview}</span>
                <span>{READINESS_LABEL[preview]}</span>
              </div>

              <div className="field" style={{ marginTop: 10 }}>
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

      <button className="disclosure" onClick={() => setShowState((v) => !v)}>
        <span>
          診断の状態
          <span className="card-meta" style={{ marginLeft: 8 }}>
            {gaps.filter((g) => !g.missing).length}/{gaps.length} 条件がそろっています
          </span>
        </span>
        <span className="mark">{showState ? "閉じる ▲" : "見る ▼"}</span>
      </button>

      {showState && (
        <>
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

        </>
      )}

      {questions.length > 0 && (mode === "FORM" || locked) && (
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
                    {a &&
                      (a.skipped ? (
                        <div className="bubble a skipped">わからないので飛ばしました</div>
                      ) : (
                        <div className="bubble a">{a.answerText}</div>
                      ))}
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
