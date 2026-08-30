// AI補助の入出力。設計書6.1「LLMは候補提示のみ、状態は確定しない」に従い、
// どの結果も「提案」であり、保存されるのは本人が確認したものだけ(INV-05)。

import type { Candidate } from "../journal";

export type AiTask = "extract" | "reply" | "split" | "brainstorm";

/** どこから出てきた提案かを画面で区別できるようにする */
export type Source = "RULE" | "AI";

export interface SourcedCandidate extends Candidate {
  source: Source;
}

export interface ExtractRequest { task: "extract"; text: string }
export interface ExtractResult { candidates: { text: string; kind: "QUESTION" | "SIGNAL" }[] }

export interface ReplyRequest {
  task: "reply";
  /** 質問の見出し */
  question: string;
  /** その質問で何を確定したいのか */
  purpose: string;
  /** 本人の直前の返事 */
  said: string;
  /** ルールが決めた次の一手。AIはこれを言い換えるだけで、進行は変えない */
  intent: "REPHRASE" | "FOLLOW_UP" | "FILED" | "SKIP";
  /** FOLLOW_UP のときに聞きたい欄 */
  askingLabel?: string;
}
export interface ReplyResult { text: string }

export interface SplitRequest {
  task: "split";
  said: string;
  parts: { key: string; label: string }[];
}
export interface SplitResult { values: Record<string, string> }

export interface BrainstormRequest {
  task: "brainstorm";
  /** これまでのやりとり(古い順) */
  turns: { from: "USER" | "APP"; text: string }[];
  /** この問いで何を確かめたいか。AIはこの意図の範囲でだけ言い換える */
  intent: string;
  /** ルールの定型文。使えないときはこれに戻す */
  fallback: string;
  /** すでに確かめたこと。二度聞かせないために渡す */
  covered: string[];
  /** ここまでに見つかっている候補 */
  candidates: string[];
}
export interface BrainstormResult { text: string }

export type AiRequest = ExtractRequest | ReplyRequest | SplitRequest | BrainstormRequest;

export interface AiEnvelope<T> {
  ok: boolean;
  result: T | null;
  /** 使ったトークン。利用状況の計測に使う */
  usage?: { inputTokens: number; outputTokens: number };
  error?: string;
}
