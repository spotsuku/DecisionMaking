"use client";

// 「それは相手が決めることでは?」と一度だけ尋ねる。
// 決断として登録してよいかを決めるのは本人なので、断定も強制もしない(INV-05)。

import { useState } from "react";
import { selfQuestions, whoDecides } from "@/lib/ownership";

export function OwnershipNote({
  question,
  ownerRole,
  onPick,
}: {
  question: string;
  ownerRole: string;
  /** 言い換えを選んだとき。問いと決める人を差し替える */
  onPick: (question: string, ownerRole: string) => void;
}) {
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;
  if (whoDecides(question, ownerRole) !== "OTHERS") return null;

  const who = ownerRole.trim() || "相手";
  return (
    <div className="callout">
      <strong>決めるのは、あなたですか?</strong>
      <div style={{ marginTop: 6, lineHeight: 1.8 }}>
        {who}が決めることなら、それは{who}の決断です。あなたが決められることに置き換えると、
        待っている間も動けます。
      </div>
      <div className="swap-list">
        {selfQuestions(ownerRole).map((q) => (
          <button key={q} onClick={() => onPick(q, "自分")}>{q}</button>
        ))}
      </div>
      <button className="btn ghost" style={{ marginTop: 6 }} onClick={() => setDismissed(true)}>
        いえ、自分が決めることです
      </button>
    </div>
  );
}
