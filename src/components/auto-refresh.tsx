"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** 一定間隔で画面のデータを読み直す（LINE連携の完了を待つときなど） */
export function AutoRefresh({ seconds = 3 }: { seconds?: number }) {
  const router = useRouter();
  useEffect(() => {
    const id = setInterval(() => router.refresh(), seconds * 1000);
    return () => clearInterval(id);
  }, [router, seconds]);
  return null;
}
