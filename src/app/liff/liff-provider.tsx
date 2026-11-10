"use client";

import { createContext, use, useEffect, useState } from "react";
import type { Liff } from "@line/liff";

export type SalonPublic = { id: string; name: string; liffId: string; basicId: string | null };

type LiffState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; liff: Liff; accessToken: string };

const Ctx = createContext<{ salon: SalonPublic; state: LiffState } | null>(null);

export function useLiff() {
  const v = use(Ctx);
  if (!v) throw new Error("useLiff は LiffProvider の中で使ってください");
  return v;
}

export function LiffProvider({ salon, children }: { salon: SalonPublic; children: React.ReactNode }) {
  const [state, setState] = useState<LiffState>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const liff = (await import("@line/liff")).default;
        await liff.init({ liffId: salon.liffId });
        if (!liff.isLoggedIn()) {
          liff.login({ redirectUri: window.location.href });
          return;
        }
        const accessToken = liff.getAccessToken();
        if (!accessToken) throw new Error("no access token");
        if (!cancelled) setState({ status: "ready", liff, accessToken });
      } catch (e) {
        console.error(e);
        if (!cancelled) setState({ status: "error", message: "LINEとの接続に失敗しました。LINEアプリから開き直してください" });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [salon.liffId]);

  return <Ctx value={{ salon, state }}>{children}</Ctx>;
}

/** LIFF の準備ができるまで待ってから中身を表示する */
export function LiffReady({ children }: { children: (ready: Extract<LiffState, { status: "ready" }>) => React.ReactNode }) {
  const { state } = useLiff();
  if (state.status === "loading") return <p className="py-16 text-center text-sm text-neutral-400">読み込み中…</p>;
  if (state.status === "error") return <p className="rounded-lg bg-red-50 p-4 text-sm text-red-700">{state.message}</p>;
  return <>{children(state)}</>;
}
