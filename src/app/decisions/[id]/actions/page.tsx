"use client";

import { SubPage } from "@/components/SubPage";
import { ActionPanel } from "@/components/ActionPanel";

export default function ActionsPage() {
  return <SubPage title="実行の記録">{(decision, version) => <ActionPanel decision={decision} version={version} />}</SubPage>;
}
