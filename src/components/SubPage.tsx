"use client";

// 決断配下のサブページ共通枠(戻る+タイトル)

import { useRouter } from "next/navigation";
import { useDecision } from "@/lib/useDecision";
import { IconBack } from "@/components/icons";
import type { Decision, DecisionVersion } from "@/lib/types";

export function SubPage({
  title,
  children,
}: {
  title: string;
  children: (decision: Decision, version: DecisionVersion) => React.ReactNode;
}) {
  const router = useRouter();
  const { decision, version } = useDecision();
  if (!decision || !version) return null;
  return (
    <>
      <div className="appbar">
        <button className="back" onClick={() => router.push(`/decisions/${decision.id}`)} aria-label="戻る">
          <IconBack />
        </button>
        <span className="title">{title}</span>
      </div>
      <div className="card-meta" style={{ marginBottom: 12 }}>{decision.title}</div>
      {children(decision, version)}
    </>
  );
}
