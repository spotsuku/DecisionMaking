// 登録の境界と、登録前データの引き継ぎのテスト。
//
// 一番守りたいのは「登録なしで書いたものが、登録した瞬間に消えないこと」。

import { describe, it, expect } from "vitest";
import { needsAccount, sendErrorText, type AuthState } from "../src/lib/auth";
import { mergeDB } from "../src/lib/db/sync";
import { emptyDB, type DB } from "../src/lib/types";

describe("どこでアカウントを求めるか", () => {
  it("未ログインのときだけ求める", () => {
    expect(needsAccount({ status: "ANONYMOUS" })).toBe(true);
  });

  it("ログイン済みなら求めない", () => {
    const signedIn: AuthState = { status: "SIGNED_IN", account: { id: "u1", email: "a@example.com" } };
    expect(needsAccount(signedIn)).toBe(false);
  });

  it("認証基盤が無い環境では求めない(端末内だけで全機能が動く)", () => {
    expect(needsAccount({ status: "DISABLED" })).toBe(false);
  });

  it("判定前に登録を求めない(一瞬だけ登録画面が出るのを防ぐ)", () => {
    expect(needsAccount({ status: "LOADING" })).toBe(false);
  });
});

describe("登録前に書いたものの引き継ぎ", () => {
  function local(): DB {
    const db = emptyDB();
    db.journal.push({ id: "j1", text: "犬を飼うか迷ってる", createdAt: "2026-08-30T01:00:00Z" });
    db.decisions.push({
      id: "d1", title: "犬を迎えるか", domain: "FAMILY", status: "DIAGNOSING",
      currentVersionNo: 1, dueAt: null, reviewAt: null, riskLevel: "NORMAL",
      createdAt: "2026-08-30T01:05:00Z", closedAt: null, hidden: false,
    });
    db.questions.push({
      id: "q1", versionId: "v1", questionCode: "Q_CRITERIA",
      text: "", purpose: "", gap: "VALUE", sequenceNo: 1,
    });
    db.answers.push({
      id: "a1", questionId: "q1", versionId: "v1", questionCode: "Q_CRITERIA",
      answerText: "家族との時間", answerJson: { protect: "家族との時間" },
      submittedAt: "2026-08-30T01:06:00Z",
    });
    return db;
  }

  it("受入テスト: 登録前の記録が、空のアカウントに入っても消えない", () => {
    const merged = mergeDB(local(), emptyDB());
    expect(merged.journal).toHaveLength(1);
    expect(merged.decisions).toHaveLength(1);
    expect(merged.answers[0].answerJson.protect).toBe("家族との時間");
  });

  it("他の端末の記録と混ざっても、どちらも残る", () => {
    const other = emptyDB();
    other.decisions.push({
      id: "d2", title: "別端末の決断", domain: "WORK", status: "DRAFT",
      currentVersionNo: 1, dueAt: null, reviewAt: null, riskLevel: "NORMAL",
      createdAt: "2026-08-29T00:00:00Z", closedAt: null, hidden: false,
    });
    const merged = mergeDB(local(), other);
    expect(merged.decisions.map((d) => d.id).sort()).toEqual(["d1", "d2"]);
  });

  it("同じidなら、いま端末で見ているものを残す", () => {
    const stale = local();
    stale.decisions[0].title = "クラウドの古い版";
    const merged = mergeDB(local(), stale);
    expect(merged.decisions).toHaveLength(1);
    expect(merged.decisions[0].title).toBe("犬を迎えるか");
  });
});

describe("メールを送れなかったときの文", () => {
  it("504は、本人の操作では直らないと伝える。記録が無事なことも言う", () => {
    const text = sendErrorText({ message: "HTTP 504", status: 504 });
    expect(text).not.toMatch(/HTTP/);
    expect(text).toMatch(/送信設定/);
    expect(text).toMatch(/消えていません/);
  });

  it("送信上限は、待てば直ると伝える", () => {
    expect(sendErrorText({ message: "email rate limit exceeded" })).toMatch(/少し待って/);
  });

  it("アドレスの形式は、本人が直せるのでそう言う", () => {
    expect(sendErrorText({ message: "Unable to validate email address: invalid format" })).toMatch(/形式/);
  });

  it("生のメッセージをそのまま画面に出さない", () => {
    for (const m of ["HTTP 504", "context deadline exceeded", "Internal Server Error"]) {
      expect(sendErrorText({ message: m, status: 500 })).not.toBe(m);
    }
  });
});
