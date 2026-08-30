// 決められるのは、自分が選べることだけ。
//
// 「先方の出資が決まるかどうか」「上司が承認するか」は、相手の決断であって
// 本人の決断ではない。それを決断として登録すると、自分では動かせないものを
// 抱えたまま期限だけが過ぎていく。設計書1.1が名指しする「決断回避」が、
// 相手待ちという形を取ったものになる。
//
// ただし、相手が決める間にも本人が決めることは必ずある。
// いつまで待つか。待つ間に何を進めるか。来なかったらどうするか。
// ここはそれを手渡すだけで、断定はしない。決めるのは本人(INV-05 / 6.1)。

export type OwnerVerdict = "SELF" | "OTHERS" | "UNKNOWN";

/** 本人が入っている言い方。「自分(最終決裁は役員)」も本人が決める側 */
const SELF =
  /自分|私|わたし|僕|ぼく|俺|おれ|自身|夫婦|二人|ふたり|弊社|当社|我が社|うちの/;

/** 決めるのが別の誰かだと分かる言い方 */
const OTHERS =
  /相手|先方|取引先|クライアント|顧客|お客(?:様|さん)|上司|部長|課長|役員|取締役|理事|委員会|審査|選考|親|義父|義母|銀行|学校|大家|管理会社|人事|採用担当|.{1,10}(?:さん|様|氏)$/;

/** 「〜が決まる」「審査に通る」── 決める主語が本人でない言い回し */
const DECIDED_BY_OTHERS =
  /(?:が|は|に)(?:決まる|決まらな|通る|通らな|承認|採用|合格|受か|選ばれ|認められ|下りる|下りた)/;

/** 相手の結論を待っている状態 */
const WAITING =
  /(?:返事|連絡|回答|結果|通知|審査|判断)(?:を|が)?(?:待|まっ|来る|くる)|祈って|願って/;

/**
 * この決断を決めるのは誰か。
 * 迷ったら UNKNOWN を返す。確からしいときだけ本人に尋ねる。
 */
export function whoDecides(question: string, ownerRole: string): OwnerVerdict {
  const owner = ownerRole.trim();
  // 本人が入っているなら、他に誰がいても本人が決める側
  if (SELF.test(owner)) return "SELF";
  if (owner && OTHERS.test(owner)) return "OTHERS";
  if (DECIDED_BY_OTHERS.test(question) || WAITING.test(question)) return "OTHERS";
  return "UNKNOWN";
}

/**
 * 相手が決める間に、本人が決められること。
 * 相手の呼び名はそのまま使う(語尾を機械で変えると壊れる)。
 */
export function selfQuestions(ownerRole: string): string[] {
  const who = ownerRole.trim() || "相手";
  return [
    `${who}の結論を、いつまで待つか`,
    "待っている間に、自分は何を進めるか",
    `${who}が決めなかったら、どうするか`,
  ];
}
