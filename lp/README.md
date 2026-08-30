# Decision Making LP

ChatGPT Sites(Vinext/Vite/Cloudflare Worker構成)から移管したランディングページ。
標準Next.js(App Router)+ 静的出力(`output: "export"`)。

- 公開中の旧URL: https://decision-making-app.workspace-959700.chatgpt.site (移管完了まで維持)
- デザイン・文言・質問デモ(3問)・スマホ表示は移管前と同一を維持
- 外部API・DB・認証・環境変数は不使用

## 開発

```bash
cd lp
npm ci
npm run dev     # http://localhost:3000
npm run build   # 静的出力 → out/
```

## アプリへのリンク

LP内の「無料で始める」などはすべてアプリ本体へのリンク。URLは `app/site.ts` の
1か所で持っている。独自ドメインを当てたら、Vercelの環境変数
`NEXT_PUBLIC_APP_URL`(例: `https://app.example.com`)を設定すれば全リンクが
切り替わる。静的出力なので、値はビルド時に埋め込まれる(再デプロイが必要)。

利用規約・プライバシーポリシー・特定商取引法に基づく表記はアプリ側にあるので、
フッターからそこへ渡している。

## Vercel

- Framework Preset: Next.js / Root Directory: `lp` / Install: `npm ci` / Build: `npm run build`
- Output Directoryは自動検出に任せる(手動指定しない)
- Node.js 22.x
- まずPreviewへデプロイし、確認後にProductionへ
