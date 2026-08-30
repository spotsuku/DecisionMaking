"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { store } from "@/lib/store";
import { classifySafety } from "@/lib/diagnosis";
import { DOMAIN_LABEL, type DomainCode } from "@/lib/types";
import { IconBack } from "@/components/icons";

export default function NewDecisionPage() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [question, setQuestion] = useState("");
  const [ownerRole, setOwnerRole] = useState("");
  const [domain, setDomain] = useState<DomainCode>("WORK");
  const [dueAt, setDueAt] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [journalNote, setJournalNote] = useState("");

  // 書き出しから来た場合、その内容を種として引き継ぐ
  useEffect(() => {
    try {
      const seed = window.sessionStorage.getItem("dm-seed-question");
      const note = window.sessionStorage.getItem("dm-seed-note");
      if (seed) setQuestion(seed);
      if (note) setJournalNote(note);
      window.sessionStorage.removeItem("dm-seed-question");
      window.sessionStorage.removeItem("dm-seed-note");
    } catch {
      // sessionStorageが使えなくても登録はできる
    }
  }, []);

  const safety = classifySafety(domain, `${title} ${question}`);

  const submit = () => {
    if (!question.trim()) return setError("何を決めるのかを一文で入力してください");
    if (!title.trim()) return setError("タイトルを入力してください");
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
      <div className="appbar">
        <button className="back" onClick={() => router.back()} aria-label="戻る"><IconBack /></button>
        <span className="title">新しい決断</span>
      </div>
      <p className="card-meta" style={{ margin: "0 0 14px" }}>
        何を・誰が・いつまでに決めるかを一文にします。
      </p>

      {safety.level !== "NORMAL" && (
        <div className="callout">
          <strong>{safety.reason}</strong>
          <div>{safety.guidance}</div>
        </div>
      )}

      {journalNote && (
        <div className="callout neutral" style={{ maxHeight: 150, overflowY: "auto", whiteSpace: "pre-line" }}>
          <strong style={{ display: "block", marginBottom: 4 }}>さっき書き出した内容</strong>
          {journalNote}
        </div>
      )}

      <div className="field">
        <label>何を決めますか?<span className="req">*</span></label>
        <textarea rows={3} value={question} onChange={(e) => setQuestion(e.target.value)}
          placeholder={"例: 犬を家に迎えるかどうか\n例: どの物件に移転するか"} />
        <div className="hint">
          決めることが分かる一文で。選択肢はこのあと整理するので、今は絞れていなくて大丈夫です。
        </div>
      </div>

      <div className="field">
        <label>タイトル<span className="req">*</span></label>
        <input type="text" value={title} onChange={(e) => setTitle(e.target.value)}
          placeholder="例: エンジニア採用のチャネル選定" />
      </div>

      <div className="field">
        <label>誰が決めますか</label>
        <input type="text" value={ownerRole} onChange={(e) => setOwnerRole(e.target.value)}
          placeholder="例: 自分(最終決裁は役員)" />
      </div>

      <div className="form-grid">
        <div className="field">
          <label>決断期限</label>
          <input type="date" value={dueAt} onChange={(e) => setDueAt(e.target.value)} />
        </div>
        <div className="field">
          <label>領域</label>
          <select value={domain} onChange={(e) => setDomain(e.target.value as DomainCode)}>
            {Object.entries(DOMAIN_LABEL).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
        </div>
      </div>
      <div className="callout neutral" style={{ fontSize: 11.5 }}>
        医療・法律・投資は情報整理の支援に限定し、結論は専門家に確認します。
      </div>

      {error && <div className="callout">{error}</div>}

      <button className="btn primary" style={{ marginTop: 10 }} onClick={submit}>
        登録して診断を始める
      </button>
    </>
  );
}
