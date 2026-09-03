// AI補助のエンドポイント。ブラウザにAPIキーを出さないためにサーバー側に置く。
//
// ここは「候補を作る」だけで、状態は一切変えない(6.1)。
// 失敗したらエラーを返し、呼び出し側はルールベースの結果で続行する。

import { NextResponse } from "next/server";
import { activeProvider, callChat, callModel, modelFor } from "@/lib/ai/provider";
import { toChatMessages } from "@/lib/ai/chat";
import { rateLimit, sameOrigin } from "@/lib/ai/guard";
import { extractPrompt, replyPrompt, splitPrompt } from "@/lib/ai/prompts";
import type { AiRequest, BrainstormResult, ExtractResult, ReplyResult, SplitResult } from "@/lib/ai/types";

export const runtime = "nodejs";
export const maxDuration = 20;

/**
 * 設定の確認用。鍵そのものは返さず、「どの提供元が有効か」だけを返す。
 * デプロイ後に環境変数が効いているかを、鍵を触らずに確かめられる。
 */
export async function GET(request: Request) {
  const provider = activeProvider();
  const config = {
    provider,
    models: provider ? { chat: modelFor("chat"), cheap: modelFor("cheap") } : null,
    // 提供元が無くても、ルールベースで全機能が動く
    fallback: provider === null ? "rule-based" : null,
  };

  // ?probe=1 で実際に1回呼ぶ。設定だけ合っていて実は返ってこない、を見分ける。
  // 課金が発生するので回数制限をかける
  if (new URL(request.url).searchParams.get("probe") !== "1") {
    return NextResponse.json(config);
  }
  if (!provider) return NextResponse.json({ ...config, probe: { ok: false, error: "APIキーが未設定です" } });
  const limit = rateLimit(request);
  if (!limit.ok) {
    return NextResponse.json({ ...config, probe: { ok: false, error: "rate_limited" } }, { status: 429 });
  }

  const started = Date.now();
  try {
    const r = await callModel<{ ok: boolean }>({
      kind: "cheap",
      system: 'JSONで {"ok":true} とだけ返してください。',
      user: "ping",
      maxTokens: 16,
    });
    return NextResponse.json({
      ...config,
      probe: { ok: true, model: r.model, ms: Date.now() - started, usage: r.usage },
    });
  } catch (e) {
    // 原因が分からないと直せないので、ここだけはメッセージを返す。鍵は含まれない
    return NextResponse.json({
      ...config,
      probe: { ok: false, ms: Date.now() - started, error: e instanceof Error ? e.message : String(e) },
    });
  }
}

/** 1回の投稿に載せられる本文の長さ。原価と滞留時間の上限 */
const MAX_INPUT_CHARS = 4000;

export async function POST(request: Request) {
  // 有料の鍵がぶら下がっているので、素通しにしない
  if (!sameOrigin(request)) {
    return NextResponse.json({ ok: false, result: null, error: "forbidden" }, { status: 403 });
  }
  const limit = rateLimit(request);
  if (!limit.ok) {
    return NextResponse.json(
      { ok: false, result: null, error: "rate_limited" },
      { status: 429, headers: { "retry-after": String(limit.retryAfter) } }
    );
  }

  let body: AiRequest;
  try {
    body = (await request.json()) as AiRequest;
  } catch {
    return NextResponse.json({ ok: false, result: null, error: "bad request" }, { status: 400 });
  }

  const text =
    body.task === "extract"
      ? body.text
      : body.task === "brainstorm"
      ? body.turns.map((t) => t.text).join("\n")
      : body.said;
  if (typeof text !== "string" || text.trim() === "") {
    return NextResponse.json({ ok: false, result: null, error: "empty" }, { status: 400 });
  }
  if (text.length > MAX_INPUT_CHARS) {
    return NextResponse.json({ ok: false, result: null, error: "too long" }, { status: 413 });
  }

  try {
    if (body.task === "extract") {
      const { system, user } = extractPrompt(body);
      const r = await callModel<ExtractResult>({ kind: "cheap", system, user, maxTokens: 800 });
      return NextResponse.json({ ok: true, result: r.result, usage: r.usage });
    }
    if (body.task === "reply") {
      const { system, user } = replyPrompt(body);
      const r = await callModel<ReplyResult>({ kind: "chat", system, user, maxTokens: 300 });
      return NextResponse.json({ ok: true, result: r.result, usage: r.usage });
    }
    if (body.task === "brainstorm") {
      // 指示は付けない。やりとりだけを渡して、素の応答を返す
      const r = await callChat({ kind: "chat", messages: toChatMessages(body.turns), maxTokens: 400 });
      const result: BrainstormResult = { text: r.text };
      return NextResponse.json({ ok: true, result, usage: r.usage });
    }
    if (body.task === "split") {
      const { system, user } = splitPrompt(body);
      const r = await callModel<SplitResult>({ kind: "cheap", system, user, maxTokens: 800 });
      return NextResponse.json({ ok: true, result: r.result, usage: r.usage });
    }
    return NextResponse.json({ ok: false, result: null, error: "unknown task" }, { status: 400 });
  } catch (e) {
    // 中身は伏せる。呼び出し側はルールベースで続行する
    console.error("[ai]", e instanceof Error ? e.message : e);
    return NextResponse.json({ ok: false, result: null, error: "unavailable" }, { status: 502 });
  }
}
