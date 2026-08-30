"use client";

// 音声入力(Web Speech API)。書き出しにも診断にも同じ実装を使う。
// 非対応ブラウザでは supported=false を返し、UI側でマイクを隠す。

import { useEffect, useRef, useState } from "react";

type SpeechRecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult:
    | ((e: {
        resultIndex: number;
        results: { length: number; [i: number]: { isFinal: boolean; 0: { transcript: string } } };
      }) => void)
    | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
  start: () => void;
  stop: () => void;
};

/** 認識結果を既存テキストへ追記する(話し言葉なので句点を補う) */
export function appendSpeech(current: string, spoken: string): string {
  const text = spoken.trim();
  if (!text) return current;
  const sep = current && !current.endsWith("\n") ? "\n" : "";
  return current + sep + text + "。";
}

export function useSpeechInput(onSpoken: (text: string) => void) {
  const [listening, setListening] = useState(false);
  const [supported, setSupported] = useState(true);
  // 話している最中の途中経過。確定前でも文字が出ないと、
  // 拾えているのか分からないまま喋り続けることになる
  const [interim, setInterim] = useState("");
  const recRef = useRef<SpeechRecognitionLike | null>(null);
  const onSpokenRef = useRef(onSpoken);
  onSpokenRef.current = onSpoken;

  useEffect(() => {
    const w = window as unknown as Record<string, unknown>;
    if (!w.SpeechRecognition && !w.webkitSpeechRecognition) setSupported(false);
    return () => recRef.current?.stop();
  }, []);

  const toggle = () => {
    if (listening) {
      recRef.current?.stop();
      setInterim("");
      setListening(false);
      return;
    }
    const w = window as unknown as Record<string, unknown>;
    const SR = (w.SpeechRecognition ?? w.webkitSpeechRecognition) as
      | (new () => SpeechRecognitionLike)
      | undefined;
    if (!SR) return;
    const rec = new SR();
    rec.lang = "ja-JP";
    rec.continuous = true;
    rec.interimResults = true;
    rec.onresult = (e) => {
      let spoken = "";
      let partial = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) spoken += e.results[i][0].transcript;
        else partial += e.results[i][0].transcript;
      }
      setInterim(partial);
      if (spoken) {
        setInterim("");
        onSpokenRef.current(spoken);
      }
    };
    rec.onend = () => {
      setInterim("");
      setListening(false);
    };
    rec.onerror = () => {
      setInterim("");
      setListening(false);
    };
    recRef.current = rec;
    rec.start();
    setListening(true);
  };

  const stop = () => {
    recRef.current?.stop();
    setInterim("");
    setListening(false);
  };

  return { listening, supported, toggle, stop, interim };
}
