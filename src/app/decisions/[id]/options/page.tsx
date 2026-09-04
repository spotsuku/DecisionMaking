"use client";

// 選択肢を絞る画面。出す → 削る → 選ぶ の3段。
//
// 1画面に「追加・除外・採点・証拠」を全部並べていたのを分けた。
// 段ごとに1つのことだけを聞くので、縦に長い密なフォームにならない。
//
// 比較表の行は、チャット診断の「何を守り、何を諦めますか?」の答えから起こす。
// ここで本人にもう一度入力させると、同じことを二度聞くことになる。
// 点数はつけない ── 合計して答えが出るように見えると、決めたのがアプリになる(6.1)。

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useDB } from "@/lib/useDB";
import { store } from "@/lib/store";
import { useDecision } from "@/lib/useDecision";
import { detectOptionExpansion } from "@/lib/diagnosis";
import { buildProposals } from "@/lib/proposals";
import {
  MARK_LABEL,
  OPTION_PATTERNS,
  displayLabel,
  REJECT_REASONS,
  markFromScore,
  needsFilling,
  nextMark,
  optionFromPattern,
  optionLetter,
  type OptionMark,
} from "@/lib/options";
import { IconBack } from "@/components/icons";

type Step = 1 | 2 | 3;
const STEP_LABEL: Record<Step, string> = { 1: "出す", 2: "削る", 3: "選ぶ" };

export default function OptionsPage() {
  const router = useRouter();
  const db = useDB();
  const { decision, version } = useDecision();
  const [step, setStep] = useState<Step>(1);
  const [own, setOwn] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);

  // 判断基準は診断の答えから起こす。すでにあるものは触らない
  useEffect(() => {
    if (version && !version.committedAt) store.seedCriteriaFromDiagnosis(version.id);
  }, [version]);

  // useMemo は使わない。ストアは配列を作り直さずに push するので、
  // db.options を依存に置くと参照が変わらず、追加しても画面が更新されない。
  const options = version ? db.options.filter((o) => o.versionId === version.id) : [];
  const criteria = version ? db.criteria.filter((c) => c.versionId === version.id) : [];

  if (!decision || !version) return null;
  const base = `/decisions/${decision.id}`;
  const locked = !!version.committedAt;

  // 基準がないまま案だけ増やしていくのは、決めないための増やし方(4.2)
  const expandWarn = detectOptionExpansion(db, version.id);
  // 診断で本人が口にした案。ここで拾わないと、また同じことを書かせることになる
  const suggestions = locked
    ? []
    : buildProposals(db, version).filter((p) => p.kind === "OPTION");

  const live = options.filter((o) => o.active);
  const dropped = options.filter((o) => !o.active);
  const letterOf = (id: string) => optionLetter(options.findIndex((o) => o.id === id));

  const guard = (fn: () => void) => {
    try {
      fn();
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "保存できませんでした");
    }
  };

  const markOf = (optionId: string, criterionId: string): OptionMark => {
    const s = db.optionScores.find((x) => x.optionId === optionId && x.criterionId === criterionId);
    return markFromScore(s?.score, s?.uncertainty);
  };

  // 「?」= まだ分からない。ここがそのまま調べることになる
  const unknowns = live.flatMap((o) =>
    criteria.filter((c) => markOf(o.id, c.id) === "UNKNOWN").map((c) => `${letterOf(o.id)}: ${c.label}`)
  );

  const selected = options.find((o) => o.id === version.selectedOptionId);

  return (
    <div className="optflow">
      <div className="appbar">
        <button className="back" onClick={() => router.push(base)} aria-label="戻る"><IconBack /></button>
        <span className="title">選択肢</span>
      </div>

      <div className="track">
        {([1, 2, 3] as Step[]).map((n) => (
          <div key={n} className={n <= step ? "on" : ""} />
        ))}
      </div>
      <div className="track-label">
        {([1, 2, 3] as Step[]).map((n) => (
          <button key={n} className={n === step ? "cur" : ""} onClick={() => setStep(n)}>
            {STEP_LABEL[n]}
          </button>
        ))}
      </div>

      <div className="qbox">
        <div className="k">決めること</div>
        <div className="v">{version.question || decision.title}</div>
      </div>

      {locked && <div className="callout neutral">この版は確定済みです。ここは変更できません。</div>}
      {step === 1 && expandWarn && <div className="callout">{expandWarn}</div>}
      {error && <div className="callout">{error}</div>}

      {/* ① 出す */}
      {step === 1 && (
        <>
          <div className="section">考えられる案</div>
          <p className="hint">思いつくものを並べます。良い悪いはまだ見ません。</p>
          <div className="opts">
            {options.map((o, i) => (
              <div key={o.id} className={`opt${o.origin === "SUGGESTED" ? " suggested" : ""}${o.active ? "" : " out"}`}>
                <div className="ab">{optionLetter(i)}</div>
                <div>
                  {editing === o.id ? (
                    <>
                      <input
                        type="text"
                        value={draft}
                        onChange={(e) => setDraft(e.target.value)}
                        placeholder="この案の内容"
                        autoFocus
                      />
                      <div className="row2" style={{ marginTop: 8 }}>
                        <button
                          className="btn primary half"
                          onClick={() => {
                            const v = draft.trim();
                            if (v) guard(() => store.renameOption(o.id, v));
                            setEditing(null);
                          }}
                        >
                          保存
                        </button>
                        <button className="btn half" onClick={() => setEditing(null)}>やめる</button>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="lbl">
                        {displayLabel(o.label)}
                        {needsFilling(o.label) && <span className="tag mine">内容を記入</span>}
                      </div>
                      {o.description && <div className="why">{o.description}</div>}
                      {!locked && (
                        <button
                          className="edit"
                          onClick={() => {
                            setEditing(o.id);
                            setDraft(displayLabel(o.label));
                          }}
                        >
                          書き直す
                        </button>
                      )}
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>

          {suggestions.length > 0 && (
            <>
              <div className="section">診断で話していた案</div>
              <p className="hint">押すと案に足します。言葉はあとで書き直せます。</p>
              <div className="proposals">
                {suggestions.map((p) => (
                  <button
                    key={p.label}
                    className="prop"
                    onClick={() => guard(() => store.addOption(version.id, p.label, "", "診断の回答から"))}
                  >
                    <span className="pt">{p.label}</span>
                    <span className="ps">{p.source}</span>
                    <span className="pa">＋</span>
                  </button>
                ))}
              </div>
            </>
          )}

          {!locked && (
            <>
              <div className="section">やる / やらない の外に案はないか</div>
              <p className="hint">型だけ出します。中身はご自身の言葉で埋めてください。</p>
              <div className="chips">
                {OPTION_PATTERNS.map((p) => (
                  <button
                    key={p}
                    className="chip add"
                    onClick={() =>
                      guard(() => store.addOption(version.id, optionFromPattern(p), "", "二択の外の案", "SUGGESTED"))
                    }
                  >
                    ＋ {p}
                  </button>
                ))}
              </div>

              <div className="section">自分で足す</div>
              <input
                type="text"
                value={own}
                onChange={(e) => setOwn(e.target.value)}
                placeholder="例: 金額を下げて受ける"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.nativeEvent.isComposing && own.trim()) {
                    e.preventDefault();
                    guard(() => store.addOption(version.id, own.trim(), "", ""));
                    setOwn("");
                  }
                }}
              />
              <button
                className="btn outline"
                style={{ marginTop: 10 }}
                disabled={!own.trim()}
                onClick={() => {
                  guard(() => store.addOption(version.id, own.trim(), "", ""));
                  setOwn("");
                }}
              >
                この案を足す
              </button>
            </>
          )}

          <button className="btn primary" style={{ marginTop: 18 }} onClick={() => setStep(2)}>
            削る段へ進む({options.length}案)
          </button>
        </>
      )}

      {/* ② 削る */}
      {step === 2 && (
        <>
          <div className="section">残す案を決める</div>
          <p className="hint">
            外した案と理由も記録に残ります。あとで「なぜ選ばなかったか」を説明できるように。
          </p>
          <div className="opts">
            {options.map((o, i) => (
              <div key={o.id} className={`opt${o.active ? "" : " out"}`}>
                <div className="ab">{optionLetter(i)}</div>
                <div>
                  <div className="lbl">{displayLabel(o.label)}</div>
                  {!o.active && o.rejectedReason && <div className="why">外した理由: {o.rejectedReason}</div>}
                  {!locked && (
                    <>
                      <div className="rowbtns">
                        <button
                          className="keep"
                          aria-pressed={o.active}
                          onClick={() => guard(() => store.reactivateOption(o.id))}
                        >
                          残す
                        </button>
                        <button
                          className="drop"
                          aria-pressed={!o.active}
                          onClick={() => guard(() => store.deactivateOption(o.id, ""))}
                        >
                          外す
                        </button>
                      </div>
                      {!o.active && !o.rejectedReason && (
                        <div className="reasons">
                          <div className="rl">外す理由を1つ</div>
                          <div className="chips">
                            {REJECT_REASONS.map((r) => (
                              <button
                                key={r}
                                className="chip"
                                onClick={() => guard(() => store.setOptionRejectedReason(o.id, r))}
                              >
                                {r}
                              </button>
                            ))}
                          </div>
                          <input
                            type="text"
                            style={{ marginTop: 8 }}
                            placeholder="自分の言葉で書く"
                            onKeyDown={(e) => {
                              const v = e.currentTarget.value.trim();
                              if (e.key === "Enter" && !e.nativeEvent.isComposing && v) {
                                e.preventDefault();
                                guard(() => store.setOptionRejectedReason(o.id, v));
                              }
                            }}
                          />
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
          <button className="btn primary" style={{ marginTop: 18 }} onClick={() => setStep(3)}>
            選ぶ段へ進む(残り {live.length}案)
          </button>
          <button className="btn ghost" onClick={() => setStep(1)}>案を足しに戻る</button>
        </>
      )}

      {/* ③ 選ぶ */}
      {step === 3 && (
        <>
          <div className="section">判断基準で比べる</div>
          {criteria.length === 0 ? (
            <div className="callout neutral">
              <strong>比べる軸がまだありません</strong>
              <div style={{ marginTop: 6, lineHeight: 1.8 }}>
                診断で「この選択で、何を守り、何を諦めますか?」に答えると、その言葉がここの行になります。
              </div>
              <button className="chip-btn" style={{ marginTop: 10 }} onClick={() => router.push(`${base}/diagnose`)}>
                診断に戻る
              </button>
            </div>
          ) : (
            <>
              <div className="fromchat">
                <b>この行は、チャット診断の答えです</b>
                「この選択で、何を守り、何を諦めますか?」への回答から、守るもの・譲れるものとして並べています。
              </div>
              <div className="tablewrap">
                <table className="cmp">
                  <thead>
                    <tr>
                      <th>判断基準</th>
                      {live.map((o) => (
                        <th key={o.id} className="o">{letterOf(o.id)}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {criteria.map((c) => (
                      <tr key={c.id}>
                        <th>
                          <span className={`kk ${c.weight >= 4 ? "keepk" : "givek"}`}>
                            {c.weight >= 4 ? "守る" : "譲る"}
                          </span>
                          {c.label}
                          {c.definition && <small>{c.definition}</small>}
                        </th>
                        {live.map((o) => {
                          const m = markOf(o.id, c.id);
                          return (
                            <td key={o.id}>
                              <button
                                className={`mark ${m === "GOOD" ? "maru" : m === "BAD" ? "batsu" : m === "UNKNOWN" ? "unknown" : ""}`}
                                disabled={locked}
                                onClick={() => guard(() => store.setMark(o.id, c.id, nextMark(m)))}
                              >
                                {MARK_LABEL[m]}
                              </button>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="note">
                押すたびに <b>○ → △ → × → ?</b> と変わります。点数はつけません。
                <br />
                <b>?</b> は「まだ分からない」。分からないことは、分からないまま残す方が正確です。
              </p>

              {unknowns.length > 0 && (
                <div className="unknownbox">
                  <b>まだ分からないこと</b>
                  <ul>
                    {unknowns.map((u) => (
                      <li key={u}>{u}</li>
                    ))}
                  </ul>
                  <span>
                    これは診断の「何が分かれば、判断が変わりますか?」に戻ります。
                    調べ終わったら、判定の「確認すれば分かる事実は、網羅した」にチェックが付きます。
                  </span>
                </div>
              )}
            </>
          )}

          <div className="section">これにする</div>
          <div className="picks">
            {live.map((o) => (
              <div key={o.id} className={`pickrow${version.selectedOptionId === o.id ? " chosen" : ""}`}>
                <span className="n">{letterOf(o.id)}</span>
                <span className="t">
                  {displayLabel(o.label)}
                  {/* 型のままの案を選ぶと、Decision Card に中身のない文が残る */}
                  {needsFilling(o.label) && <em>内容を書いてから選べます</em>}
                </span>
                <button
                  disabled={locked || needsFilling(o.label)}
                  onClick={() =>
                    guard(() =>
                      store.selectOption(version.id, version.selectedOptionId === o.id ? null : o.id)
                    )
                  }
                >
                  {version.selectedOptionId === o.id ? "選択中" : "これにする"}
                </button>
              </div>
            ))}
          </div>

          {selected && (
            <>
              <div className="result">
                <div className="k">選んだ案</div>
                <div className="v">{displayLabel(selected.label)}</div>
                <div className="d">
                  {dropped.length > 0
                    ? `選ばなかった案: ${dropped
                        .map((o) => `${displayLabel(o.label)}(${o.rejectedReason || "理由未記入"})`)
                        .join(" / ")}`
                    : "外した案はありません。"}
                </div>
              </div>
              <button className="btn primary" style={{ marginTop: 12 }} onClick={() => router.push(`${base}/commit`)}>
                確定へ進む(理由・予測・最初の行動)
              </button>
            </>
          )}
          <button className="btn ghost" onClick={() => setStep(2)}>削る段に戻る</button>
        </>
      )}
    </div>
  );
}
