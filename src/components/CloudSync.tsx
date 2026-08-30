"use client";

// ログインしたら、端末に貯めたものをアカウントへ引き継ぐ。
//
// 登録なしで書いたものが消えると、このアプリで一番大事な「決めずに置いていること」の
// 蓄積が失われる。だから登録直後にまず端末→クラウドへ送り、次にクラウド→端末を
// 取り込んで合わせる。同じidは端末側を残す(いま画面で見ているものを消さない)。

import { useEffect, useRef } from "react";
import { useAuth } from "@/lib/auth";
import { store } from "@/lib/store";
import { push, pull, mergeDB } from "@/lib/db/sync";

export function CloudSync() {
  const auth = useAuth();
  const syncedFor = useRef<string | null>(null);

  useEffect(() => {
    if (auth.status !== "SIGNED_IN") return;
    const userId = auth.account.id;
    if (syncedFor.current === userId) return;
    syncedFor.current = userId;

    void (async () => {
      try {
        // 1) 端末にあるものを先に送る(登録前に書いたものを守る)
        const local = store.getSnapshot();
        const pushed = await push(local, userId);
        if (pushed.errors.length > 0) console.warn("[sync] push", pushed.errors);

        // 2) 他の端末にあるものを取り込む
        const { db: remote, result } = await pull(userId);
        if (result.errors.length > 0) console.warn("[sync] pull", result.errors);
        if (result.pulled > 0) store.replaceAll(mergeDB(store.getSnapshot(), remote));
      } catch (e) {
        // 同期に失敗しても、端末内のデータで動き続ける
        console.warn("[sync]", e instanceof Error ? e.message : e);
      }
    })();
  }, [auth]);

  return null;
}
