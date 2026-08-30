// 意思決定支援アプリ ドメイン型定義
// 設計書 3章(データベース設計)に対応。履歴は不変(append-only)。

export type DecisionState =
  | "DRAFT"
  | "DIAGNOSING"
  | "GATHERING"
  | "READY"
  | "COMMITTED"
  | "IN_ACTION"
  | "REVIEW"
  | "REVISED"
  | "CLOSED";

export type Readiness = "THINK" | "RESEARCH" | "ASK" | "TEST" | "BET";

export type ForecastType = "POSITIVE" | "BASELINE" | "NEGATIVE";

export type ActionRole = "ADVANCE" | "MITIGATE" | "EXIT_PREP";

export type ActionStatus = "PENDING" | "STARTED" | "COMPLETED" | "BLOCKED" | "CANCELLED";

export type OutcomeClass = "GOOD" | "MIXED" | "BAD" | "UNKNOWN";

export type Attribution = "SELF" | "EXTERNAL" | "MIXED";

/** 第1層: 成立条件の不足(4.2) */
export type GapCode = "QUESTION" | "RECOGNITION" | "VALUE" | "AGENCY" | "EXECUTION";

/** 第2層: 心理作用(4.2)。断定せず「可能性」として提示する */
export type BlockerCode =
  | "EMOTION_AVOIDANCE"
  | "RESPONSIBILITY_AVOIDANCE"
  | "OPPORTUNITY_LOSS_PARALYSIS"
  | "SELF_JUSTIFICATION"
  | "APPROVAL_SEEKING";

export type DomainCode =
  | "WORK"
  | "CAREER"
  | "MONEY"
  | "RELATIONSHIP"
  | "ROMANCE"
  | "FAMILY"
  | "HEALTH"
  | "LEGAL"
  | "OTHER";

export type RiskLevel = "NORMAL" | "HIGH" | "EMERGENCY";

export interface Decision {
  id: string;
  title: string;
  domain: DomainCode;
  status: DecisionState;
  currentVersionNo: number;
  dueAt: string | null;
  reviewAt: string | null;
  riskLevel: RiskLevel;
  createdAt: string;
  closedAt: string | null;
  /** 画面上の非表示(soft deleteではない。履歴は消えない) */
  hidden: boolean;
}

/** 不変の決断スナップショット。COMMITTED後は更新・削除しない(INV-01) */
export interface DecisionVersion {
  id: string;
  decisionId: string;
  versionNo: number;
  question: string;
  ownerRole: string;
  authorityScope: string;
  selectedOptionId: string | null;
  rationale: string;
  confidence: number | null; // 0-1
  state: DecisionState;
  committedAt: string | null;
  createdAt: string;
}

export interface DiagnosticQuestion {
  id: string;
  versionId: string;
  questionCode: string;
  text: string;
  purpose: string;
  gap: GapCode;
  sequenceNo: number;
}

export interface DiagnosticAnswer {
  id: string;
  questionId: string;
  versionId: string;
  questionCode: string;
  answerText: string;
  submittedAt: string;
}

export interface BlockerAssessment {
  id: string;
  versionId: string;
  blockerCode: BlockerCode;
  score: number; // 0-1
  confidence: number; // 0-1
  evidenceRefs: string[]; // 観察事実の説明(根拠IDなしの推定は保存しない 6.3)
  counterQuestion: string;
  algorithmVersion: string;
  createdAt: string;
}

export interface OptionItem {
  id: string;
  versionId: string;
  label: string;
  description: string;
  origin: "USER" | "SUGGESTED";
  active: boolean;
  addedReason: string;
  rejectedReason: string | null;
  createdAt: string;
}

export interface Criterion {
  id: string;
  versionId: string;
  label: string;
  definition: string;
  weight: number; // 1-5
  minimumThreshold: string;
  createdAt: string;
}

export interface OptionScore {
  id: string;
  optionId: string;
  criterionId: string;
  score: number; // 1-5
  uncertainty: number; // 0-1
  rationale: string;
}

export interface EvidenceItem {
  id: string;
  versionId: string;
  type: "FACT" | "HYPOTHESIS" | "OPINION";
  statement: string;
  sourceUrl: string | null;
  reliability: "HIGH" | "MEDIUM" | "LOW";
  observedAt: string;
}

/** 決断時の両面予測。committed_at以降は凍結(3.4) */
export interface Forecast {
  id: string;
  versionId: string;
  forecastType: ForecastType;
  outcomeStatement: string;
  probability: number | null; // 0-1
  horizonAt: string;
  metric: string | null;
  assumption: string | null;
  leadingIndicator: string | null;
  lossLimit: string | null; // NEGATIVE用: 損失上限
  frozenAt: string | null;
}

export interface Commitment {
  id: string;
  versionId: string;
  acceptedTradeoff: string;
  acceptedDownsideForecastId: string | null;
  lossLimit: string;
  stopCondition: string;
  reviewAt: string;
  userConfirmedAt: string;
}

export interface ActionItem {
  id: string;
  versionId: string;
  decisionId: string;
  text: string;
  actionRole: ActionRole;
  /** どのoptionを前進させる行動か(Drift検知に使用) */
  optionId: string | null;
  dueAt: string;
  status: ActionStatus;
  completionEvidence: string | null;
  createdAt: string;
}

export interface ActionEvent {
  id: string;
  actionId: string;
  eventType: "CREATED" | "STARTED" | "COMPLETED" | "BLOCKED" | "CANCELLED";
  occurredAt: string;
  note: string;
}

export interface Outcome {
  id: string;
  versionId: string;
  observedAt: string;
  resultSummary: string;
  outcomeClass: OutcomeClass;
  attribution: Attribution;
  externalFactors: string;
}

export interface Reflection {
  id: string;
  outcomeId: string;
  versionId: string;
  predictionGap: string;
  decisionError: string;
  executionError: string;
  environmentChange: string;
  learning: string;
  authoredAt: string;
}

/** 説明責任を伴う変更(INV-03) */
export interface DecisionChange {
  id: string;
  decisionId: string;
  fromVersionId: string;
  toVersionId: string;
  trigger: string;
  newEvidence: string;
  priorResultAcknowledged: boolean;
  changedAssumption: string;
  changedAt: string;
}

export interface ReadinessAssessment {
  id: string;
  versionId: string;
  verdict: Readiness;
  missing: GapCode[];
  stopCondition: string | null;
  note: string;
  createdAt: string;
}

export interface AuditEvent {
  id: string;
  entityType: string;
  entityId: string;
  eventType: string;
  payloadSummary: string;
  createdAt: string;
}

export interface JournalEntry {
  id: string;
  text: string;
  createdAt: string;
}

/** 全データ。localStorage に保存する MVP モック用の器(正本は履歴テーブル群) */
export interface DB {
  journal: JournalEntry[];
  decisions: Decision[];
  versions: DecisionVersion[];
  questions: DiagnosticQuestion[];
  answers: DiagnosticAnswer[];
  blockers: BlockerAssessment[];
  options: OptionItem[];
  criteria: Criterion[];
  optionScores: OptionScore[];
  evidence: EvidenceItem[];
  forecasts: Forecast[];
  commitments: Commitment[];
  actions: ActionItem[];
  actionEvents: ActionEvent[];
  outcomes: Outcome[];
  reflections: Reflection[];
  changes: DecisionChange[];
  readiness: ReadinessAssessment[];
  audit: AuditEvent[];
}

export const emptyDB = (): DB => ({
  journal: [],
  decisions: [],
  versions: [],
  questions: [],
  answers: [],
  blockers: [],
  options: [],
  criteria: [],
  optionScores: [],
  evidence: [],
  forecasts: [],
  commitments: [],
  actions: [],
  actionEvents: [],
  outcomes: [],
  reflections: [],
  changes: [],
  readiness: [],
  audit: [],
});

export const DOMAIN_LABEL: Record<DomainCode, string> = {
  WORK: "仕事",
  CAREER: "キャリア",
  MONEY: "お金・投資",
  RELATIONSHIP: "人間関係",
  ROMANCE: "恋愛",
  FAMILY: "家庭",
  HEALTH: "健康",
  LEGAL: "法律・契約",
  OTHER: "その他",
};

export const STATE_LABEL: Record<DecisionState, string> = {
  DRAFT: "下書き",
  DIAGNOSING: "診断中",
  GATHERING: "材料集め",
  READY: "決められる",
  COMMITTED: "決断済み",
  IN_ACTION: "実行中",
  REVIEW: "レビュー",
  REVISED: "変更済み",
  CLOSED: "完了",
};

export const READINESS_LABEL: Record<Readiness, string> = {
  THINK: "考えれば決められる",
  RESEARCH: "事実の確認が必要",
  ASK: "人に聞く必要がある",
  TEST: "小さく試す必要がある",
  BET: "誰にも分からない(賭け)",
};

export const BLOCKER_LABEL: Record<BlockerCode, string> = {
  EMOTION_AVOIDANCE: "感情回避",
  RESPONSIBILITY_AVOIDANCE: "責任回避",
  OPPORTUNITY_LOSS_PARALYSIS: "機会損失麻痺",
  SELF_JUSTIFICATION: "自己正当化",
  APPROVAL_SEEKING: "承認・虚勢",
};

export const GAP_LABEL: Record<GapCode, string> = {
  QUESTION: "問い",
  RECOGNITION: "認識",
  VALUE: "価値",
  AGENCY: "主体性",
  EXECUTION: "実行",
};
