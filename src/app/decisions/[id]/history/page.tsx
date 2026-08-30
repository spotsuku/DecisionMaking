"use client";

import { SubPage } from "@/components/SubPage";
import { HistoryPanel } from "@/components/HistoryPanel";

export default function HistoryPage() {
  return <SubPage title="履歴">{(decision) => <HistoryPanel decision={decision} />}</SubPage>;
}
