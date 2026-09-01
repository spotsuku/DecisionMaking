"use client";

// 認証。
//
// 方針: 登録は「入口」ではなく「保存したくなった時」に置く。
//   書き出し・決断の登録・診断は、登録なしでそのまま使える(端末内に保存)。
//   決断を確定して結果を残す段になって、はじめてアカウントが要る。
//
// Supabase の設定が無い環境でも、全機能が端末内で動く。

import { useEffect, useState } from "react";
import { supabase } from "./db/client";

export interface Account {
  id: string;
  email: string | null;
}

export type AuthState =
  /** 起動直後。まだ分からない */
  | { status: "LOADING" }
  /** 認証基盤が無い(環境変数未設定)。端末内だけで動く */
  | { status: "DISABLED" }
  | { status: "ANONYMOUS" }
  | { status: "SIGNED_IN"; account: Account };

export function useAuth(): AuthState {
  const [state, setState] = useState<AuthState>({ status: "LOADING" });

  useEffect(() => {
    const sb = supabase();
    if (!sb) return setState({ status: "DISABLED" });

    let alive = true;
    void sb.auth.getSession().then(({ data }) => {
      if (!alive) return;
      const user = data.session?.user;
      setState(user ? { status: "SIGNED_IN", account: { id: user.id, email: user.email ?? null } }
                    : { status: "ANONYMOUS" });
    });

    const { data: sub } = sb.auth.onAuthStateChange((_event, session) => {
      const user = session?.user;
      setState(user ? { status: "SIGNED_IN", account: { id: user.id, email: user.email ?? null } }
                    : { status: "ANONYMOUS" });
    });
    return () => {
      alive = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  return state;
}

/** 保存にアカウントが必要か。認証基盤が無いときは求めない */
export function needsAccount(state: AuthState): boolean {
  return state.status === "ANONYMOUS";
}

/**
 * 送信できなかったときに本人へ出す文。
 *
 * Supabaseの生のメッセージは、そのまま出すと「HTTP 504」のような
 * 本人にはどうしようもない文字列になる。何が起きたのか・次にどうすればいいのかを
 * 日本語で言う。原因追跡のための符号は、末尾に小さく残す。
 */
export function sendErrorText(error: { message: string; status?: number }): string {
  const m = error.message ?? "";
  const status = error.status ?? 0;
  if (/rate limit|too many|over_email_send_rate/i.test(m)) {
    return "送信が続いています。少し待ってからお試しください。";
  }
  if (/invalid|valid email|email_address_invalid/i.test(m)) {
    return "メールアドレスの形式をご確認ください。";
  }
  // 504/タイムアウト = こちらのメール送信設定の問題。本人の操作では直らない
  if (status === 504 || status >= 500 || /timeout|deadline|gateway/i.test(m)) {
    return `いまメールを送れませんでした。こちらの送信設定の問題で、時間をおいても続くようなら直します。書いた記録はこの端末に残っているので、消えていません。(${status || "送信エラー"})`;
  }
  return `送信できませんでした。少し時間をおいてお試しください。(${m.slice(0, 60)})`;
}

/** メールにリンクを送る。パスワードは持たせない */
export async function sendMagicLink(email: string, redirectTo: string): Promise<{ ok: boolean; error?: string }> {
  const sb = supabase();
  if (!sb) return { ok: false, error: "認証が設定されていません" };
  try {
    const { error } = await sb.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: redirectTo },
    });
    if (error) return { ok: false, error: sendErrorText(error) };
    return { ok: true };
  } catch {
    return { ok: false, error: "通信できませんでした。電波の良い場所で、もう一度お試しください。" };
  }
}

export async function signOut(): Promise<void> {
  await supabase()?.auth.signOut();
}
