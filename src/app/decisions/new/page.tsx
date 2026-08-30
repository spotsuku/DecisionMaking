"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { store } from "@/lib/store";
import { classifySafety } from "@/lib/diagnosis";
import { DOMAIN_LABEL, type DomainCode } from "@/lib/types";

export default function NewDecisionPage() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [question, setQuestion] = useState("");
  const [ownerRole, setOwnerRole] = useState("");
  const [domain, setDomain] = useState<DomainCode>("WORK");
  const [dueAt, setDueAt] = useState("");
  const [error, setError] = useState<string | null>(null);

  const safety = classifySafety(domain, `${title} ${question}`);

  const submit = () => {
    if (!title.trim()) return setError("タイトルを入力してください");
    if (!question.trim()) return setError("「AかBか」の一文を入力してください");
    const { decision } = store.createDecision({
      title: title.trim(),
      question: question.trim(),
      ownerRole: ownerRole.trim(),
      domain,
      dueAt: dueAt ? new Date(dueAt).toISOString() : null,
    });
    router.push(`/decisions/${decision.id}`);
  };

  return (
    <>
      <h1 className="page-title">新しい決断</h1>
      <p className="page-sub">何を・誰が・いつまでに決めるかを一文にします(S1 Frame)。</p>

      {safety.level !== "NORMAL" && (
        <div className="callout">
          <strong>{safety.reason}</strong>
          <div>{safety.guidance}</div>
        </div>
      )}

      <div className="field">
        <label>タイトル<span className="req">*</span></label>
        <input type="text" value={title} onChange={(e) => setTitle(e.target.value)}
          placeholder="例: エンジニア採用のチャネル選定" />
      </div>

      <div className="field">
        <label>何を決めますか? 「AかBか」の一文で<span className="req">*</span></label>
        <textarea value={question} onChange={(e) => setQuestion(e.target.value)}
          placeholder="例: 媒体経由の採用を続けるか、紹介採用へ集中するか" />
        <div className="hint">「検討している」「様子を見ている」は問いではありません。選択肢が見える形にします。</div>
      </div>

      <div className="form-grid">
        <div className="field">
          <label>誰が決めますか(決定主体)</label>
          <input type="text" value={ownerRole} onChange={(e) => setOwnerRole(e.target.value)}
            placeholder="例: 自分(最終決裁は役員)" />
        </div>
        <div className="field">
          <label>いつまでに決めますか(決断期限)</label>
          <input type="date" value={dueAt} onChange={(e) => setDueAt(e.target.value)} />
        </div>
      </div>

      <div className="field">
        <label>領域</label>
        <select value={domain} onChange={(e) => setDomain(e.target.value as DomainCode)}>
          {Object.entries(DOMAIN_LABEL).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
        <div className="hint">医療・法律・投資は情報整理の支援に限定し、結論は専門家に確認します。</div>
      </div>

      {error && <div className="callout">{error}</div>}

      <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
        <button className="btn accent" onClick={submit}>登録して診断を始める</button>
        <button className="btn ghost" onClick={() => router.push("/")}>戻る</button>
      </div>
    </>
  );
}
