"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { store } from "@/lib/store";
import { classifySafety } from "@/lib/diagnosis";
import { checkStart, recordOverage } from "@/lib/billing";
import { PLANS } from "@/lib/plan";
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

  const [gate, setGate] = useState<"UPGRADE" | "CHARGE" | "CAP" | null>(null);
  const [confirmedCharge, setConfirmedCharge] = useState(false);

  const safety = classifySafety(domain, `${title} ${question}`);

  const submit = () => {
    if (!question.trim()) return setError("何を決めるのかを一文で入力してください");
    if (!title.trim()) return setError("タイトルを入力してください");

    // 枠を超える登録は、金額を見せて本人が決めてから(黙って課金しない)
    const verdict = checkStart();
    if (!verdict.allowed) {
      if (verdict.reason === "UPGRADE_REQUIRED") return setGate("UPGRADE");
      return setGate("CAP");
    }
    if (verdict.charge > 0 && !confirmedCharge) return setGate("CHARGE");
    if (verdict.charge > 0) recordOverage(verdict.charge);

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

      {gate === "UPGRADE" && (
        <div className="callout">
          <strong>無料で作れる決断は{PLANS.FREE.decisionQuota}件までです</strong>
          <div style={{ marginTop: 6, lineHeight: 1.8 }}>
            続けるには月額プランへの変更が必要です。ここまでの記録は残ります。
          </div>
          <Link href="/plans"><span className="chip-btn" style={{ marginTop: 10 }}>プランを見る</span></Link>
        </div>
      )}

      {gate === "CHARGE" && (
        <div className="callout">
          <strong>今月の枠を使い切りました</strong>
          <div style={{ marginTop: 6, lineHeight: 1.8 }}>
            この決断を登録すると、追加で
            <strong> {checkStart().charge.toLocaleString()}円</strong>(税抜)が今月の請求に加算されます。
          </div>
          <div className="row2" style={{ marginTop: 10 }}>
            <button
              className="btn primary half"
              onClick={() => {
                setConfirmedCharge(true);
                setGate(null);
              }}
            >
              了解して登録する
            </button>
            <button className="btn half" onClick={() => setGate(null)}>やめる</button>
          </div>
        </div>
      )}

      {gate === "CAP" && (
        <div className="callout">
          <strong>今月の従量課金の上限に達しました</strong>
          <div style={{ marginTop: 6, lineHeight: 1.8 }}>
            これ以上は自動で課金されません。続けるには、設定で上限を引き上げてください。
            すでにある決断の診断・確定は今まで通り続けられます。
          </div>
          <Link href="/plans"><span className="chip-btn" style={{ marginTop: 10 }}>上限を変える</span></Link>
        </div>
      )}

      <button className="btn primary" style={{ marginTop: 10 }} onClick={submit}>
        {confirmedCharge ? `登録する(+${checkStart().charge.toLocaleString()}円)` : "登録して診断を始める"}
      </button>
    </>
  );
}
