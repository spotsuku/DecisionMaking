// アプリケーションの正本ストア。
// MVPモックとしてブラウザ localStorage に永続化する(8.2 匿名体験に相当)。
// 本番は Supabase PostgreSQL + RLS(supabase/migrations 参照)。
// 不変条件:
//   INV-01 committed な decision_version は更新・削除しない
//   INV-02 決断成立は evaluateCommitGate を通過した場合のみ
//   INV-03 変更は decision_change(旧version参照・新事実・結果受容)を伴う
//   INV-05 ユーザー確定なしに COMMITTED にしない

import { evaluateCommitGate, canTransition, type CommitInput } from "./stateMachine";
import type {
  ActionItem,
  ActionRole,
  ActionStatus,
  Attribution,
  BlockerAssessment,
  Criterion,
  DB,
  Decision,
  DecisionChange,
  DecisionState,
  DecisionVersion,
  DiagnosticAnswer,
  DiagnosticQuestion,
  DomainCode,
  EvidenceItem,
  Forecast,
  ForecastType,
  OptionItem,
  Outcome,
  OutcomeClass,
  Readiness,
  ReadinessAssessment,
  Reflection,
} from "./types";
import { emptyDB } from "./types";
import { classifySafety } from "./diagnosis";

const STORAGE_KEY = "decision-making-db-v1";

export function uid(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return `id-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

const now = () => new Date().toISOString();

type Listener = () => void;

class Store {
  private db: DB = emptyDB();
  private listeners = new Set<Listener>();
  private loaded = false;
  private snapshotCache: DB | null = null;

  // ------------------------------------------------------------ 基盤

  private load() {
    if (this.loaded || typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) this.db = { ...emptyDB(), ...(JSON.parse(raw) as Partial<DB>) };
    } catch {
      this.db = emptyDB();
    }
    this.loaded = true;
  }

  private persist() {
    this.snapshotCache = null;
    if (typeof window !== "undefined") {
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(this.db));
      } catch {
        // 容量超過等。メモリ上の状態は維持する。
      }
    }
    this.listeners.forEach((l) => l());
  }

  subscribe = (l: Listener) => {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  };

  getSnapshot = (): DB => {
    this.load();
    if (!this.snapshotCache) this.snapshotCache = { ...this.db };
    return this.snapshotCache;
  };

  getServerSnapshot = (): DB => emptyDB();

  private audit(entityType: string, entityId: string, eventType: string, payloadSummary = "") {
    this.db.audit.push({ id: uid(), entityType, entityId, eventType, payloadSummary, createdAt: now() });
  }

  private assertMutableVersion(versionId: string) {
    const v = this.db.versions.find((x) => x.id === versionId);
    if (!v) throw new Error("version not found");
    if (v.committedAt) throw new Error("確定済みの決断は変更できません。変更は新しいversionとして作成してください(INV-01)。");
    return v;
  }

  // ------------------------------------------------------------ Decision

  createDecision(input: { title: string; question: string; ownerRole: string; domain: DomainCode; dueAt: string | null }): {
    decision: Decision;
    version: DecisionVersion;
  } {
    this.load();
    const safety = classifySafety(input.domain, `${input.title} ${input.question}`);
    const decision: Decision = {
      id: uid(),
      title: input.title,
      domain: input.domain,
      status: "DRAFT",
      currentVersionNo: 1,
      dueAt: input.dueAt,
      reviewAt: null,
      riskLevel: safety.level === "EMERGENCY" ? "EMERGENCY" : safety.level === "HIGH_RISK" ? "HIGH" : "NORMAL",
      createdAt: now(),
      closedAt: null,
      hidden: false,
    };
    const version: DecisionVersion = {
      id: uid(),
      decisionId: decision.id,
      versionNo: 1,
      question: input.question,
      ownerRole: input.ownerRole,
      authorityScope: "",
      selectedOptionId: null,
      rationale: "",
      confidence: null,
      state: "DRAFT",
      committedAt: null,
      createdAt: now(),
    };
    this.db.decisions.push(decision);
    this.db.versions.push(version);
    this.audit("decision", decision.id, "CREATED", input.title);
    // 問い・主体・期限がそろっていれば診断へ
    if (input.question && input.ownerRole && input.dueAt) {
      this.transition(decision.id, "DIAGNOSING");
    }
    this.persist();
    return { decision, version };
  }

  transition(decisionId: string, to: DecisionState) {
    this.load();
    const d = this.db.decisions.find((x) => x.id === decisionId);
    if (!d) throw new Error("decision not found");
    if (d.status === to) return;
    if (!canTransition(d.status, to)) {
      throw new Error(`状態遷移 ${d.status} → ${to} は許可されていません`);
    }
    d.status = to;
    if (to === "CLOSED") d.closedAt = now();
    const v = this.currentVersion(decisionId);
    if (v && !v.committedAt) v.state = to;
    this.audit("decision", decisionId, "STATE_CHANGED", to);
    this.persist();
  }

  updateFrame(decisionId: string, patch: { question?: string; ownerRole?: string; dueAt?: string | null; title?: string }) {
    this.load();
    const d = this.db.decisions.find((x) => x.id === decisionId);
    const v = this.currentVersion(decisionId);
    if (!d || !v) throw new Error("not found");
    if (v.committedAt) throw new Error("確定済みの決断の枠組みは変更できません(INV-01)");
    if (patch.question !== undefined) v.question = patch.question;
    if (patch.ownerRole !== undefined) v.ownerRole = patch.ownerRole;
    if (patch.title !== undefined) d.title = patch.title;
    if (patch.dueAt !== undefined && patch.dueAt !== d.dueAt) {
      d.dueAt = patch.dueAt;
      this.audit("decision", decisionId, "DUE_AT_CHANGED", patch.dueAt ?? "cleared");
    }
    if (d.status === "DRAFT" && v.question && v.ownerRole && d.dueAt) {
      d.status = "DIAGNOSING";
      v.state = "DIAGNOSING";
      this.audit("decision", decisionId, "STATE_CHANGED", "DIAGNOSING");
    }
    this.persist();
  }

  currentVersion(decisionId: string): DecisionVersion | undefined {
    this.load();
    return this.db.versions
      .filter((v) => v.decisionId === decisionId)
      .sort((a, b) => b.versionNo - a.versionNo)[0];
  }

  hideDecision(decisionId: string) {
    this.load();
    const d = this.db.decisions.find((x) => x.id === decisionId);
    if (!d) return;
    d.hidden = true; // 非表示。履歴は消さない(3.8)
    this.audit("decision", decisionId, "HIDDEN");
    this.persist();
  }

  // ------------------------------------------------------------ 診断

  recordQuestion(versionId: string, q: { code: string; text: string; purpose: string; gap: DiagnosticQuestion["gap"] }): DiagnosticQuestion {
    this.load();
    const seq = this.db.questions.filter((x) => x.versionId === versionId).length + 1;
    const question: DiagnosticQuestion = {
      id: uid(),
      versionId,
      questionCode: q.code,
      text: q.text,
      purpose: q.purpose,
      gap: q.gap,
      sequenceNo: seq,
    };
    this.db.questions.push(question);
    this.persist();
    return question;
  }

  recordAnswer(
    questionId: string,
    answerText: string,
    answerJson: Record<string, string> = {}
  ): DiagnosticAnswer {
    this.load();
    const q = this.db.questions.find((x) => x.id === questionId);
    if (!q) throw new Error("question not found");
    const answer: DiagnosticAnswer = {
      id: uid(),
      questionId,
      versionId: q.versionId,
      questionCode: q.questionCode,
      answerText,
      answerJson,
      submittedAt: now(),
    };
    this.db.answers.push(answer);
    this.audit("answer", answer.id, "SUBMITTED", q.questionCode);
    this.persist();
    return answer;
  }

  saveBlockers(versionId: string, blockers: Omit<BlockerAssessment, "id" | "versionId" | "createdAt">[]) {
    this.load();
    // 最新の評価だけを残す(過去分は監査ログに残る)
    this.db.blockers = this.db.blockers.filter((b) => b.versionId !== versionId);
    for (const b of blockers) {
      if (b.evidenceRefs.length === 0) continue; // 根拠なしは保存しない(6.3)
      this.db.blockers.push({ ...b, id: uid(), versionId, createdAt: now() });
    }
    this.persist();
  }

  saveReadiness(versionId: string, verdict: Readiness, missing: ReadinessAssessment["missing"], stopCondition: string | null, note: string) {
    this.load();
    this.db.readiness.push({ id: uid(), versionId, verdict, missing, stopCondition, note, createdAt: now() });
    const v = this.db.versions.find((x) => x.id === versionId);
    if (v && !v.committedAt) {
      const d = this.db.decisions.find((x) => x.id === v.decisionId);
      if (d) {
        const target: DecisionState = verdict === "THINK" || verdict === "BET" ? "READY" : "GATHERING";
        if (canTransition(d.status, target)) {
          d.status = target;
          v.state = target;
          this.audit("decision", d.id, "STATE_CHANGED", target);
        }
      }
    }
    this.persist();
  }

  markReady(decisionId: string) {
    this.transition(decisionId, "READY");
  }

  // ------------------------------------------------------------ 材料

  addOption(versionId: string, label: string, description: string, addedReason: string): OptionItem {
    this.load();
    this.assertMutableVersion(versionId);
    const active = this.db.options.filter((o) => o.versionId === versionId && o.active);
    if (active.length >= 4 && addedReason.trim() === "") {
      throw new Error("選択肢は2〜4件が推奨です。5件目の追加には理由(新しい事実)が必要です。");
    }
    const opt: OptionItem = {
      id: uid(), versionId, label, description, origin: "USER", active: true,
      addedReason, rejectedReason: null, createdAt: now(),
    };
    this.db.options.push(opt);
    this.audit("option", opt.id, "ADDED", label);
    this.persist();
    return opt;
  }

  setOptionRejectedReason(optionId: string, reason: string) {
    this.load();
    const o = this.db.options.find((x) => x.id === optionId);
    if (!o) return;
    this.assertMutableVersion(o.versionId);
    o.rejectedReason = reason;
    this.persist();
  }

  deactivateOption(optionId: string, reason: string) {
    this.load();
    const o = this.db.options.find((x) => x.id === optionId);
    if (!o) return;
    this.assertMutableVersion(o.versionId);
    o.active = false;
    o.rejectedReason = reason || o.rejectedReason;
    this.audit("option", optionId, "DEACTIVATED", reason);
    this.persist();
  }

  addCriterion(versionId: string, label: string, definition: string, weight: number, minimumThreshold: string): Criterion {
    this.load();
    this.assertMutableVersion(versionId);
    const existing = this.db.criteria.filter((c) => c.versionId === versionId);
    if (existing.length >= 5) throw new Error("判断基準は3〜5個に限定します(S4)。既存の基準を見直してください。");
    const c: Criterion = { id: uid(), versionId, label, definition, weight, minimumThreshold, createdAt: now() };
    this.db.criteria.push(c);
    this.persist();
    return c;
  }

  removeCriterion(criterionId: string) {
    this.load();
    const c = this.db.criteria.find((x) => x.id === criterionId);
    if (!c) return;
    this.assertMutableVersion(c.versionId);
    this.db.criteria = this.db.criteria.filter((x) => x.id !== criterionId);
    this.db.optionScores = this.db.optionScores.filter((s) => s.criterionId !== criterionId);
    this.persist();
  }

  setScore(optionId: string, criterionId: string, score: number, rationale: string) {
    this.load();
    const o = this.db.options.find((x) => x.id === optionId);
    if (o) this.assertMutableVersion(o.versionId);
    const existing = this.db.optionScores.find((s) => s.optionId === optionId && s.criterionId === criterionId);
    if (existing) {
      existing.score = score;
      existing.rationale = rationale;
    } else {
      this.db.optionScores.push({ id: uid(), optionId, criterionId, score, uncertainty: 0, rationale });
    }
    this.persist();
  }

  addEvidence(versionId: string, type: EvidenceItem["type"], statement: string, reliability: EvidenceItem["reliability"], sourceUrl: string | null): EvidenceItem {
    this.load();
    this.assertMutableVersion(versionId);
    const e: EvidenceItem = { id: uid(), versionId, type, statement, sourceUrl, reliability, observedAt: now() };
    this.db.evidence.push(e);
    this.persist();
    return e;
  }

  // ------------------------------------------------------------ 予測(下書き)

  upsertForecast(versionId: string, forecastType: ForecastType, patch: Partial<Omit<Forecast, "id" | "versionId" | "forecastType" | "frozenAt">>): Forecast {
    this.load();
    this.assertMutableVersion(versionId);
    let f = this.db.forecasts.find((x) => x.versionId === versionId && x.forecastType === forecastType && !x.frozenAt);
    if (!f) {
      f = {
        id: uid(), versionId, forecastType,
        outcomeStatement: "", probability: null, horizonAt: "",
        metric: null, assumption: null, leadingIndicator: null, lossLimit: null, frozenAt: null,
      };
      this.db.forecasts.push(f);
    }
    Object.assign(f, patch);
    this.persist();
    return f;
  }

  // ------------------------------------------------------------ Commit(7.1)

  /**
   * Commitトランザクション。ゲート(4.6/4.7)を通過した場合のみ、
   * version凍結・予測凍結・commitment・最小行動・状態遷移・監査を原子的に行う。
   */
  commit(decisionId: string, input: {
    selectedOptionId: string;
    rationale: string;
    confidence: number | null;
    acceptedTradeoff: string;
    lossLimit: string;
    stopCondition: string;
    reviewAt: string;
    actions: { text: string; actionRole: ActionRole; dueAt: string; optionId: string | null }[];
    userConfirmed: boolean;
  }): { ok: true } | { ok: false; failures: { code: string; message: string }[] } {
    this.load();
    const d = this.db.decisions.find((x) => x.id === decisionId);
    const v = this.currentVersion(decisionId);
    if (!d || !v) throw new Error("not found");
    if (v.committedAt) throw new Error("このversionは既に確定済みです");

    const options = this.db.options.filter((o) => o.versionId === v.id);
    const forecasts = this.db.forecasts.filter((f) => f.versionId === v.id && !f.frozenAt);

    const gate: CommitInput = {
      userConfirmed: input.userConfirmed,
      selectedOptionId: input.selectedOptionId,
      options,
      forecasts,
      acceptedTradeoff: input.acceptedTradeoff,
      actions: input.actions,
      reviewAt: input.reviewAt,
    };
    const result = evaluateCommitGate(gate);
    if (!result.ok) return { ok: false, failures: result.failures };

    const ts = now();
    // version凍結
    v.selectedOptionId = input.selectedOptionId;
    v.rationale = input.rationale;
    v.confidence = input.confidence;
    v.committedAt = ts;
    v.state = "COMMITTED";
    // 予測凍結(結果観測前に固定 3.4)
    for (const f of forecasts) f.frozenAt = ts;
    // commitment
    const negative = forecasts.find((f) => f.forecastType === "NEGATIVE");
    this.db.commitments.push({
      id: uid(), versionId: v.id,
      acceptedTradeoff: input.acceptedTradeoff,
      acceptedDownsideForecastId: negative?.id ?? null,
      lossLimit: input.lossLimit,
      stopCondition: input.stopCondition,
      reviewAt: input.reviewAt,
      userConfirmedAt: ts,
    });
    // 最小行動
    for (const a of input.actions) {
      const action: ActionItem = {
        id: uid(), versionId: v.id, decisionId,
        text: a.text, actionRole: a.actionRole, optionId: a.optionId ?? input.selectedOptionId,
        dueAt: a.dueAt, status: "PENDING", completionEvidence: null, createdAt: ts,
      };
      this.db.actions.push(action);
      this.db.actionEvents.push({ id: uid(), actionId: action.id, eventType: "CREATED", occurredAt: ts, note: "" });
    }
    // 集約更新
    d.status = "COMMITTED";
    d.reviewAt = input.reviewAt;
    this.audit("decision", decisionId, "COMMITTED", `v${v.versionNo}`);
    this.persist();
    return { ok: true };
  }

  // ------------------------------------------------------------ 行動

  addAction(decisionId: string, text: string, actionRole: ActionRole, dueAt: string, optionId: string | null): ActionItem {
    this.load();
    const v = this.currentVersion(decisionId);
    if (!v) throw new Error("not found");
    const action: ActionItem = {
      id: uid(), versionId: v.id, decisionId, text, actionRole,
      optionId, dueAt, status: "PENDING", completionEvidence: null, createdAt: now(),
    };
    this.db.actions.push(action);
    this.db.actionEvents.push({ id: uid(), actionId: action.id, eventType: "CREATED", occurredAt: now(), note: "" });
    this.persist();
    return action;
  }

  actionEvent(actionId: string, eventType: "STARTED" | "COMPLETED" | "BLOCKED" | "CANCELLED", note: string, completionEvidence?: string) {
    this.load();
    const a = this.db.actions.find((x) => x.id === actionId);
    if (!a) throw new Error("action not found");
    const statusMap: Record<string, ActionStatus> = {
      STARTED: "STARTED", COMPLETED: "COMPLETED", BLOCKED: "BLOCKED", CANCELLED: "CANCELLED",
    };
    a.status = statusMap[eventType];
    if (completionEvidence) a.completionEvidence = completionEvidence;
    this.db.actionEvents.push({ id: uid(), actionId, eventType, occurredAt: now(), note });
    const d = this.db.decisions.find((x) => x.id === a.decisionId);
    if (d && d.status === "COMMITTED" && eventType === "STARTED") {
      d.status = "IN_ACTION";
      this.audit("decision", d.id, "STATE_CHANGED", "IN_ACTION");
    }
    this.persist();
  }

  // ------------------------------------------------------------ 結果・レビュー

  recordOutcome(decisionId: string, input: {
    resultSummary: string; outcomeClass: OutcomeClass; attribution: Attribution; externalFactors: string;
  }): Outcome {
    this.load();
    const d = this.db.decisions.find((x) => x.id === decisionId);
    const v = this.db.versions
      .filter((x) => x.decisionId === decisionId && x.committedAt)
      .sort((a, b) => b.versionNo - a.versionNo)[0];
    if (!d || !v) throw new Error("確定済みの決断がありません");
    const o: Outcome = {
      id: uid(), versionId: v.id, observedAt: now(),
      resultSummary: input.resultSummary, outcomeClass: input.outcomeClass,
      attribution: input.attribution, externalFactors: input.externalFactors,
    };
    this.db.outcomes.push(o);
    if (canTransition(d.status, "REVIEW")) {
      d.status = "REVIEW";
      this.audit("decision", decisionId, "STATE_CHANGED", "REVIEW");
    }
    this.audit("outcome", o.id, "RECORDED", input.outcomeClass);
    this.persist();
    return o;
  }

  recordReflection(outcomeId: string, input: {
    predictionGap: string; decisionError: string; executionError: string; environmentChange: string; learning: string;
  }): Reflection {
    this.load();
    const o = this.db.outcomes.find((x) => x.id === outcomeId);
    if (!o) throw new Error("outcome not found");
    const r: Reflection = {
      id: uid(), outcomeId, versionId: o.versionId,
      ...input, authoredAt: now(),
    };
    this.db.reflections.push(r);
    this.persist();
    return r;
  }

  // ------------------------------------------------------------ 変更(5.2 / INV-03)

  /**
   * 変更プロトコル: 旧決断の参照・結果の受容・新事実・変わった前提を必須とし、
   * 旧versionは残したまま新versionを作成する。
   */
  reviseDecision(decisionId: string, input: {
    trigger: string;
    newEvidence: string;
    changedAssumption: string;
    priorResultAcknowledged: boolean;
    newQuestion: string;
  }): { ok: true; newVersion: DecisionVersion } | { ok: false; failures: string[] } {
    this.load();
    const d = this.db.decisions.find((x) => x.id === decisionId);
    const fromVersion = this.db.versions
      .filter((x) => x.decisionId === decisionId && x.committedAt)
      .sort((a, b) => b.versionNo - a.versionNo)[0];
    if (!d || !fromVersion) throw new Error("確定済みの決断がありません");

    const failures: string[] = [];
    if (!input.priorResultAcknowledged) failures.push("旧決断の結果を受け入れたことの確認が必要です");
    if (input.newEvidence.trim() === "") failures.push("新しく分かった事実、または変わった価値・制約が必要です");
    if (input.changedAssumption.trim() === "") failures.push("変わった前提の明示が必要です");
    if (input.newQuestion.trim() === "") failures.push("新しい決断の問いが必要です");
    if (failures.length > 0) return { ok: false, failures };

    const newVersion: DecisionVersion = {
      id: uid(),
      decisionId,
      versionNo: d.currentVersionNo + 1,
      question: input.newQuestion,
      ownerRole: fromVersion.ownerRole,
      authorityScope: fromVersion.authorityScope,
      selectedOptionId: null,
      rationale: "",
      confidence: null,
      state: "DIAGNOSING",
      committedAt: null,
      createdAt: now(),
    };
    const change: DecisionChange = {
      id: uid(), decisionId,
      fromVersionId: fromVersion.id, toVersionId: newVersion.id,
      trigger: input.trigger, newEvidence: input.newEvidence,
      priorResultAcknowledged: input.priorResultAcknowledged,
      changedAssumption: input.changedAssumption, changedAt: now(),
    };
    this.db.versions.push(newVersion);
    this.db.changes.push(change);
    d.currentVersionNo = newVersion.versionNo;
    d.status = "DIAGNOSING";
    this.audit("decision", decisionId, "REVISED", `v${fromVersion.versionNo} → v${newVersion.versionNo}`);
    this.persist();
    return { ok: true, newVersion };
  }

  closeDecision(decisionId: string, reason: string) {
    this.load();
    const d = this.db.decisions.find((x) => x.id === decisionId);
    if (!d) return;
    if (!canTransition(d.status, "CLOSED")) throw new Error(`状態 ${d.status} からは完了できません`);
    d.status = "CLOSED";
    d.closedAt = now();
    this.audit("decision", decisionId, "CLOSED", reason);
    this.persist();
  }

  // ------------------------------------------------------------ ジャーナリング

  addJournalEntry(text: string) {
    this.load();
    const entry = { id: uid(), text, createdAt: now() };
    this.db.journal.push(entry);
    this.audit("journal", entry.id, "CREATED");
    this.persist();
    return entry;
  }

  /** 書き出しの候補文から決断(DRAFT)を作る。候補は提案であり、この操作自体が本人の選択。 */
  createDecisionFromCandidate(candidate: string, title: string) {
    return this.createDecision({
      title,
      question: candidate,
      ownerRole: "",
      domain: "OTHER",
      dueAt: null,
    });
  }

  // ------------------------------------------------------------ エクスポート(3.8)

  exportJSON(): string {
    this.load();
    return JSON.stringify(this.db, null, 2);
  }

  resetAll() {
    this.db = emptyDB();
    this.loaded = true;
    if (typeof window !== "undefined") window.localStorage.removeItem(STORAGE_KEY);
    this.persist();
  }
}

export const store = new Store();
