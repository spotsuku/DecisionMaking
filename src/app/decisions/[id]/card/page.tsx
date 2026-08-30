"use client";

import { SubPage } from "@/components/SubPage";
import { DecisionCardView } from "@/components/DecisionCardView";

export default function CardPage() {
  return (
    <SubPage title="Decision Card">
      {(decision, version) => <DecisionCardView decision={decision} version={version} />}
    </SubPage>
  );
}
