// 会話の返しの検査。
//
// 差し戻すのは、画面が壊れる場合だけ(空・長すぎ)。
// 文体の崩れ(伝聞のなぞり返し・同じ型の繰り返し)は記録するが差し戻さない。
// 差し戻すと会話の流れが切れて定型文に落ちるので、かえって不自然になる。
// また、指示を積んで形を縛るほどモデルは型にはまるので、まず自由に話させる。
// 記録は、崩れが再発したときに気づくために残す。

/** 目の前の相手に使うと又聞きに響く言い回し。相手の発言をなぞる前置きに付く */
const HEARSAY = /(とのこと|そうです|そうな|とのお話|というお話|と伺|お聞き)(ですが|でしたが|ですね|ですけれど)/;

/** 会話の返しとして長すぎる。読む気が失せる */
const MAX_CHARS = 100;

/** 前の返しと語尾が同じなら、同じ型を繰り返している */
const TAIL_CHARS = 10;

export type ReplyIssueCode = "EMPTY" | "TOO_LONG" | "HEARSAY" | "ECHO" | "SAME_SHAPE";

export interface ReplyIssue {
  code: ReplyIssueCode;
  detail: string;
}

/** 差し戻す(定型文へ戻す)のはこれだけ。他は記録のみ */
const BLOCKING: ReplyIssueCode[] = ["EMPTY", "TOO_LONG"];

export const shouldReject = (issue: ReplyIssue | null): boolean =>
  issue !== null && BLOCKING.includes(issue.code);

/**
 * 通してよい返しかを見る。問題があれば理由を返す。
 * @param text     AIが返した文
 * @param said     本人の直前の発言
 * @param lastApp  前回アプリが返した文(あれば)
 */
export function checkReply(text: string, said: string, lastApp?: string): ReplyIssue | null {
  const t = text.trim();
  if (!t) return { code: "EMPTY", detail: "空の応答" };
  if (t.length > MAX_CHARS) return { code: "TOO_LONG", detail: `${t.length}文字` };

  if (HEARSAY.test(t)) return { code: "HEARSAY", detail: "伝聞の前置き" };

  // 本人の発言を長くそのまま含んでいたら、なぞっているだけ
  const body = said.trim().replace(/[。、,.\s]/g, "");
  if (body.length >= 12) {
    const head = body.slice(0, 14);
    const flat = t.replace(/[。、,.\s]/g, "");
    if (flat.includes(head)) return { code: "ECHO", detail: "発言のなぞり返し" };
  }

  if (lastApp) {
    const tail = (s: string) => s.trim().replace(/[。、,.\s]/g, "").slice(-TAIL_CHARS);
    if (tail(t) === tail(lastApp)) return { code: "SAME_SHAPE", detail: "前回と同じ語尾" };
  }
  return null;
}
