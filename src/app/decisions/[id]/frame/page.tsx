"use client";

// 「何を・誰が・いつまでに決めるか」を決める画面。
//
// ハブの「問いと期限を決める」を押すと診断のチャットへ飛んでいたが、
// ボタンが約束したことと着地が違う。しかも問いはもう入っているのに
// 「何を決める話ですか?」と聞き直していた。押した通りの画面を出す。

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useDecision } from "@/lib/useDecision";
import { store } from "@/lib/store";
import { IconBack } from "@/components/icons";

export default function FramePage() {
  const router = useRouter();
  const { decision, version } = useDecision();
  const [question, setQuestion] = useState(version?.question ?? "");
  const [ownerRole, setOwnerRole] = useState(version?.ownerRole ?? "");
  const [dueAt, setDueAt] = useState(decision?.dueAt ? decision.dueAt.slice(0, 10) : "");
  const [error, setError] = useState<string | null>(null);

  if (!decision || !version) return null;
  const hub = `/decisions/${decision.id}`;
  const locked = !!version.committedAt;

  const save = () => {
    if (!question.trim()) return setError("何を決めるのかを一文で入力してください");
    if (!ownerRole.trim()) return setError("誰が決めるのかを入力してください");
    if (!dueAt) return setError("いつまでに決めるのかを入力してください");
    store.updateFrame(decision.id, {
      question: question.trim(),
      ownerRole: ownerRole.trim(),
      dueAt: new Date(dueAt).toISOString(),
    });
    // ここが埋まったら診断へ進める
    router.push(`${hub}/diagnose`);
  };

  return (
    <>
      <div className="appbar">
        <button className="back" onClick={() => router.push(hub)} aria-label="戻る"><IconBack /></button>
        <span className="title">何を・誰が・いつまでに</span>
      </div>

      {locked ? (
        <div className="callout neutral">このversionは確定済みです。ここは変更できません。</div>
      ) : (
        <>
          <p className="card-meta" style={{ lineHeight: 1.9, marginTop: 2 }}>
            この3つが決まると、診断に進めます。あとから変えられます。
          </p>

          <div className="field" style={{ marginTop: 14 }}>
            <label>何を決めますか?<span className="req">*</span></label>
            <textarea rows={3} value={question} onChange={(e) => setQuestion(e.target.value)}
              placeholder="例: 増田石油さんに出資のリマインドをするかどうか" />
            <div className="hint">決めることが分かる一文で。選択肢はこのあと整理します。</div>
          </div>

          <div className="field" style={{ marginTop: 14 }}>
            <label>誰が決めますか<span className="req">*</span></label>
            <input type="text" value={ownerRole} onChange={(e) => setOwnerRole(e.target.value)}
              placeholder="例: 自分 / 上司と合議 / 決裁は役員" />
          </div>

          <div className="field" style={{ marginTop: 14 }}>
            <label>いつまでに決めますか<span className="req">*</span></label>
            <input type="date" value={dueAt} onChange={(e) => setDueAt(e.target.value)} />
            <div className="hint">この日を過ぎても決まっていなければ、ホームに出てきます。</div>
          </div>

          {error && <div className="callout">{error}</div>}

          <button className="btn primary" style={{ marginTop: 16 }} onClick={save}>
            決めて診断へ進む
          </button>
          <button className="btn ghost" style={{ marginTop: 4 }} onClick={() => router.push(hub)}>
            あとにする
          </button>
        </>
      )}
    </>
  );
}
