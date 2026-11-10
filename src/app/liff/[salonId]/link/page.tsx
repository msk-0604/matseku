import { Suspense } from "react";
import type { Metadata } from "next";
import { LinkView } from "./link-view";

export const metadata: Metadata = { title: "LINE登録" };

export default function LiffLinkPage() {
  return (
    <Suspense>
      <LinkView />
    </Suspense>
  );
}
