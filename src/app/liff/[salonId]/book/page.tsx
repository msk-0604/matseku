import type { Metadata } from "next";
import { BookView } from "./book-view";

export const metadata: Metadata = { title: "ご予約" };

export default function LiffBookPage() {
  return <BookView />;
}
