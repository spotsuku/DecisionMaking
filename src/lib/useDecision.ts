"use client";

import { useParams } from "next/navigation";
import { useDB } from "./useDB";
import type { DB, Decision, DecisionVersion } from "./types";

export function useDecision(): {
  db: DB;
  id: string;
  decision: Decision | undefined;
  version: DecisionVersion | undefined;
} {
  const params = useParams<{ id: string }>();
  const db = useDB();
  const decision = db.decisions.find((d) => d.id === params.id);
  const version = db.versions
    .filter((v) => v.decisionId === params.id)
    .sort((a, b) => b.versionNo - a.versionNo)[0];
  return { db, id: params.id, decision, version };
}
