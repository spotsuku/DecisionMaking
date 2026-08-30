"use client";

import { useRouter } from "next/navigation";
import { SubPage } from "@/components/SubPage";
import { ReviewPanel } from "@/components/ReviewPanel";

export default function ReviewPage() {
  const router = useRouter();
  return (
    <SubPage title="レビュー">
      {(decision, version) => (
        <ReviewPanel
          decision={decision}
          version={version}
          onRevised={() => router.push(`/decisions/${decision.id}/diagnose`)}
        />
      )}
    </SubPage>
  );
}
