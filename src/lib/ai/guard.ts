// AIエンドポイントの濫用対策。
//
// 有料の鍵がぶら下がっているので、素通しにすると第三者にトークンを焼かれ、
// 予算上限に達して実ユーザーのAIが止まる。
// 厳密な認証は置かない(登録なしで使えることが商品性のため)が、
// 「アプリの画面から来たリクエストか」と「短時間に叩きすぎていないか」は見る。

/** 1つのIPが1分間に投げられる回数。人が会話する速度を大きく超えない値 */
const PER_MINUTE = 20;
const WINDOW_MS = 60_000;

const hits = new Map<string, { count: number; resetAt: number }>();

/** 古い記録を捨てる。放っておくとインスタンスの寿命だけ増え続ける */
function sweep(now: number) {
  if (hits.size < 5000) return;
  for (const [key, v] of hits) if (v.resetAt <= now) hits.delete(key);
}

export function clientKey(request: Request): string {
  const fwd = request.headers.get("x-forwarded-for");
  return fwd?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "unknown";
}

export function rateLimit(request: Request): { ok: boolean; retryAfter: number } {
  const now = Date.now();
  sweep(now);
  const key = clientKey(request);
  const entry = hits.get(key);
  if (!entry || entry.resetAt <= now) {
    hits.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return { ok: true, retryAfter: 0 };
  }
  entry.count += 1;
  if (entry.count > PER_MINUTE) {
    return { ok: false, retryAfter: Math.ceil((entry.resetAt - now) / 1000) };
  }
  return { ok: true, retryAfter: 0 };
}

/**
 * このアプリの画面から来たリクエストかを見る。
 * ブラウザは同一オリジンのfetchに Origin か Referer を付ける。
 * 偽装は可能なので、これは施錠ではなく「素通りさせない」程度の意味。
 */
export function sameOrigin(request: Request): boolean {
  const self = new URL(request.url).host;
  const origin = request.headers.get("origin");
  if (origin) {
    try {
      return new URL(origin).host === self;
    } catch {
      return false;
    }
  }
  const referer = request.headers.get("referer");
  if (referer) {
    try {
      return new URL(referer).host === self;
    } catch {
      return false;
    }
  }
  // どちらも無いのは、ブラウザ以外からの直接呼び出し
  return false;
}
