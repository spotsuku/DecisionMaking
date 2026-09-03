// 会話をそのままAPIへ渡す形に直す。
//
// ここで足すものは何も無い。役割の割り当てと、APIが受け取れる形への整えだけ。
// 書き出しの段階に指示を書くと会話が誘導されるので、systemは持たせない。

import type { Turn } from "../brainstorm";
import type { ChatTurn } from "./provider";

/**
 * 本人=user、アプリ=assistant。
 * 先頭のアプリ側の発言(最初の呼びかけ)は落とす ──
 * Anthropicは user から始まる必要があり、両提供元で同じ形にそろえるため。
 */
export function toChatMessages(turns: Turn[]): ChatTurn[] {
  const mapped: ChatTurn[] = turns
    .filter((t) => t.text.trim() !== "")
    .map((t) => ({ role: t.from === "USER" ? "user" : "assistant", content: t.text.trim() }));
  let i = 0;
  while (i < mapped.length && mapped[i].role === "assistant") i += 1;
  return mapped.slice(i);
}

/**
 * 会話に付ける指示。これで全部。
 *
 * 指示ゼロも試した。gpt-4.1 は相談コンサルとして
 * 「### 出資を受けるメリット」「### デメリット」と見出し付きの記事を書き、
 * 400トークンを使い切って途中で切れた。中身は助言だった。
 *
 * なので残すのは2つだけ。
 *   1行目は媒体の話 ── チャットの吹き出しに記事を貼らない。
 *   2行目は立場の話 ── 決めるのは本人(6.1 / INV-05)。
 *
 * 会話の中身は書かない。何を聞くか、どう聞くか、何を確かめるかは指定しない。
 * そこを書くと会話が誘導される(型の反復とカウンセリング化を招いた)。
 */
export const CHAT_STYLE = `チャットの返信です。2〜3文で短く。箇条書きや見出しは使わない。
結論や助言は書かない。決めるのは本人です。`;
