"use client";

// 画面が落ちたときの受け皿。
//
// これが無いと、ブラウザの「このページを読み込めませんでした」が出るだけで、
// 書いた記録まで消えたように見える。記録は端末に残っていることを伝え、
// その場でやり直せるようにする。

import { useEffect } from "react";
import Link from "next/link";

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[app]", error);
  }, [error]);

  return (
    <>
      <div className="appbar">
        <span className="title">表示できませんでした</span>
      </div>
      <div className="callout" style={{ lineHeight: 1.9 }}>
        <strong>この画面を開けませんでした</strong>
        <div style={{ marginTop: 6 }}>
          記録は消えていません。この端末に残っています。
        </div>
      </div>
      <button className="btn primary" style={{ marginTop: 14 }} onClick={reset}>
        もう一度開く
      </button>
      <Link href="/">
        <button className="btn" style={{ marginTop: 6 }}>ホームへ戻る</button>
      </Link>
      {error.digest && (
        <p className="card-meta" style={{ marginTop: 16 }}>参照番号: {error.digest}</p>
      )}
    </>
  );
}
