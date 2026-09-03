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
  fallbackPrompt,
  transcript,
  type BrainstormState,
} from "@/lib/brainstorm";
import { assistBrainstorm, assistExtract } from "@/lib/ai/assist";
import type { SourcedCandidate } from "@/lib/ai/types";
import { Composer } from "@/components/Composer";
import { IconBack } from "@/components/icons";

export default function JournalPage() {
  const router = useRouter();
  const [state, setState] = useState<BrainstormState>(emptyBrainstorm);
  const [extra, setExtra] = useState<SourcedCandidate[]>([]);
  const [draft, setDraft] = useState("");
  const [thinking, setThinking] = useState(false);
  const [added, setAdded] = useState<Record<string, string>>({});
  // AIが応答できなかった直後。会話のふりをせず、そう伝える
  const [silent, setSilent] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
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
    else
      setState((s) => {
        if (s.turns.length > 0) return s;
        const opening = fallbackPrompt(s);
        return addAppTurn(s, opening.text, opening.key);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 新しい返事が画面の下に隠れたときだけ、下へ送る。
  // 常に scrollIntoView すると、すでに下にいる人を上へ引き戻してしまう。
  useEffect(() => {
    const el = endRef.current;
    if (!el) return;
    const TABBAR = 88; // 固定タブバーの分だけ、見えていないものとして扱う
    const bottom = el.getBoundingClientRect().bottom;
    if (bottom > window.innerHeight - TABBAR) {
      el.scrollIntoView({ behavior: "smooth", block: "end" });
    }
  }, [state.turns.length, thinking]);

  const send = async (said: string) => {
    const text = said.trim();
    if (!text || thinking) return;
    setDraft("");
    setSilent(false);
    const withUser = addUserTurn(state.turns.length === 0 ? emptyBrainstorm() : state, text);
    setState(withUser);
    setThinking(true);
    try {
      // 書いたそばから保存する。ボタンを押し忘れて消える、をなくす
      const body = transcript(withUser);
      if (savedRef.current) store.updateJournalEntry(savedRef.current, body);
      else savedRef.current = store.addJournalEntry(body).id;

      const candidates = await assistExtract(body);
      setExtra(candidates);

      // 決めにいくかは、こちらから尋ねない。
      // 数往復で「これを決めにいきますか?」と出すのは、話している最中に
      // 決断を要求することになる。決めるのは本人(INV-05)。
      // 決断として立てたくなったら、下の候補一覧からいつでも立てられる。

      // それ以外はAIが会話を進める。
      // 返らなかったら黙って定型文を出すのではなく、答えられないことを出す
      const reply = await assistBrainstorm(withUser, fallbackPrompt(withUser), text);
      if (reply) setState((s) => addAppTurn(s, reply));
      else setSilent(true);
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
        {silent && !thinking && (
          <div className="bubble q note">
            いま応答できませんでした。書いたものは保存されています。続けて書いても構いません。
          </div>
        )}
      </div>

      <Composer
        value={draft}
        onChange={setDraft}
        onSend={() => void send(draft)}
        sending={thinking}
        sendLabel="話す"
        placeholder="思いつくまま話してください"
      />
      <div ref={endRef} />

      {candidates.length > 0 && (
        <div className="sheet" ref={listRef} style={{ marginTop: 16 }}>
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

      <Link href="/decisions/new" style={{ display: "block", marginTop: 16 }}>
        <span className="btn outline">決めることを直接登録する</span>
      </Link>
    </>
  );
}
