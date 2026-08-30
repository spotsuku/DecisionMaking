// Anthropic API の呼び出し(サーバー側だけ)。
// APIキーはブラウザに出さない。SDKは足さず fetch で済ませる。

const API = "https://api.anthropic.com/v1/messages";
const VERSION = "2023-06-01";

/** 抽出・振り分けは安いモデル、会話の言い換えだけ品質を上げる */
export const MODELS = {
  cheap: "claude-haiku-4-5-20251001",
  chat: "claude-sonnet-5",
} as const;

export interface CallResult<T> {
  result: T;
  usage: { inputTokens: number; outputTokens: number };
}

/** 応答は JSON だけを期待する。前後に文が付いても最初のJSONを取り出す */
function parseJson<T>(text: string): T {
  const trimmed = text.trim().replace(/^```(?:json)?\s*|\s*```$/g, "");
  const start = trimmed.search(/[{[]/);
  if (start < 0) throw new Error("no json in response");
  return JSON.parse(trimmed.slice(start)) as T;
}

export async function callAnthropic<T>(opts: {
  model: string;
  system: string;
  user: string;
  maxTokens: number;
  signal?: AbortSignal;
}): Promise<CallResult<T>> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error("ANTHROPIC_API_KEY is not set");

  const res = await fetch(API, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": key,
      "anthropic-version": VERSION,
    },
    body: JSON.stringify({
      model: opts.model,
      max_tokens: opts.maxTokens,
      system: opts.system,
      messages: [{ role: "user", content: opts.user }],
    }),
    signal: opts.signal,
  });

  if (!res.ok) {
    throw new Error(`anthropic ${res.status}`);
  }
  const body = (await res.json()) as {
    content: { type: string; text?: string }[];
    usage: { input_tokens: number; output_tokens: number };
  };
  const text = body.content.filter((c) => c.type === "text").map((c) => c.text ?? "").join("");
  return {
    result: parseJson<T>(text),
    usage: { inputTokens: body.usage.input_tokens, outputTokens: body.usage.output_tokens },
  };
}
