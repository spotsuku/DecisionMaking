"use client";

// 音声入力つきテキストエリア。診断の各記入欄で使う。

import { useRef } from "react";
import { useSpeechInput, appendSpeech } from "@/lib/useSpeech";
import { IconMic } from "@/components/icons";

export function VoiceTextarea({
  value,
  onChange,
  placeholder,
  rows = 4,
  autoFocus,
}: {
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  rows?: number;
  autoFocus?: boolean;
}) {
  const valueRef = useRef(value);
  valueRef.current = value;
  const { listening, supported, toggle, interim } = useSpeechInput((spoken) =>
    onChange(appendSpeech(valueRef.current, spoken))
  );

  return (
    <div className="voice-field">
      <textarea
        rows={rows}
        autoFocus={autoFocus}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
      {listening && (
        <div className="c-hearing">
          <span className="dot" aria-hidden="true" />
          {interim ? <span className="t">{interim}</span> : <span className="t idle">聞いています…</span>}
        </div>
      )}
      {supported && (
        <button
          type="button"
          className={`voice-mic ${listening ? "listening" : ""}`}
          onClick={toggle}
          aria-label={listening ? "音声入力を止める" : "音声で入力する"}
        >
          <IconMic />
        </button>
      )}
    </div>
  );
}
