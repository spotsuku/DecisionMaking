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
