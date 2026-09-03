"use client";

// 入力欄。チャットアプリと同じく「ここに書く」と一目で分かる形にする。
//
// 以前は本文と同じ灰色の箱で、下に送信・スキップ・中断のボタンが縦に3つ並んでいた。
// どこに入力するのか分からず、押すべきボタンも決められない状態だった。
// 入力欄・マイク・送信を1つの帯にまとめ、他の操作は帯の外へ出す。

import { useRef } from "react";
import { useSpeechInput, appendSpeech } from "@/lib/useSpeech";
import { IconMic } from "@/components/icons";

export function Composer({
  value,
  onChange,
  onSend,
  placeholder,
  disabled = false,
  sending = false,
  sendLabel = "送信",
}: {
  value: string;
  onChange: (next: string) => void;
  onSend: () => void;
  placeholder?: string;
  disabled?: boolean;
  sending?: boolean;
  sendLabel?: string;
}) {
  const valueRef = useRef(value);
  valueRef.current = value;
  const { listening, supported, toggle, interim } = useSpeechInput((spoken) =>
    onChange(appendSpeech(valueRef.current, spoken))
  );
  const canSend = value.trim() !== "" && !disabled && !sending;

  return (
    <div className={`composer ${listening ? "listening" : ""}`}>
      <div className="c-field">
      <textarea
        rows={1}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        onInput={(e) => {
          // 書いた分だけ伸びる。改行のたびに指で広げさせない
          const el = e.currentTarget;
          el.style.height = "auto";
          el.style.height = `${Math.min(el.scrollHeight, 148)}px`;
        }}
        onKeyDown={(e) => {
          // ⌘+Enter / Ctrl+Enter で送る。Enter単体は改行のまま
          // (書きかけで送ってしまう方が損が大きい)。
          // 日本語入力の変換中は送らない ── 未確定の文字が飛んでしまう
          if (e.key !== "Enter" || !(e.metaKey || e.ctrlKey)) return;
          if (e.nativeEvent.isComposing) return;
          e.preventDefault();
          if (canSend) onSend();
        }}
      />
      {listening && (
        // 聞こえている内容をその場で出す。無反応だと拾えているか分からない
        <div className="c-hearing">
          <span className="dot" aria-hidden="true" />
          {interim ? <span className="t">{interim}</span> : <span className="t idle">聞いています…</span>}
        </div>
      )}
      </div>
      {supported && (
        <button
          type="button"
          className={`c-mic ${listening ? "listening" : ""}`}
          onClick={toggle}
          aria-label={listening ? "音声入力を止める" : "音声で入力する"}
        >
          <IconMic />
        </button>
      )}
      <button
        type="button"
        className="c-send"
        onClick={onSend}
        disabled={!canSend}
        aria-label={sendLabel}
      >
        {sending ? (
          <span className="c-dots" aria-hidden="true"><i /><i /><i /></span>
        ) : (
          <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor"
               strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="19" x2="12" y2="5" />
            <polyline points="6 11 12 5 18 11" />
          </svg>
        )}
      </button>
    </div>
  );
}
