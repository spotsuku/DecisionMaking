// 「決めずに置いていること」フィード。
// 人格を責めず、観察できる事実だけを提示する(5.1 / 8.1)。

import type { DB } from "./types";
import { detectDrift } from "./drift";

export interface Observation {
  decisionId: string;
  name: string;
  fact: string;
  /** 赤で示す警告(Drift・期限超過)か、静かな観察か */
  warn: boolean;
  sortKey: number;
}

const DAY = 86400000;

export function buildObservations(db: DB, nowMs = Date.now()): Observation[] {
  const out: Observation[] = [];

  for (const d of db.decisions) {
    if (d.hidden || d.status === "CLOSED" || d.status === "REVISED") continue;

    // ずれ: 決めた案と行動の不一致(Drift)
    const drift = detectDrift(db, d.id);
    if (drift.drifting) {
      out.push({
        decisionId: d.id,
        name: d.title,
        fact: "決めた案と、直近の行動が違う方向です",
        warn: true,
        sortKey: 0,
      });
      continue;
    }

    // 未確定のまま置かれているもの
    const committed = d.status === "COMMITTED" || d.status === "IN_ACTION" || d.status === "REVIEW";
    if (!committed) {
      const pendingDays = Math.floor((nowMs - new Date(d.createdAt).getTime()) / DAY);
      const dueChanges = db.audit.filter(
        (e) => e.entityType === "decision" && e.entityId === d.id && e.eventType === "DUE_AT_CHANGED"
      ).length;
      const overdue = d.dueAt ? new Date(d.dueAt).getTime() < nowMs : false;

      if (overdue) {
        out.push({
          decisionId: d.id,
          name: d.title,
          fact: `決断期限を過ぎています。${pendingDays}日考え中`,
          warn: true,
          sortKey: 1,
        });
      } else if (dueChanges >= 2) {
        out.push({
          decisionId: d.id,
          name: d.title,
          fact: `${pendingDays}日考え中。期限が${dueChanges}回延びています`,
          warn: false,
          sortKey: 2,
        });
      } else if (pendingDays >= 7) {
        // 停滞: 新しい入力が増えないまま日数が経過
        const version = db.versions
          .filter((v) => v.decisionId === d.id)
          .sort((a, b) => b.versionNo - a.versionNo)[0];
        const lastInput = [
          ...db.answers.filter((a) => a.versionId === version?.id).map((a) => a.submittedAt),
          ...db.evidence.filter((e) => e.versionId === version?.id).map((e) => e.observedAt),
          d.createdAt,
        ].sort().at(-1)!;
        const quietDays = Math.floor((nowMs - new Date(lastInput).getTime()) / DAY);
        out.push({
          decisionId: d.id,
          name: d.title,
          fact:
            quietDays >= 5
              ? `新しい情報が増えないまま、${quietDays}日たちました`
              : `${pendingDays}日考え中`,
          warn: false,
          sortKey: 3,
        });
      }
    }

    // レビュー待ち
    if (committed && d.reviewAt && new Date(d.reviewAt).getTime() < nowMs) {
      const already = db.outcomes.some((o) => {
        const v = db.versions.find((x) => x.id === o.versionId);
        return v?.decisionId === d.id && v.versionNo === d.currentVersionNo;
      });
      if (!already) {
        out.push({
          decisionId: d.id,
          name: d.title,
          fact: "レビュー日を過ぎています。予測と実績を見比べましょう",
          warn: false,
          sortKey: 2,
        });
      }
    }
  }

  return out.sort((a, b) => a.sortKey - b.sortKey || a.name.localeCompare(b.name)).slice(0, 4);
}
