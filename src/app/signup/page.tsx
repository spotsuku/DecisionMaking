"use client";

// 登録。診断まで進んだ人が「結果を残したい」と思った時にだけ来る画面。
// ここまでに書いたものは端末に残っているので、登録後にアカウントへ引き継ぐ。

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useAuth, sendMagicLink } from "@/lib/auth";
import { useDB } from "@/lib/useDB";
import { IconBack } from "@/components/icons";

function SignupInner() {
  const router = useRouter();
  const params = useSearchParams();
  const auth = useAuth();
  const db = useDB();
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 登録が済んだら、元いた画面へ戻す
  const next = params.get("next") || "/";
  useEffect(() => {
    if (auth.status === "SIGNED_IN") router.replace(next);
  }, [auth.status, next, router]);

  const submit = async () => {
    if (!email.trim() || busy) return;
    setBusy(true);
    setError(null);
    const redirect = `${window.location.origin}/signup?next=${encodeURIComponent(next)}`;
    const r = await sendMagicLink(email, redirect);
    setBusy(false);
    if (r.ok) setSent(true);
    else setError(r.error ?? "送信できませんでした");
  };

  const decisions = db.decisions.length;
  const journals = db.journal.length;

  return (
    <>
      <div className="appbar">
        <button className="back" onClick={() => router.back()} aria-label="戻る"><IconBack /></button>
        <span className="title">結果を保存する</span>
      </div>

      {sent ? (
        <>
          <div className="callout neutral" style={{ lineHeight: 1.9 }}>
            <strong>{email} にリンクを送りました</strong>
            <div style={{ marginTop: 6 }}>
              メールのリンクを開くと、この端末で保存できるようになります。
              届かないときは、迷惑メールをご確認ください。
            </div>
          </div>
          <button className="btn" style={{ marginTop: 12 }} onClick={() => setSent(false)}>
            別のアドレスで送り直す
          </button>
        </>
      ) : (
        <>
          <p style={{ fontSize: 15, fontWeight: 700, margin: "6px 0 2px", lineHeight: 1.7 }}>
            ここまでは登録なしで使えます。結果を残すときだけ、アカウントが要ります。
          </p>
          <p className="card-meta" style={{ marginTop: 0, lineHeight: 1.9 }}>
            いま書いたものは、この端末にだけ入っています。ブラウザのデータを消すと消え、
            他の端末からは見られません。登録すると、ここまでの
            {decisions > 0 && <strong>決断{decisions}件</strong>}
            {decisions > 0 && journals > 0 && "・"}
            {journals > 0 && <strong>書き出し{journals}件</strong>}
            {decisions === 0 && journals === 0 && "記録"}
            をそのまま引き継いで保存します。
          </p>

          <div className="field" style={{ marginTop: 16 }}>
            <label>メールアドレス</label>
            <input
              type="email"
              inputMode="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && void submit()}
              placeholder="you@example.com"
            />
          </div>
          <p className="card-meta" style={{ lineHeight: 1.8 }}>
            パスワードはありません。届いたメールのリンクを開くだけで登録が完了します。
          </p>

          {error && <div className="callout">{error}</div>}

          <button className="btn primary" style={{ marginTop: 12 }} onClick={() => void submit()} disabled={!email.trim() || busy}>
            {busy ? "送信しています…" : "リンクを受け取る"}
          </button>

          <p className="card-meta" style={{ marginTop: 16, lineHeight: 1.8 }}>
            登録すると<Link href="/legal/terms">利用規約</Link>と
            <Link href="/legal/privacy">プライバシーポリシー</Link>に同意したものとします。
          </p>
        </>
      )}
    </>
  );
}

export default function SignupPage() {
  return (
    <Suspense fallback={null}>
      <SignupInner />
    </Suspense>
  );
}
