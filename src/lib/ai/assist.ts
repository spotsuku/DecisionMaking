"use client";

// 画面から使う入口。方針は一つだけ:
//   ルールを先に実行して結果を確定させ、AIはその上に足すだけ。
//   AIが落ちても、遅くても、キーが無くても、ルールの結果がそのまま返る。

import { extractCandidates, type Candidate } from "../journal";
import { splitFreeText, type ChatTurn, type QuestionDef } from "../diagnosis";
import { nextPrompt, stageOf, type BrainstormState } from "../brainstorm";
import { mergeCandidates, mergeSplit } from "./merge";
import { isAiEnabled } from "../settings";
import type { AiRequest, AiEnvelope, BrainstormResult, ExtractResult, ReplyResult, SourcedCandidate, SplitResult } from "./types";

/** AIを待つ上限。これを超えたらルールの結果で進む */
const TIMEOUT_MS = 8000;

let aiDisabled = false;

async function post<T>(body: AiRequest): Promise<T | null> {
  if (aiDisabled || !isAiEnabled()) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch("/api/ai", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const env = (await res.json()) as AiEnvelope<T>;
    // 設定漏れなど、繰り返しても直らない失敗はその場で諦める
    if (res.status === 502) aiDisabled = true;
    return env.ok ? env.result : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** 書き出しから決断候補を出す。ルールの結果にAIの取りこぼし分を足す */
export async function assistExtract(text: string): Promise<SourcedCandidate[]> {
  const rules: Candidate[] = extractCandidates(text);
  const ai = await post<ExtractResult>({ task: "extract", text });
  return mergeCandidates(rules, ai?.candidates ?? []);
}

/** チャットの応答文をAIに言い換えてもらう。進行(次の一手)はルールが決めたまま */
export async function assistReply(
  def: QuestionDef,
  turn: ChatTurn,
  said: string
): Promise<string> {
  const ai = await post<ReplyResult>({
    task: "reply",
    question: def.text,
    purpose: def.purpose,
    said,
    intent: turn.kind,
    askingLabel: turn.kind === "FOLLOW_UP" ? def.parts.find((p) => p.key === turn.partKey)?.label : undefined,
  });
  const text = ai?.text?.trim();
  // 長すぎる・空は使わない。ルールの定型文へ戻す
  if (!text || text.length > 160) return turn.text;
  return text;
}

/** 自由文を欄へ振り分ける。AIの値が本人の発言に実在するときだけ採用する */
export async function assistSplit(
  def: QuestionDef,
  said: string
): Promise<{ values: Record<string, string>; source: "RULE" | "AI" }> {
  const rules = splitFreeText(def, said);
  if (def.parts.length === 1) return { values: rules, source: "RULE" };
  const ai = await post<SplitResult>({
    task: "split",
    said,
    parts: def.parts.map((p) => ({ key: p.key, label: p.label })),
  });
  if (!ai?.values) return { values: rules, source: "RULE" };
  return mergeSplit(said, rules, ai.values, def.parts.map((p) => p.key));
}

/**
 * 書き出しの対話で、次にアプリが返す文。
 * 何を聞くか(段階)はルールが決め、AIは文面だけを本人の話に寄せる。
 * 返らなければ定型文をそのまま使うので、会話は止まらない。
 */
export async function assistBrainstorm(state: BrainstormState): Promise<string> {
  const fallback = nextPrompt(state);
  const ai = await post<BrainstormResult>({
    task: "brainstorm",
    turns: state.turns,
    stage: stageOf(state),
    fallback,
    candidates: state.candidates.map((c) => c.text),
  });
  const text = ai?.text?.trim();
  if (!text || text.length > 200) return fallback;
  return text;
}
