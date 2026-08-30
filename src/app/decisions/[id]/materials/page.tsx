"use client";

import { SubPage } from "@/components/SubPage";
import { Workspace } from "@/components/Workspace";

export default function MaterialsPage() {
  return <SubPage title="材料">{(decision, version) => <Workspace decision={decision} version={version} />}</SubPage>;
}
