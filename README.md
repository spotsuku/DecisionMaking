# DECISION MAKING

自分の人生と仕事を自分で決め、最小の行動を起こし、結果とのズレから学ぶ力を鍛えるアプリ。
単発の相談回答ではなく、決断の履歴から本人固有の判断・逃避・修正パターンを学習する。

設計書『意思決定支援アプリ設計書 v1.1(Database × Decision Support Algorithm)』の実装。
デザインは白黒ベース・差し色赤。

## 設計原則

**AIは正解を代行しない。本人の決断・行動・振り返りを成立させる。**

| 不変条件 | 実装 |
|---|---|
| INV-01 履歴の不変性 | 確定済みversionの更新・削除をストア/DBトリガーが拒否 |
| INV-02 決断成立の必須要素 | Commit gate(選択・却下理由・両面予測・損失上限・トレードオフ・最小行動・レビュー日) |
| INV-03 説明責任つき変更 | 旧version参照・新事実・結果受容がそろわないと新versionを作れない |
| INV-04 AI推論の根拠保存 | 根拠のない心理推定は保存・表示しない |
| INV-05 本人確定 | user_confirmed なしでは COMMITTED にならない |
| INV-06 高リスク領域 | 医療/法律/投資は整理支援に限定、自傷他害は緊急導線 |

## 起動

```bash
npm install
npm run dev        # http://localhost:3000
npm test           # 状態遷移・Commitゲート・Drift・不変性のテスト(44件)
npm run build      # 本番ビルド
```

## 構成

```
src/
  lib/
    types.ts         ドメイン型(3章 テーブル定義に対応)
    stateMachine.ts  状態機械(2.3)・決断成立ルール(4.6)・準備度4段階(4.8)
    diagnosis.ts     二層診断(4.2)・次質問選択(4.5)・判断可能性ルーター(4.3)・S0 Safety(6.4)
    drift.ts         Decision Drift(5.1)・選択的帰属(5.3)・Decision Integrity(5.4)
    store.ts         append-onlyストア(Commitトランザクション 7.1・変更プロトコル 5.2)
  app/
    page.tsx               Home: 未決の発見(期限・保留日数・次の一歩・レビュー待ち)
    decisions/new/         New Decision: 問い・主体・期限・領域(S1 Frame)
    decisions/[id]/        診断/材料/確定/カード/実行/レビュー/履歴
    identity/              長期パターン(Integrity・帰属記録・行動立ち上がり)
tests/                     状態遷移テスト+受入テスト(10.3)
supabase/migrations/       本番用DDL・不変トリガー・commit_decision関数・RLS
schemas/                   LLM Structured Outputs用JSON Schema(6.2)
```

## MVPの割り切り

- **永続化**: 現段階は匿名体験モック(8.2)としてブラウザ `localStorage` に保存。
  ドメインロジック(状態機械・ゲート・診断・Drift)はUIから分離済みで、
  `supabase/migrations/` のスキーマへそのまま載せ替えられる。
  サーバー移行時は `commit_decision()`(0002)が 7.1 のトランザクションを担う。
- **LLM**: 質問文・心理作用の推定はルールベースで実装(6.1 の「決定的ロジックに残す」側)。
  OpenAI Structured Outputs を足す場合は `schemas/algorithm_output.schema.json` を使い、
  候補の提示のみに限定する(業務状態はアプリのルールだけが更新する)。
- 課金(Stripe)・通知ジョブ・共有はMVP 3以降(9章)。

## 検証済みの受入テスト(10.3)

- ポジティブ予測だけ / ネガティブ予測だけのCommit → 未決のまま、不足項目を要求
- 情報10件追加・判断基準なし → 情報追加を止め基準定義へ促す
- Commit後に別案への行動2件・変更イベントなし → Drift通知
- 良い結果=自分/悪い結果=外部が3件 → 断定しない文面で記録を提示
- 旧決断の変更 → 旧予測・結果・変更理由を残して新version作成
- 高リスク領域(医療・法律・投資) → 専門家確認へルーティング
