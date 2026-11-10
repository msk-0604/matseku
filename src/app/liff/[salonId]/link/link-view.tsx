"use client";

import { useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { linkCustomer } from "../../actions";
import { LiffReady, useLiff } from "../../liff-provider";

export function LinkView() {
  const { salon } = useLiff();
  const token = useSearchParams().get("t") ?? "";
  const [status, setStatus] = useState<"idle" | "sending" | "done">("idle");
  const [error, setError] = useState<string | null>(null);
  const [isFriend, setIsFriend] = useState<boolean | null>(null);

  return (
    <LiffReady>
      {({ liff, accessToken }) => {
        if (status === "done") {
          return (
            <div className="space-y-4 text-center">
              <div className="rounded-xl border border-green-300 bg-green-50 p-6">
                <p className="text-3xl">✓</p>
                <p className="mt-2 font-bold text-green-800">登録が完了しました</p>
                <p className="mt-2 text-sm leading-relaxed text-green-900">
                  リペアの時期が近づいたら、{salon.name} からLINEでお知らせします。
                </p>
              </div>
              {isFriend === false && salon.basicId && (
                <div className="space-y-2 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm">
                  <p>お知らせを受け取るには、{salon.name} のLINEを友だち追加してください。</p>
                  <a href={`https://line.me/R/ti/p/${encodeURIComponent(salon.basicId)}`} className="btn-primary w-full bg-[#06C755]">友だち追加する</a>
                </div>
              )}
              <Link href={`/liff/${salon.id}/book`} className="btn-secondary w-full">空き枠を見て予約する</Link>
              <button onClick={() => liff.closeWindow()} className="text-sm text-neutral-500">閉じる</button>
            </div>
          );
        }
        if (!token) {
          return <p className="rounded-lg bg-red-50 p-4 text-sm text-red-700">QRコードを読み取り直してください。</p>;
        }
        return (
          <div className="space-y-5 text-center">
            <p className="leading-relaxed">
              <b>{salon.name}</b> のLINEに登録します。
              <br />
              リペアの時期にお知らせが届き、LINEからそのまま予約できるようになります。
            </p>
            {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
            <button
              disabled={status === "sending"}
              className="btn-primary w-full bg-[#06C755] text-lg"
              onClick={async () => {
                setStatus("sending");
                setError(null);
                const res = await linkCustomer({ salonId: salon.id, token, accessToken });
                if (!res.ok) {
                  setError(res.error);
                  setStatus("idle");
                  return;
                }
                try {
                  setIsFriend((await liff.getFriendship()).friendFlag);
                } catch {
                  setIsFriend(null);
                }
                setStatus("done");
              }}
            >
              {status === "sending" ? "登録中…" : "登録する"}
            </button>
            <p className="text-xs text-neutral-500">登録すると、LINEのユーザー情報（ID）がサロンのお客さま情報と結び付けられます。</p>
          </div>
        );
      }}
    </LiffReady>
  );
}
