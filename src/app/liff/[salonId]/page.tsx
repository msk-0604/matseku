"use client";

import Link from "next/link";
import { LiffReady, useLiff } from "../liff-provider";

/** LIFF のエンドポイント。liff.state があれば LIFF が該当ページへ移動する */
export default function LiffHome() {
  const { salon } = useLiff();
  return (
    <LiffReady>
      {() => (
        <div className="space-y-4 text-center">
          <p className="text-sm text-neutral-600">{salon.name} のLINE予約ページです</p>
          <Link href={`/liff/${salon.id}/book`} className="btn-primary w-full">空き枠を見て予約する</Link>
        </div>
      )}
    </LiffReady>
  );
}
