// AIの呼び出し(サーバー側だけ)。APIキーはブラウザに出さない。
//
// 既定は OpenAI。ANTHROPIC_API_KEY だけを設定した環境では Anthropic を使う。
// どちらも無ければ呼び出し側がルールベースへ落ちるので、アプリは動き続ける。
//
// モデルIDは環境変数で差し替えられる。用途で使い分ける:
//   cheap … 抽出・欄への振り分け。件数が出るので安いモデル
//   chat  … 会話の言い換え。ここだけ体験に直結するので品質を上げる

export type Provider = "openai" | "anthropic";

export interface CallResult<T> {
  result: T;
  usage: { inputTokens: number; outputTokens: number };
  model: string;
}

export function activeProvider(): Provider | null {
  if (process.env.OPENAI_API_KEY) return "openai";
  if (process.env.ANTHROPIC_API_KEY) return "anthropic";
  return null;
}

export function modelFor(kind: "cheap" | "chat"): string {
  if (activeProvider() === "anthropic") {
    return kind === "chat"
      ? process.env.ANTHROPIC_MODEL_CHAT ?? "claude-sonnet-5"
      : process.env.ANTHROPIC_MODEL_CHEAP ?? "claude-haiku-4-5-20251001";
  }
  return kind === "chat"
    ? process.env.OPENAI_MODEL_CHAT ?? "gpt-4.1"
    : process.env.OPENAI_MODEL_CHEAP ?? "gpt-4.1-mini";
}

/** 応答はJSONだけを期待する。前後に文が付いても最初のJSONを取り出す */
function parseJson<T>(text: string): T {
  const trimmed = text.trim().replace(/^```(?:json)?\s*|\s*```$/g, "");
  const start = trimmed.search(/[{[]/);
  if (start < 0) throw new Error("no json in response");
  return JSON.parse(trimmed.slice(start)) as T;
}

async function callOpenAI<T>(o: {
  model: string; system: string; user: string; maxTokens: number; signal?: AbortSignal;
}): Promise<CallResult<T>> {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: o.model,
      max_completion_tokens: o.maxTokens,
      // 構造を外すと画面が壊れるので、JSONで返させる
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: o.system },
        { role: "user", content: o.user },
      ],
    }),
    signal: o.signal,
  });
  if (!res.ok) throw new Error(`openai ${res.status}`);
  const body = (await res.json()) as {
    choices: { message: { content: string | null } }[];
    usage?: { prompt_tokens?: number; completion_tokens?: number };
  };
  return {
    result: parseJson<T>(body.choices[0]?.message?.content ?? ""),
    usage: {
      inputTokens: body.usage?.prompt_tokens ?? 0,
      outputTokens: body.usage?.completion_tokens ?? 0,
    },
    model: o.model,
  };
}

async function callAnthropic<T>(o: {
  model: string; system: string; user: string; maxTokens: number; signal?: AbortSignal;
}): Promise<CallResult<T>> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY ?? "",
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: o.model,
      max_tokens: o.maxTokens,
      system: o.system,
      messages: [{ role: "user", content: o.user }],
    }),
    signal: o.signal,
  });
  if (!res.ok) throw new Error(`anthropic ${res.status}`);
  const body = (await res.json()) as {
    content: { type: string; text?: string }[];
    usage: { input_tokens: number; output_tokens: number };
  };
  const text = body.content.filter((c) => c.type === "text").map((c) => c.text ?? "").join("");
  return {
    result: parseJson<T>(text),
    usage: { inputTokens: body.usage.input_tokens, outputTokens: body.usage.output_tokens },
    model: o.model,
  };
}

export async function callModel<T>(opts: {
  kind: "cheap" | "chat";
  system: string;
  user: string;
  maxTokens: number;
  signal?: AbortSignal;
}): Promise<CallResult<T>> {
  const provider = activeProvider();
  if (!provider) throw new Error("APIキーが設定されていません");
  const args = { ...opts, model: modelFor(opts.kind) };
  return provider === "openai" ? callOpenAI<T>(args) : callAnthropic<T>(args);
}

/** 会話の1往復。role はそのままAPIへ渡す */
export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

async function chatOpenAI(o: { model: string; messages: ChatTurn[]; maxTokens: number; signal?: AbortSignal }) {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    // system も response_format も付けない。会話だけを渡す
    body: JSON.stringify({ model: o.model, max_completion_tokens: o.maxTokens, messages: o.messages }),
    signal: o.signal,
  });
  if (!res.ok) throw new Error(`openai ${res.status}`);
  const body = (await res.json()) as {
    choices: { message: { content: string | null } }[];
    usage?: { prompt_tokens?: number; completion_tokens?: number };
  };
  return {
    text: (body.choices[0]?.message?.content ?? "").trim(),
    usage: {
      inputTokens: body.usage?.prompt_tokens ?? 0,
      outputTokens: body.usage?.completion_tokens ?? 0,
    },
    model: o.model,
  };
}

async function chatAnthropic(o: { model: string; messages: ChatTurn[]; maxTokens: number; signal?: AbortSignal }) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY ?? "",
      "anthropic-version": "2023-06-01",
    },
    // system は付けない
    body: JSON.stringify({ model: o.model, max_tokens: o.maxTokens, messages: o.messages }),
    signal: o.signal,
  });
  if (!res.ok) throw new Error(`anthropic ${res.status}`);
  const body = (await res.json()) as {
    content: { type: string; text?: string }[];
    usage: { input_tokens: number; output_tokens: number };
  };
  return {
    text: body.content.filter((c) => c.type === "text").map((c) => c.text ?? "").join("").trim(),
    usage: { inputTokens: body.usage.input_tokens, outputTokens: body.usage.output_tokens },
    model: o.model,
  };
}

/**
 * 指示を付けない会話。
 *
 * system も JSON形式の指定も付けず、やりとりだけを渡して素の応答を受け取る。
 * 書き出しの段階でこちらが役や目的を書くと、そのぶん会話が誘導される
 * ── 実際に、型の反復とカウンセリング化を2度招いた。
 */
export async function callChat(opts: {
  kind: "cheap" | "chat";
  messages: ChatTurn[];
  maxTokens: number;
  signal?: AbortSignal;
}): Promise<{ text: string; usage: { inputTokens: number; outputTokens: number }; model: string }> {
  const provider = activeProvider();
  if (!provider) throw new Error("APIキーが設定されていません");
  const args = { model: modelFor(opts.kind), messages: opts.messages, maxTokens: opts.maxTokens, signal: opts.signal };
  return provider === "openai" ? chatOpenAI(args) : chatAnthropic(args);
}
