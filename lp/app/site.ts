// アプリ本体の場所。LPとアプリは別のデプロイなので、URLはここ1か所で持つ。
// 独自ドメインを当てたら、Vercelの環境変数 NEXT_PUBLIC_APP_URL を設定すれば
// LP側のリンクはすべて切り替わる(静的出力なので、値はビルド時に埋め込まれる)。
export const APP_URL =
  process.env.NEXT_PUBLIC_APP_URL ?? "https://decision-making-app-spotsukus-projects.vercel.app";

/** アプリ内のページへのリンク */
export const app = (path = "/") => `${APP_URL}${path}`;
