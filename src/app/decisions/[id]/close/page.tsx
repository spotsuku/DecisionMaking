"use client";

// 決断を閉じる画面。
//
// 撤退は失敗ではなく正式な選択(非目標1.3)。window.promptで理由を1行取るだけだと、
// 「やめた」という事実しか残らず、あとで何も学べない。
// 何をやめたのか・なぜか・それで何を守れたのか・次に活かすことを、
// 完了と同じ重さで記録する(INV-01: 記録は消えない)。

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useDecision } from "@/lib/useDecision";
import { store } from "@/lib/store";
import { VoiceTextarea } from "@/components/VoiceTextarea";
import { DOMAIN_LABEL, STATE_LABEL, type CloseKind } from "@/lib/types";
import { IconBack } from "@/components/icons";

const COPY: Record<CloseKind, {
  title: string;
  lead: string;
  reasonLabel: string;
  reasonPlaceholder: string;
  protectedLabel: string;
  protectedPlaceholder: string;
  confirm: string;
}> = {
  COMPLETED: {
    title: "やり切ったことにする",
    lead: "この決断は、決めて動いたところまで終わりました。何をもって終わりとするかを残します。",
    reasonLabel: "どうなったから終わりにしますか",
    reasonPlaceholder: "例: 小太郎を迎えて、世話の分担も回り始めた",
    protectedLabel: "この決断で守れたもの",
    protectedPlaceholder: "例: 家族で過ごす時間が増えた",
    confirm: "やり切ったことにする",
  },
  WITHDRAWN: {
    title: "意図してやめる",
    lead:
      "やめることも決断です。ずるずる放置したのではなく、あなたが選んで手を引いた、という記録にします。",
    reasonLabel: "なぜ、やめると決めましたか",
    reasonPlaceholder: "例: 妻の在宅勤務が終わり、平日の世話をする人がいなくなったから",
    protectedLabel: "やめたことで守れたもの",
    protectedPlaceholder: "例: 世話が回らずに家族に無理をさせる事態を避けられた",
    confirm: "意図的な撤退として記録する",
  },
};

export default function ClosePage() {
  const router = useRouter();
  const { decision, version } = useDecision();
  const [kind, setKind] = useState<CloseKind | null>(null);
  const [reason, setReason] = useState("");
  const [kept, setKept] = useState("");
  const [learning, setLearning] = useState("");
  const [error, setError] = useState<string | null>(null);

  if (!decision || !version) return null;

  const hub = `/decisions/${decision.id}`;
  const copy = kind ? COPY[kind] : null;
  const canSubmit = !!kind && reason.trim() !== "";

  const submit = () => {
    if (!kind || !canSubmit) return;
    try {
      store.closeDecision(decision.id, reason.trim(), {
        kind,
        protected: kept,
        learning,
      });
      router.push(hub);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <>
      <div className="appbar">
        <button className="back" onClick={() => (kind ? setKind(null) : router.push(hub))} aria-label="戻る">
          <IconBack />
        </button>
        <span className="title">{copy ? copy.title : "この決断を閉じる"}</span>
      </div>

      <div className="chips">
        <span className="badge inverse">{STATE_LABEL[decision.status]}</span>
        <span className="badge soft">{DOMAIN_LABEL[decision.domain]}</span>
      </div>
      <p style={{ fontSize: 15, fontWeight: 700, margin: "10px 0 2px" }}>{decision.title}</p>
      <p className="card-meta" style={{ marginTop: 0 }}>{version.question}</p>

      {error && <div className="callout"><strong>閉じられませんでした</strong><div>{error}</div></div>}

      {!kind ? (
        <>
          <div className="section">どちらですか?</div>
          <button className="choice-card" onClick={() => setKind("COMPLETED")}>
            <span className="ct">やり切った</span>
            <span className="cd">決めて動き、この件は終わった。</span>
          </button>
          <button className="choice-card" onClick={() => setKind("WITHDRAWN")}>
            <span className="ct">意図してやめる</span>
            <span className="cd">
              状況が変わった、前提が崩れた、優先順位が下がった。
              自分で選んで手を引く。
            </span>
          </button>
          <p className="card-meta" style={{ marginTop: 14, lineHeight: 1.8 }}>
            どちらを選んでも、ここまでの診断・材料・履歴は消えません。あとから読み返せます。
          </p>
        </>
      ) : (
        <>
          <div className="callout neutral" style={{ lineHeight: 1.8 }}>{copy!.lead}</div>

          <div className="field" style={{ marginTop: 14 }}>
            <label>{copy!.reasonLabel}</label>
            <VoiceTextarea
              rows={4}
              autoFocus
              value={reason}
              onChange={setReason}
              placeholder={copy!.reasonPlaceholder}
            />
          </div>

          <div className="field" style={{ marginTop: 14 }}>
            <label>
              {copy!.protectedLabel}
              <span className="card-meta" style={{ marginLeft: 6 }}>任意</span>
            </label>
            <VoiceTextarea rows={3} value={kept} onChange={setKept} placeholder={copy!.protectedPlaceholder} />
          </div>

          <div className="field" style={{ marginTop: 14 }}>
            <label>
              次に同じ場面が来たら
              <span className="card-meta" style={{ marginLeft: 6 }}>任意</span>
            </label>
            <VoiceTextarea
              rows={3}
              value={learning}
              onChange={setLearning}
              placeholder="例: 世話をする人の予定を先に確かめてから進める"
            />
          </div>

          {kind === "WITHDRAWN" && (
            <p className="card-meta" style={{ marginTop: 12, lineHeight: 1.8 }}>
              撤退は「決められなかった」とは別に記録されます。パターンの集計でも、
              放置とは区別して扱われます。
            </p>
          )}

          <button className="btn primary" style={{ marginTop: 16 }} onClick={submit} disabled={!canSubmit}>
            {copy!.confirm}
          </button>
          <button className="btn ghost" style={{ marginTop: 4 }} onClick={() => setKind(null)}>
            選び直す
          </button>
        </>
      )}
    </>
  );
}
