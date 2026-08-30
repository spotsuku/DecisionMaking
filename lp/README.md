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

## Vercel

- Framework Preset: Next.js / Root Directory: `lp` / Install: `npm ci` / Build: `npm run build`
- Output Directoryは自動検出に任せる(手動指定しない)
- Node.js 22.x
- まずPreviewへデプロイし、確認後にProductionへ
