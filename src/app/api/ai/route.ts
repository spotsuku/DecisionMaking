// AI補助のエンドポイント。ブラウザにAPIキーを出さないためにサーバー側に置く。
//
// ここは「候補を作る」だけで、状態は一切変えない(6.1)。
// 失敗したらエラーを返し、呼び出し側はルールベースの結果で続行する。

import { NextResponse } from "next/server";
import { callAnthropic, MODELS } from "@/lib/ai/anthropic";
import { extractPrompt, replyPrompt, splitPrompt } from "@/lib/ai/prompts";
import type { AiRequest, ExtractResult, ReplyResult, SplitResult } from "@/lib/ai/types";

export const runtime = "nodejs";
export const maxDuration = 20;

/** 1回の投稿に載せられる本文の長さ。原価と滞留時間の上限 */
const MAX_INPUT_CHARS = 4000;

export async function POST(request: Request) {
  let body: AiRequest;
  try {
    body = (await request.json()) as AiRequest;
  } catch {
    return NextResponse.json({ ok: false, result: null, error: "bad request" }, { status: 400 });
  }

  const text =
    body.task === "extract" ? body.text : body.task === "reply" ? body.said : body.said;
  if (typeof text !== "string" || text.trim() === "") {
    return NextResponse.json({ ok: false, result: null, error: "empty" }, { status: 400 });
  }
  if (text.length > MAX_INPUT_CHARS) {
    return NextResponse.json({ ok: false, result: null, error: "too long" }, { status: 413 });
  }

  try {
    if (body.task === "extract") {
      const { system, user } = extractPrompt(body);
      const r = await callAnthropic<ExtractResult>({ model: MODELS.cheap, system, user, maxTokens: 800 });
      return NextResponse.json({ ok: true, result: r.result, usage: r.usage });
    }
    if (body.task === "reply") {
      const { system, user } = replyPrompt(body);
      const r = await callAnthropic<ReplyResult>({ model: MODELS.chat, system, user, maxTokens: 300 });
      return NextResponse.json({ ok: true, result: r.result, usage: r.usage });
    }
    if (body.task === "split") {
      const { system, user } = splitPrompt(body);
      const r = await callAnthropic<SplitResult>({ model: MODELS.cheap, system, user, maxTokens: 800 });
      return NextResponse.json({ ok: true, result: r.result, usage: r.usage });
    }
    return NextResponse.json({ ok: false, result: null, error: "unknown task" }, { status: 400 });
  } catch (e) {
    // 中身は伏せる。呼び出し側はルールベースで続行する
    console.error("[ai]", e instanceof Error ? e.message : e);
    return NextResponse.json({ ok: false, result: null, error: "unavailable" }, { status: 502 });
  }
}
