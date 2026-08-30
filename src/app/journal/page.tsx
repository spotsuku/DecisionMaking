"use client";

// 書き出し(ブレインダンプ): 自由記述 or 音声で頭の中を出す。
// 保存すると、決断が隠れていそうな文を候補として提案する(提案のみ・確定は本人 INV-05)。

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useDB, fmtDateTime } from "@/lib/useDB";
import { store } from "@/lib/store";
import { extractCandidates, candidateTitle } from "@/lib/journal";
import { IconBack, IconMic } from "@/components/icons";

type SpeechRecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((e: { resultIndex: number; results: { length: number; [i: number]: { isFinal: boolean; 0: { transcript: string } } } }) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
  start: () => void;
  stop: () => void;
};

export default function JournalPage() {
  const router = useRouter();
  const db = useDB();
  const [text, setText] = useState("");
  const [candidates, setCandidates] = useState<string[] | null>(null);
  const [added, setAdded] = useState<Record<string, string>>({}); // candidate -> decisionId
  const [listening, setListening] = useState(false);
  const [speechSupported, setSpeechSupported] = useState(true);
  const recRef = useRef<SpeechRecognitionLike | null>(null);
  const textRef = useRef(text);
  textRef.current = text;

  useEffect(() => {
    const w = window as unknown as Record<string, unknown>;
    if (!w.SpeechRecognition && !w.webkitSpeechRecognition) setSpeechSupported(false);
    return () => recRef.current?.stop();
  }, []);

  const toggleMic = () => {
    if (listening) {
      recRef.current?.stop();
      setListening(false);
      return;
    }
    const w = window as unknown as Record<string, unknown>;
    const SR = (w.SpeechRecognition ?? w.webkitSpeechRecognition) as (new () => SpeechRecognitionLike) | undefined;
    if (!SR) return;
    const rec = new SR();
    rec.lang = "ja-JP";
    rec.continuous = true;
    rec.interimResults = false;
    rec.onresult = (e) => {
      let addedText = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) addedText += e.results[i][0].transcript;
      }
      if (addedText) {
        const base = textRef.current;
        setText(base + (base && !base.endsWith("\n") ? "\n" : "") + addedText + "。");
      }
    };
    rec.onend = () => setListening(false);
    rec.onerror = () => setListening(false);
    recRef.current = rec;
    rec.start();
    setListening(true);
  };

  const save = () => {
    if (!text.trim()) return;
    recRef.current?.stop();
    store.addJournalEntry(text.trim());
    setCandidates(extractCandidates(text));
  };

  const addCandidate = (c: string) => {
    const { decision } = store.createDecisionFromCandidate(c, candidateTitle(c));
    setAdded((m) => ({ ...m, [c]: decision.id }));
  };

  const recentEntries = [...db.journal].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 5);

  return (
    <>
      <div className="appbar">
        <button className="back" onClick={() => router.push("/")} aria-label="戻る"><IconBack /></button>
        <span className="title">書き出し</span>
        <button className="appbar-action" onClick={save} disabled={!text.trim()}>保存</button>
      </div>

      <textarea
        className="dump-area"
        autoFocus
        placeholder={"思いつくまま、そのまま書いてください。\n順番も整理も、いりません。"}
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

      {candidates !== null && (
        <div className="sheet">
          {candidates.length > 0 ? (
            <>
              <div style={{ fontSize: 14, fontWeight: 800, letterSpacing: "-0.01em" }}>
                この中に、決めることが隠れていそうです
              </div>
              <div className="card-meta" style={{ marginBottom: 4 }}>
                候補は提案です。決断にするかどうかは、あなたが選びます。
              </div>
              {candidates.map((c) => (
                <div key={c} className="cand">
                  <span className="t">{c}</span>
                  {added[c] ? (
                    <Link href={`/decisions/${added[c]}`}>
                      <span className="chip-btn soft">追加済み ✓</span>
                    </Link>
                  ) : (
                    <button className="chip-btn" onClick={() => addCandidate(c)}>追加</button>
                  )}
                </div>
              ))}
            </>
          ) : (
            <>
              <div style={{ fontSize: 14, fontWeight: 800 }}>保存しました</div>
              <div className="card-meta">
                今回は決断の候補は見つかりませんでした。書き出すこと自体に意味があります。
                決めることがはっきりしているなら、下から直接登録できます。
              </div>
            </>
          )}
          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            <button className="btn half" onClick={() => { setText(""); setCandidates(null); setAdded({}); }}>
              続けて書く
            </button>
            <button className="btn primary half" onClick={() => router.push("/")}>ホームへ</button>
          </div>
        </div>
      )}

      <div style={{ marginTop: 20 }}>
        <Link href="/decisions/new">
          <span className="link-row">問いが決まっているなら、直接登録する</span>
        </Link>
      </div>

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
