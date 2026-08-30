"use client";

// 書き出し(ブレインダンプ): 自由記述 or 音声で頭の中を出す。
// 保存すると、決断が隠れていそうな文を候補として提案する(提案のみ・確定は本人 INV-05)。

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useDB, fmtDateTime } from "@/lib/useDB";
import { store } from "@/lib/store";
import { candidateTitle } from "@/lib/journal";
import { assistExtract } from "@/lib/ai/assist";
import type { SourcedCandidate } from "@/lib/ai/types";
import { useSpeechInput, appendSpeech } from "@/lib/useSpeech";
import { IconBack, IconMic } from "@/components/icons";

export default function JournalPage() {
  const router = useRouter();
  const db = useDB();
  const [text, setText] = useState("");
  const [candidates, setCandidates] = useState<SourcedCandidate[] | null>(null);
  const [reading, setReading] = useState(false);
  const [added, setAdded] = useState<Record<string, string>>({}); // candidate -> decisionId
  const textRef = useRef(text);
  textRef.current = text;
  const {
    listening,
    supported: speechSupported,
    toggle: toggleMic,
    stop: stopMic,
  } = useSpeechInput((spoken) => setText(appendSpeech(textRef.current, spoken)));

  const save = async () => {
    if (!text.trim() || reading) return;
    stopMic();
    store.addJournalEntry(text.trim());
    // ルールの結果が先に確定し、AIはそこに足すだけ。落ちても候補は出る
    setReading(true);
    try {
      setCandidates(await assistExtract(text));
    } finally {
      setReading(false);
    }
  };

  const addCandidate = (c: string) => {
    const { decision } = store.createDecisionFromCandidate(c, candidateTitle(c));
    setAdded((m) => ({ ...m, [c]: decision.id }));
  };

  /** 問いの形になっていない兆候・書き出し全文からは、本人に問いを立ててもらう */
  const startFraming = (seed: string) => {
    try {
      window.sessionStorage.setItem("dm-seed-question", seed);
      window.sessionStorage.setItem("dm-seed-note", text.trim());
    } catch {
      // 保存できなくても登録画面へは進める
    }
    router.push("/decisions/new");
  };

  const recentEntries = [...db.journal].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 5);

  return (
    <>
      <div className="appbar">
        <button className="back" onClick={() => router.push("/")} aria-label="戻る"><IconBack /></button>
        <span className="title">書き出し</span>
        <button className="appbar-action" onClick={save} disabled={!text.trim() || reading}>
          {reading ? "読んでいます…" : "保存"}
        </button>
      </div>

      <textarea
        className="dump-area"
        autoFocus
        placeholder={
          "例)\n" +
          "転職しようか迷ってる。不満はないけど…\n" +
          "犬を飼うかどうか。世話は誰がする?\n" +
          "週末の予定、まだ決めてない\n" +
          "あの返信、3日放置してる\n\n" +
          "うまく書かなくて大丈夫。"
        }
        value={text}
        onChange={(e) => setText(e.target.value)}
      />

      <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 8 }}>
        <button
          className={`mic-corner ${listening ? "listening" : ""}`}
          style={{ position: "static", cursor: "pointer", border: "none" }}
          onClick={toggleMic}
          disabled={!speechSupported}
          aria-label="音声入力"
        >
          <IconMic />
        </button>
        <span className="card-meta">
          {!speechSupported
            ? "このブラウザは音声入力に対応していません"
            : listening
            ? "聞いています… もう一度タップで停止"
            : "話すだけでもOK。そのまま文字になります"}
        </span>
      </div>

      {candidates === null && (
        <Link href="/decisions/new" style={{ display: "block", marginTop: 16 }}>
          <span className="btn outline">決めることを直接登録する</span>
        </Link>
      )}

      {candidates !== null && (() => {
        const questions = candidates.filter((c) => c.kind === "QUESTION");
        const signals = candidates.filter((c) => c.kind === "SIGNAL");
        return (
          <div className="sheet">
            {questions.length > 0 ? (
              <>
                <div style={{ fontSize: 14, fontWeight: 800, letterSpacing: "-0.01em" }}>
                  この中に、決めることが隠れていそうです
                </div>
                <div className="card-meta" style={{ marginBottom: 4 }}>
                  候補は提案です。決断にするかどうかは、あなたが選びます。
                </div>
                {questions.map((c) => (
                  <div key={c.text} className="cand">
                    <span className="t">
                      {c.text}
                      {c.source === "AI" && <span className="badge soft" style={{ marginLeft: 6 }}>AI</span>}
                    </span>
                    {added[c.text] ? (
                      <Link href={`/decisions/${added[c.text]}`}>
                        <span className="chip-btn soft">追加済み ✓</span>
                      </Link>
                    ) : (
                      <button className="chip-btn" onClick={() => addCandidate(c.text)}>追加</button>
                    )}
                  </div>
                ))}
              </>
            ) : (
              <div style={{ fontSize: 14, fontWeight: 800 }}>保存しました</div>
            )}

            {signals.length > 0 && (
              <>
                <div className="section" style={{ marginTop: questions.length > 0 ? 18 : 10 }}>
                  決めずに置いているサイン
                </div>
                <div className="card-meta" style={{ marginTop: -4, marginBottom: 4 }}>
                  問いの形にはなっていませんが、未決のまま進んでいる合図です。
                </div>
                {signals.map((c) => (
                  <div key={c.text} className="cand">
                    <span className="t" style={{ fontWeight: 600 }}>{c.text}</span>
                    <button className="chip-btn soft" onClick={() => startFraming(c.text)}>
                      問いにする
                    </button>
                  </div>
                ))}
              </>
            )}

            {questions.length === 0 && signals.length === 0 && (
              <div className="card-meta">
                こちらでは決断の候補を絞りきれませんでした。書き出すこと自体に意味があります。
                決めたいことが頭にあるなら、下から問いにできます。
              </div>
            )}

            <button className="btn primary" style={{ marginTop: 14 }} onClick={() => startFraming("")}>
              この書き出しから決断をつくる
            </button>
            <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
              <button className="btn half" onClick={() => { setText(""); setCandidates(null); setAdded({}); }}>
                続けて書く
              </button>
              <button className="btn half" onClick={() => router.push("/")}>ホームへ</button>
            </div>
          </div>
        );
      })()}

      {recentEntries.length > 0 && (
        <>
          <div className="section">最近の書き出し</div>
          {recentEntries.map((e) => (
            <div key={e.id} className="card">
              <div className="card-meta">{fmtDateTime(e.createdAt)}</div>
              <div style={{ fontSize: 13.5, marginTop: 4, whiteSpace: "pre-line" }}>
                {e.text.length > 100 ? `${e.text.slice(0, 100)}…` : e.text}
              </div>
            </div>
          ))}
        </>
      )}
    </>
  );
}
