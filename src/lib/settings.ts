"use client";

// 端末ごとの設定。いまはAI機能の入切だけ。
// プライバシーポリシーで「AIを使わずに利用できる」と書いた以上、
// 実際に切れる場所が要る。

const AI_KEY = "dm.settings.ai";

export function isAiEnabled(): boolean {
  if (typeof window === "undefined") return true;
  try {
    return window.localStorage.getItem(AI_KEY) !== "off";
  } catch {
    return true;
  }
}

export function setAiEnabled(on: boolean) {
  try {
    window.localStorage.setItem(AI_KEY, on ? "on" : "off");
  } catch {
    // 保存できなくても既定(オン)で動く
  }
}
