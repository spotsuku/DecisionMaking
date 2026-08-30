// 特定商取引法に基づく表示。有料プランを提供する以上、表示義務がある。

import Link from "next/link";
import { LEGAL } from "@/lib/legal";
import { PLANS, DEFAULT_OVERAGE_CAP_YEN } from "@/lib/plan";

export const metadata = { title: "特定商取引法に基づく表示 | DECISION MAKING" };

const ROWS: [string, React.ReactNode][] = [
  ["販売事業者", LEGAL.operator],
  ["運営責任者", LEGAL.representative],
  ["所在地", LEGAL.address],
  ["連絡先", LEGAL.contactEmail],
  [
    "販売価格",
    <>
      スタンダード 月額 {PLANS.STANDARD.monthlyYen.toLocaleString()}円(税抜)/
      プロ 月額 {PLANS.PRO.monthlyYen.toLocaleString()}円(税抜)。
      月の枠を超える決断は1件あたり スタンダード {PLANS.STANDARD.overageYen}円 /
      プロ {PLANS.PRO.overageYen}円(税抜)。従量課金の上限は初期設定で月
      {DEFAULT_OVERAGE_CAP_YEN.toLocaleString()}円、設定画面から変更できます。
    </>,
  ],
  ["商品代金以外の必要料金", "インターネット接続に係る通信料は利用者の負担となります。"],
  ["支払方法", "クレジットカード(Stripe)"],
  ["支払時期", "お申し込み時に初回課金、以後は毎月同日に自動課金されます。"],
  ["提供時期", "決済完了後、直ちに利用できます。"],
  [
    "返品・キャンセル",
    "デジタルサービスの性質上、提供開始後の返金は承っておりません。解約はいつでも設定画面から可能で、当該課金期間の末日まで利用できます。",
  ],
  ["動作環境", "最新版の Google Chrome / Safari / Microsoft Edge。音声入力は対応ブラウザのみ。"],
];

export default function TokushohoPage() {
  return (
    <>
      <h1>特定商取引法に基づく表示</h1>
      <div className="tablewrap">
        <table>
          <tbody>
            {ROWS.map(([k, v]) => (
              <tr key={k}>
                <th style={{ width: "34%" }}>{k}</th>
                <td>{v}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="back">
        <Link href="/legal/terms">利用規約</Link>
        {" · "}
        <Link href="/legal/privacy">プライバシーポリシー</Link>
        {" · "}
        <Link href="/">アプリに戻る</Link>
      </p>
    </>
  );
}
