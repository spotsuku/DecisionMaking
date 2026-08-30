"use client";

// Home: 書き出しファースト。
// ①ジャーナリングへの入口 ②決めずに置いていること(観察事実) ③今日の一歩 ④決断へのリンク

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useDB, fmtDate } from "@/lib/useDB";
import { store } from "@/lib/store";
import { buildObservations } from "@/lib/observations";
import { IconChevron, IconMic, IconPen, IconUser, IconWarn } from "@/components/icons";

const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];

export default function HomePage() {
  const db = useDB();
  const router = useRouter();
  const now = new Date();
  const dateLabel = `${now.getMonth() + 1}月${now.getDate()}日 ${WEEKDAYS[now.getDay()]}曜日`;

  const observations = buildObservations(db);

  // 今日の一歩: 未完了のADVANCE行動のうち期限が最も近いもの
  const nextAction = db.actions
    .filter((a) => {
      if (a.status === "COMPLETED" || a.status === "CANCELLED") return false;
      const d = db.decisions.find((x) => x.id === a.decisionId);
      return d && !d.hidden && d.status !== "CLOSED" && d.status !== "REVISED";
    })
    .sort((a, b) => a.dueAt.localeCompare(b.dueAt))[0];
  const nextActionDecision = nextAction
    ? db.decisions.find((d) => d.id === nextAction.decisionId)
    : undefined;

  const open = db.decisions.filter((d) => !d.hidden && d.status !== "CLOSED" && d.status !== "REVISED");
  const weekAgo = Date.now() - 7 * 86400000;
  const decidedThisWeek = db.versions.filter(
    (v) => v.committedAt && new Date(v.committedAt).getTime() >= weekAgo
  ).length;

  return (
    <>
      <div className="appbar" style={{ alignItems: "flex-start", paddingBottom: 6 }}>
        <div>
          <div className="home-date">{dateLabel}</div>
          <div className="home-hello">こんにちは。</div>
        </div>
        <Link href="/identity" className="avatar-btn" aria-label="アカウント">
          <span className="avatar"><IconUser /></span>
        </Link>
      </div>

      <div className="hero">
        <div className="tag">ジャーナリング — 思考をそのままアウトプット</div>
        <div className="big">決められないこと、迷っていることを、書き出してみよう。</div>
        <button className="jbox" onClick={() => router.push("/journal")}>
          仕事のこと、家のこと、なんでも。
          <span className="mic-corner"><IconMic /></span>
        </button>
        <button className="btn primary" style={{ marginTop: 10, minHeight: 46 }} onClick={() => router.push("/journal")}>
          <IconPen /> 書き出す
        </button>
      </div>

      <Link href="/decisions/new" style={{ display: "block", marginTop: 10 }}>
        <span className="btn outline">決めることを直接登録する</span>
      </Link>

      {observations.length > 0 && (
        <>
          <div className="section">決めずに置いていること</div>
          {observations.map((o) => (
            <Link key={`${o.decisionId}-${o.fact}`} href={`/decisions/${o.decisionId}`}>
              <div className={`card obs ${o.warn ? "alert" : ""}`}>
                <div className="body">
                  <div className="name">{o.name}</div>
                  <div className="fact" style={o.warn ? { color: "var(--accent-dark)" } : undefined}>
                    {o.warn && <IconWarn />}
                    {o.fact}
                  </div>
                </div>
                <span className="chev"><IconChevron /></span>
              </div>
            </Link>
          ))}
        </>
      )}

      {nextAction && nextActionDecision && (
        <>
          <div className="section">今日の一歩</div>
          <div className="card obs">
            <div className="body">
              <div className="name">{nextAction.text}</div>
              <div className="fact">
                {nextActionDecision.title} ・ 期限 {fmtDate(nextAction.dueAt)}
              </div>
            </div>
            <button
              className="chip-btn"
              onClick={() => {
                const ev = window.prompt("完了の証拠(送ったメール、実施した打合せ等、外部に残る痕跡)");
                if (ev !== null) store.actionEvent(nextAction.id, "COMPLETED", "", ev);
              }}
            >
              できた
            </button>
          </div>
        </>
      )}

      {open.length === 0 && observations.length === 0 && (
        <div className="empty" style={{ marginTop: 18 }}>
          まだ決断がありません。
          <br />
          まずは頭の中のモヤモヤを書き出してみましょう。
          <br />
          その中に、決めることが隠れています。
        </div>
      )}

      <div className="row2" style={{ marginTop: 8 }}>
        <Link href="/decisions?filter=week" style={{ flex: 1 }}>
          <span className="link-row">今週決めたこと {decidedThisWeek}件 <IconChevron /></span>
        </Link>
        <Link href="/decisions" style={{ flex: 1 }}>
          <span className="link-row">すべての決断 {db.decisions.filter((d) => !d.hidden).length}件 <IconChevron /></span>
        </Link>
      </div>
    </>
  );
}
