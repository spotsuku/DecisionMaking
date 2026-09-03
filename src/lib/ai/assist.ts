"use client";

// 画面から使う入口。方針は一つだけ:
//   ルールを先に実行して結果を確定させ、AIはその上に足すだけ。
//   AIが落ちても、遅くても、キーが無くても、ルールの結果がそのまま返る。

import { extractCandidates, type Candidate } from "../journal";
import { splitFreeText, type ChatTurn, type QuestionDef } from "../diagnosis";
import type { BrainstormState, Prompt } from "../brainstorm";
import { checkReply, shouldReject } from "./replyCheck";
import { mergeCandidates, mergeSplit } from "./merge";
import { isAiEnabled } from "../settings";
import type { AiRequest, AiEnvelope, BrainstormResult, ExtractResult, ReplyResult, SourcedCandidate, SplitResult } from "./types";

/** AIを待つ上限。これを超えたらルールの結果で進む */
const TIMEOUT_MS = 8000;

/**
 * 502が返ったあと、しばらくAIを呼ばない時刻。
 *
 * 以前はページを開いている間ずっと諦めていた。設定漏れなら正しいが、
 * 一時的な失敗のときも復帰せず、以降ずっと定型文だけの会話になっていた。
 */
let quietUntil = 0;
const QUIET_MS = 60_000;

async function post<T>(body: AiRequest): Promise<T | null> {
  if (Date.now() < quietUntil || !isAiEnabled()) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch("/api/ai", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    // 混みすぎ(429)は一時的なので、次の発言では普通に呼ぶ。
    // 502は続けて叩いても直りにくいので少し休むが、諦めはしない
    if (res.status === 502) quietUntil = Date.now() + QUIET_MS;
    if (res.status === 429 || res.status === 403) return null;
    const env = (await res.json()) as AiEnvelope<T>;
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
 * 書き出しの会話。ここはAIに任せる ── 台本どおりに問いを並べると、
 * 本人が話したいことから引き剥がしてしまうため。
 *
 * 返らなかったときは null を返す。定型文で代役を立てない。
 * 代役は本人の発言と無関係な問いを並べるので、会話が支離滅裂になる。
 * 実際に「他にも引っかかっていることは?」→「返事を保留しているものは?」と続けて、
 * 本人から「なんの話?」と返ってきた。答えられないなら、答えられないと出す。
 */
export async function assistBrainstorm(
  state: BrainstormState,
  fallback: Prompt,
  said: string
): Promise<string | null> {
  const ai = await post<BrainstormResult>({
    task: "brainstorm",
    turns: state.turns,
    fallback: fallback.text,
  });
  const text = ai?.text?.trim();
  if (!text) return null;

  // 画面が壊れるものだけ差し戻す。文体の崩れは記録に留める ──
  // 差し戻すと会話が切れて定型文に落ち、かえって不自然になるため
  const lastApp = [...state.turns].reverse().find((t) => t.from === "APP")?.text;
  const issue = checkReply(text, said, lastApp);
  if (issue) console.warn("[ai] 応答の崩れ", issue.code, issue.detail);
  return shouldReject(issue) ? null : text;
}
