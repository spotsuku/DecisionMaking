// 規約類の共通情報。事業者情報は本番公開前に必ず実在の内容へ差し替える。
// ここが空のままだと特定商取引法の表示義務を満たさない。

/** AIの提供元。切り替えたらここと .env を合わせる */
export const AI_VENDOR = "OpenAI";

export const LEGAL = {
  serviceName: "DECISION MAKING",
  /** TODO: 公開前に差し替え */
  operator: "(事業者名を記載)",
  representative: "(代表者名を記載)",
  address: "(所在地を記載)",
  contactEmail: "(問い合わせ先メールアドレスを記載)",
  effectiveDate: "2026年8月30日",
  lastUpdated: "2026年8月30日",
} as const;

/** 外部に渡る先。プライバシーポリシーと実装を一致させるためにここで一元管理する */
export const SUBPROCESSORS = [
  {
    name: "OpenAI, L.L.C.",
    country: "米国",
    purpose: "書き出し文・診断の回答から候補を作るため",
    data: "本人が入力した本文(書き出し・診断の回答)",
    note: "APIとして送信した内容は、既定では提供元のモデル学習に利用されません。",
  },
  {
    name: "Supabase Inc.",
    country: "日本(東京リージョン)/ 米国(管理基盤)",
    purpose: "アカウントと決断データの保存",
    data: "メールアドレス、決断・診断・行動の記録",
    note: "行レベルセキュリティにより、本人以外は参照できません。",
  },
  {
    name: "Vercel Inc.",
    country: "米国",
    purpose: "アプリの配信",
    data: "IPアドレス、アクセスログ",
    note: "",
  },
  {
    name: "Stripe, Inc.",
    country: "米国",
    purpose: "有料プランの決済",
    data: "メールアドレス、決済情報",
    note: "カード番号は当社サーバーを経由せず、Stripeが直接取得します。",
  },
] as const;
