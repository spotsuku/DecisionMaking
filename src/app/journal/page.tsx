"use client";

// 書き出し: 一人で書くのではなく、話しながら絞り込む。
//
// 話すたびに、決めごとの候補が下に溜まっていく。
// アプリは答えを出さず、受け止めて問いを1つ返すだけ(6.1 / INV-05)。
// 保存は自動なので、「保存ボタンを押さないと消える」不安を持たせない。

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { store } from "@/lib/store";
import { candidateTitle, JOURNAL_SEED_KEY } from "@/lib/journal";
import {
  addAppTurn,
  addUserTurn,
  emptyBrainstorm,
  nextPrompt,
  readyToDecide,
  transcript,
  type BrainstormState,
} from "@/lib/brainstorm";
import { assistBrainstorm, assistExtract } from "@/lib/ai/assist";
import type { SourcedCandidate } from "@/lib/ai/types";
import { VoiceTextarea } from "@/components/VoiceTextarea";
import { IconBack } from "@/components/icons";

export default function JournalPage() {
  const router = useRouter();
  const [state, setState] = useState<BrainstormState>(emptyBrainstorm);
  const [extra, setExtra] = useState<SourcedCandidate[]>([]);
  const [draft, setDraft] = useState("");
  const [thinking, setThinking] = useState(false);
  const [added, setAdded] = useState<Record<string, string>>({});
  const savedRef = useRef<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  // ホームで書き始めた本文があれば、最初の発言として引き継ぐ
  useEffect(() => {
    let seed: string | null = null;
    try {
      seed = window.sessionStorage.getItem(JOURNAL_SEED_KEY);
      if (seed) window.sessionStorage.removeItem(JOURNAL_SEED_KEY);
    } catch {
      // 受け取れなくても、その場で書けばよい
    }
    if (seed) void send(seed);
    else setState((s) => (s.turns.length === 0 ? addAppTurn(s, nextPrompt(s)) : s));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [state.turns.length, thinking]);

  const send = async (said: string) => {
    const text = said.trim();
    if (!text || thinking) return;
    setDraft("");
    const withUser = addUserTurn(state.turns.length === 0 ? emptyBrainstorm() : state, text);
    setState(withUser);
    setThinking(true);
    try {
      // 書いたそばから保存する。ボタンを押し忘れて消える、をなくす
      const body = transcript(withUser);
      if (savedRef.current) store.updateJournalEntry(savedRef.current, body);
      else savedRef.current = store.addJournalEntry(body).id;

      const [reply, candidates] = await Promise.all([
        assistBrainstorm(withUser),
        assistExtract(body),
      ]);
      setExtra(candidates);
      setState((s) => addAppTurn(s, reply));
    } finally {
      setThinking(false);
    }
  };

  const makeDecision = (text: string) => {
    const { decision } = store.createDecisionFromCandidate(text, candidateTitle(text));
    setAdded((m) => ({ ...m, [text]: decision.id }));
  };

  // ルールとAIの両方から集めた候補(重複はassist側で除いてある)
  const candidates = extra.length > 0 ? extra : state.candidates.map((c) => ({ ...c, source: "RULE" as const }));
  const questions = candidates.filter((c) => c.kind === "QUESTION");
  const signals = candidates.filter((c) => c.kind === "SIGNAL");

  return (
    <>
      <div className="appbar">
        <button className="back" onClick={() => router.push("/")} aria-label="戻る"><IconBack /></button>
        <span className="title">書き出し</span>
        <span className="card-meta" style={{ marginLeft: "auto" }}>自動で保存されます</span>
      </div>

      <div className="chat" style={{ marginTop: 8 }}>
        {state.turns.map((t, i) =>
          t.from === "USER" ? (
            <div key={i} className="bubble a">{t.text}</div>
          ) : (
            <div key={i} className="bubble q">{t.text}</div>
          )
        )}
        {thinking && <div className="bubble q note">…</div>}
        <div ref={endRef} />
      </div>

      <VoiceTextarea
        rows={3}
        value={draft}
        onChange={setDraft}
        placeholder="思いつくまま。まとまっていなくて大丈夫です"
      />
      <button
        className="btn primary"
        style={{ marginTop: 8 }}
        onClick={() => void send(draft)}
        disabled={!draft.trim() || thinking}
      >
        {thinking ? "聞いています…" : "話す"}
      </button>

      {candidates.length > 0 && (
        <div className="sheet" style={{ marginTop: 16 }}>
          <div style={{ fontSize: 14, fontWeight: 800, letterSpacing: "-0.01em" }}>
            決めることになりそうなもの({candidates.length})
          </div>
          <div className="card-meta" style={{ marginBottom: 6 }}>
            候補です。決断として立てるかどうかは、あなたが選びます。
          </div>
          {[...questions, ...signals].map((c) => (
            <div key={c.text} className="cand">
              <span className="t">
                {c.text}
                {c.kind === "SIGNAL" && <span className="badge soft" style={{ marginLeft: 6 }}>止まっている</span>}
              </span>
              {added[c.text] ? (
                <Link href={`/decisions/${added[c.text]}`}>
                  <span className="chip-btn soft">開く</span>
                </Link>
              ) : (
                <button className="chip-btn" onClick={() => makeDecision(c.text)}>決めることにする</button>
              )}
            </div>
          ))}
        </div>
      )}

      {readyToDecide(state) && (
        <p className="card-meta" style={{ marginTop: 12, lineHeight: 1.8 }}>
          まだ話し足りなければ続けてください。区切りがついたら、上の候補から1つ選んで診断に進めます。
        </p>
      )}

      <Link href="/decisions/new" style={{ display: "block", marginTop: 16 }}>
        <span className="btn outline">決めることを直接登録する</span>
      </Link>
    </>
  );
}
