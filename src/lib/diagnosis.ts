// 二層診断(4.2)・次質問の選択(4.5)・判断可能性ルーター(4.3)・安全分類(S0)。
// すべてルールベースの決定的ロジック。LLMを使う場合も候補提示のみで、状態は確定しない(6.1)。

import type {
  BlockerCode,
  DB,
  DecisionVersion,
  DiagnosticAnswer,
  GapCode,
  Readiness,
} from "./types";

export const ALGORITHM_VERSION = "rule-1.0.0";

// ---------------------------------------------------------------- 質問バンク

/**
 * 記入欄。1つの問いに複数の論点が含まれる場合は欄を分ける。
 * 1欄=1データにしないと、後段(基準・停止条件・損失上限など)で使えない。
 */
export interface QuestionPart {
  key: string;
  label: string;
  placeholder?: string;
  /** 空欄のまま次へ進めるか */
  optional?: boolean;
}

export interface QuestionDef {
  code: string;
  gap: GapCode;
  /** 画面の見出しになる問いかけ */
  text: string;
  purpose: string;
  parts: QuestionPart[];
  /** 未確定の必須フィールドに対応するか */
  requiredField: boolean;
  emotionalLoad: number; // 0-2
}

export const QUESTION_BANK: QuestionDef[] = [
  {
    code: "Q_FRAME_SENTENCE",
    gap: "QUESTION",
    text: "いま考えていることは、何を決める話ですか?",
    purpose: "何を決めるかを一文で確定する",
    parts: [{ key: "question", label: "決めること", placeholder: "例: 犬を家に迎えるかどうか" }],
    requiredField: true,
    emotionalLoad: 0,
  },
  {
    code: "Q_OWNER",
    gap: "AGENCY",
    text: "この件は、誰が決めますか?",
    purpose: "決定権と責任範囲を確定する",
    parts: [
      { key: "owner", label: "最終的に決める人", placeholder: "例: 自分 / 妻と相談 / 決裁は役員" },
      { key: "scope", label: "あなたが決められる範囲", placeholder: "例: 予算50万円まではこちらで決められる" },
    ],
    requiredField: true,
    emotionalLoad: 1,
  },
  {
    code: "Q_DEADLINE",
    gap: "QUESTION",
    text: "いつまでに決めますか?",
    purpose: "決断期限と、超過したときに起きることを確定する",
    parts: [
      { key: "due", label: "決める期限", placeholder: "例: 今週の金曜まで" },
      { key: "consequence", label: "その日を過ぎると何が起きるか", placeholder: "例: 契約が自動更新される" },
    ],
    requiredField: true,
    emotionalLoad: 0,
  },
  {
    code: "Q_CRITERIA",
    gap: "VALUE",
    text: "この選択で、何を守り、何を諦めますか?",
    purpose: "判断基準とトレードオフを言語化する",
    parts: [
      { key: "protect", label: "守りたいもの", placeholder: "例: 家族との時間" },
      { key: "giveup", label: "諦めてもいいもの", placeholder: "例: 年収の上積み" },
    ],
    requiredField: true,
    emotionalLoad: 1,
  },
  {
    code: "Q_INFO_STOP",
    gap: "RECOGNITION",
    text: "何が分かれば、判断が変わりますか?",
    purpose: "不足情報と情報収集の停止条件を定義する",
    parts: [
      { key: "missing", label: "分かれば評価が変わること", placeholder: "例: 世話にかかる実際の時間" },
      { key: "stop", label: "これ以上調べても変わらない条件", placeholder: "例: 見学2件まで。それ以上は調べない" },
    ],
    requiredField: true,
    emotionalLoad: 0,
  },
  {
    code: "Q_ACTION_24H",
    gap: "EXECUTION",
    text: "24時間以内にできる、外部世界に向けた最小の行動は何ですか?",
    purpose: "選択を実行意図へ変換する",
    parts: [
      { key: "action", label: "最小の行動", placeholder: "例: ブリーダーに見学を申し込む" },
    ],
    requiredField: true,
    emotionalLoad: 0,
  },
  {
    code: "Q_WORST_CASE",
    gap: "RECOGNITION",
    text: "選んだ案がうまくいかないとしたら?",
    purpose: "ネガティブ予測と損失上限を先に言語化する",
    parts: [
      { key: "path", label: "失敗する筋道", placeholder: "例: 世話が続かず家族に負担が偏る" },
      { key: "loss", label: "引き受けられる損失の上限", placeholder: "例: 月3万円と、平日の朝夕30分まで" },
    ],
    requiredField: false,
    emotionalLoad: 2,
  },
  {
    code: "Q_FEELING",
    gap: "RECOGNITION",
    text: "この件を考えるとき、どんな気持ちになりますか?",
    purpose: "感情と情報を分けて扱う",
    parts: [
      { key: "feeling", label: "浮かぶ気持ち", placeholder: "例: 楽しみだけど、責任が怖い" },
      { key: "interrupt", label: "考えるのを中断したくなる瞬間", placeholder: "なければ空欄で大丈夫です", optional: true },
    ],
    requiredField: false,
    emotionalLoad: 2,
  },
];

// ---------------------------------------------------- 第1層: 成立条件の診断

export interface GapStatus {
  gap: GapCode;
  missing: boolean;
  detail: string;
}

export function assessGaps(
  db: DB,
  version: DecisionVersion,
  dueAt: string | null
): GapStatus[] {
  const answers = db.answers.filter((a) => a.versionId === version.id);
  const byCode = (code: string) => answers.find((a) => a.questionCode === code);
  const criteria = db.criteria.filter((c) => c.versionId === version.id);
  const options = db.options.filter((o) => o.versionId === version.id && o.active);
  const actions = db.actions.filter((a) => a.versionId === version.id);

  return [
    {
      gap: "QUESTION",
      missing: version.question.trim() === "" || !dueAt,
      detail: !dueAt ? "期限が未設定です" : version.question.trim() === "" ? "問いが一文になっていません" : "問い・期限は確定済み",
    },
    {
      gap: "RECOGNITION",
      missing: options.length < 2 && !byCode("Q_INFO_STOP"),
      detail:
        options.length >= 2
          ? `選択肢 ${options.length} 件を比較中`
          : byCode("Q_INFO_STOP")
          ? "不足情報と停止条件は言語化済み"
          : "比較できる選択肢が2件未満です",
    },
    {
      gap: "VALUE",
      missing: criteria.length < 2,
      detail: criteria.length < 2 ? "判断基準が2件未満です" : `判断基準 ${criteria.length} 件`,
    },
    {
      gap: "AGENCY",
      missing: version.ownerRole.trim() === "",
      detail: version.ownerRole.trim() === "" ? "誰が決めるかが未確定です" : `決定主体: ${version.ownerRole}`,
    },
    {
      gap: "EXECUTION",
      missing: actions.length === 0 && !byCode("Q_ACTION_24H"),
      detail:
        actions.length > 0
          ? `行動 ${actions.length} 件`
          : byCode("Q_ACTION_24H")
          ? "最小行動は言語化済み(確定時に登録)"
          : "外部行動が未定義です",
    },
  ];
}

// ------------------------------------------------------- 次質問の選択(4.5)

/**
 * priority = missing_required*5 + info_gain*3 + blocker_discrimination*2
 *          - repetition_penalty*4 - emotional_load*safety_factor
 * 同点時: 問い → 主体 → 判断基準 → 情報停止条件 → 行動。
 * 1問だけ返す。
 */
export function selectNextQuestion(
  db: DB,
  version: DecisionVersion,
  dueAt: string | null
): QuestionDef | null {
  const answers = db.answers.filter((a) => a.versionId === version.id);
  const answeredCodes = new Set(answers.map((a) => a.questionCode));
  const gaps = assessGaps(db, version, dueAt);
  const missingGaps = new Set(gaps.filter((g) => g.missing).map((g) => g.gap));

  const askedCount = db.questions.filter((q) => q.versionId === version.id).length;
  // 1セッション最大7問(12章)。必須が埋まれば早く終える。
  if (askedCount >= 7 || missingGaps.size === 0) return null;

  const tieOrder = ["Q_FRAME_SENTENCE", "Q_OWNER", "Q_CRITERIA", "Q_INFO_STOP", "Q_ACTION_24H", "Q_DEADLINE", "Q_WORST_CASE", "Q_FEELING"];
  const safetyFactor = 1;

  let best: { def: QuestionDef; score: number } | null = null;
  for (const def of QUESTION_BANK) {
    const missingRequired = def.requiredField && missingGaps.has(def.gap) ? 1 : 0;
    const infoGain = missingGaps.has(def.gap) ? 1 : 0;
    const blockerDiscrimination = def.emotionalLoad > 0 ? 0.5 : 0;
    const repetition = answeredCodes.has(def.code) ? 1 : 0;
    const score =
      missingRequired * 5 +
      infoGain * 3 +
      blockerDiscrimination * 2 -
      repetition * 4 -
      def.emotionalLoad * safetyFactor;
    if (repetition) continue; // 同じ質問は繰り返さない(6.3)
    if (
      !best ||
      score > best.score ||
      (score === best.score && tieOrder.indexOf(def.code) < tieOrder.indexOf(best.def.code))
    ) {
      best = { def, score };
    }
  }
  if (!best || best.score <= 0) return null;
  return best.def;
}

// --------------------------------------------- 第2層: 心理作用の候補提示(4.2)

export interface BlockerSignal {
  code: BlockerCode;
  score: number;
  confidence: number;
  evidence: string[]; // 観察事実。これが空なら提示しない(6.3)
  presentation: string; // 断定しない提示文
  counterQuestion: string;
}

const CONFIDENCE_THRESHOLD = 0.4;

/**
 * 観察可能な兆候だけから心理作用の「可能性」を推定する。
 * 人格を診断しない(1.3)。根拠のない推定は返さない(6.3)。
 */
export function assessBlockers(db: DB, version: DecisionVersion): BlockerSignal[] {
  const decision = db.decisions.find((d) => d.id === version.decisionId);
  if (!decision) return [];
  const answers = db.answers.filter((a) => a.versionId === version.id);
  const options = db.options.filter((o) => o.versionId === version.id && o.active);
  const criteria = db.criteria.filter((c) => c.versionId === version.id);
  const evidence = db.evidence.filter((e) => e.versionId === version.id);
  const deadlineChanges = db.audit.filter(
    (e) => e.entityType === "decision" && e.entityId === decision.id && e.eventType === "DUE_AT_CHANGED"
  );

  const text = answers.map((a) => a.answerText).join(" ");
  const signals: BlockerSignal[] = [];

  // 感情回避: 回答の中断・期限だけの延長
  if (deadlineChanges.length >= 2 && evidence.length === 0) {
    signals.push({
      code: "EMOTION_AVOIDANCE",
      score: Math.min(1, deadlineChanges.length / 3),
      confidence: 0.5,
      evidence: [`新しい事実は増えず、期限が${deadlineChanges.length}回変わっています`],
      presentation: "考えると生じる不快感を避けている可能性があります。",
      counterQuestion: "この件を考えるとき、いちばん見たくない情報は何ですか?",
    });
  }

  // 責任回避: 他者待ち・主語が消える表現
  const waitingWords = ["待って", "様子を見", "上司が", "会社が", "相手次第", "どちらでも", "任せ"];
  const waitingHits = waitingWords.filter((w) => text.includes(w));
  if (waitingHits.length >= 2) {
    signals.push({
      code: "RESPONSIBILITY_AVOIDANCE",
      score: Math.min(1, waitingHits.length / 4),
      confidence: 0.45,
      evidence: [`回答に他者待ち・主語の消える表現が含まれます: ${waitingHits.join("、")}`],
      presentation: "決めた時の損得・後悔を避けている可能性があります。",
      counterQuestion: "誰の判断も待たずに、あなた一人で決められる部分はどこですか?",
    });
  }

  // 機会損失麻痺: 判断基準なしの選択肢拡張・「両方走らせる」
  const bothWords = ["両方", "並行", "どちらも", "全部"];
  const bothHits = bothWords.filter((w) => text.includes(w));
  if ((options.length >= 4 && criteria.length < 2) || bothHits.length >= 1) {
    const ev: string[] = [];
    if (options.length >= 4 && criteria.length < 2)
      ev.push(`判断基準が${criteria.length}件のまま選択肢が${options.length}件に増えています`);
    if (bothHits.length >= 1) ev.push(`回答に「${bothHits.join("」「")}」という表現があります`);
    signals.push({
      code: "OPPORTUNITY_LOSS_PARALYSIS",
      score: 0.6,
      confidence: 0.5,
      evidence: ev,
      presentation: "選択肢を残す代償で学習が止まっている可能性があります。",
      counterQuestion: "両方を走らせる場合、それぞれの成功指標と終了条件は何ですか?",
    });
  }

  // 自己正当化: 反証の欠如
  const negativeEvidence = evidence.filter((e) => e.type === "FACT").length;
  if (answers.length >= 4 && negativeEvidence === 0 && evidence.length >= 3) {
    signals.push({
      code: "SELF_JUSTIFICATION",
      score: 0.4,
      confidence: 0.4,
      evidence: ["登録された証拠に、選びたい案へ不利な事実が含まれていません"],
      presentation: "望む説明へ証拠を寄せている可能性があります。",
      counterQuestion: "いま選びたい案に不利な事実を、1つ挙げるとしたら何ですか?",
    });
  }

  // 承認・虚勢: 他者評価の頻出
  const approvalWords = ["評価", "どう思われる", "認められ", "期待に", "がっかりされ", "見られ"];
  const approvalHits = approvalWords.filter((w) => text.includes(w));
  if (approvalHits.length >= 2) {
    signals.push({
      code: "APPROVAL_SEEKING",
      score: Math.min(1, approvalHits.length / 4),
      confidence: 0.45,
      evidence: [`回答に他者評価に関する表現が繰り返し含まれます: ${approvalHits.join("、")}`],
      presentation: "評価される自分が判断軸になっている可能性があります。",
      counterQuestion: "誰にも知られないとしたら、どちらを選びますか?",
    });
  }

  // 信頼度が閾値未満、または根拠がないものは出さない(6.3)
  return signals
    .filter((s) => s.confidence >= CONFIDENCE_THRESHOLD && s.evidence.length > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 2); // 上位2原因(S3)
}

// -------------------------------------------- 判断可能性ルーター(4.3 / S2)

export interface ReadinessInput {
  /** 確認可能な事実が不足している */
  factsMissing: boolean;
  /** 経験・相場観・権限を持つ人に聞く必要がある */
  needsAsk: boolean;
  /** 考えても確定せず、小さく試せば分かる */
  testable: boolean;
  /** 将来不確実で、調べても試しても確定しない */
  unknowable: boolean;
}

export function routeReadiness(input: ReadinessInput): Readiness {
  // 優先順: 事実確認 → 人に聞く → 実験 → 賭け → 比較検討
  if (input.factsMissing) return "RESEARCH";
  if (input.needsAsk) return "ASK";
  if (input.testable) return "TEST";
  if (input.unknowable) return "BET";
  return "THINK";
}

// ------------------------------------------------------------ S0 Safety(6.4)

export type SafetyLevel = "NORMAL" | "HIGH_RISK" | "EMERGENCY";

export interface SafetyResult {
  level: SafetyLevel;
  reason: string | null;
  guidance: string | null;
}

const EMERGENCY_WORDS = ["死にたい", "消えたい", "自殺", "自傷", "殺したい", "傷つけたい", "虐待"];
const HIGH_RISK_DOMAINS = new Set(["HEALTH", "LEGAL", "MONEY"]);

export function classifySafety(domain: string, text: string): SafetyResult {
  if (EMERGENCY_WORDS.some((w) => text.includes(w))) {
    return {
      level: "EMERGENCY",
      reason: "自傷・他害に関する表現が含まれています",
      guidance:
        "このアプリは緊急支援を提供できません。いのちの電話 0570-783-556、または警察・救急 110/119 など、専門の窓口へ今すぐ連絡してください。",
    };
  }
  if (HIGH_RISK_DOMAINS.has(domain)) {
    return {
      level: "HIGH_RISK",
      reason: "医療・法律・投資に関わる領域です",
      guidance:
        "この領域では、アプリは情報整理と質問作成の支援に限定します。結論は必ず医師・弁護士・FP等の専門家に確認してください。",
    };
  }
  return { level: "NORMAL", reason: null, guidance: null };
}

// ---------------------------------------------- 情報収集の逃避検知(3.6 補助)

export function detectGatheringEscape(db: DB, versionId: string): string | null {
  const version = db.versions.find((v) => v.id === versionId);
  if (!version) return null;
  const evidence = db.evidence.filter((e) => e.versionId === versionId);
  const criteria = db.criteria.filter((c) => c.versionId === versionId);
  if (evidence.length >= 10 && criteria.length === 0) {
    return "情報が10件以上追加されていますが、判断基準がまだ定義されていません。情報追加を止めて、比較の物差しを先に決めませんか?";
  }
  return null;
}

export function detectOptionExpansion(db: DB, versionId: string): string | null {
  const options = db.options.filter((o) => o.versionId === versionId && o.active);
  const criteria = db.criteria.filter((c) => c.versionId === versionId);
  if (options.length >= 5 && criteria.length < 2) {
    return `選択肢が${options.length}件に増えていますが、比較基準がありません。5件目以降の追加には「新しい事実」が必要です。`;
  }
  return null;
}

export type { DiagnosticAnswer };
