import { Suspense } from "react";
import Link from "next/link";
import { after } from "next/server";
import { todayJst } from "@/lib/date";
import { requireSalon } from "@/lib/auth";
import { BottomNav, NavBar } from "@/components/bottom-nav";
import { signOut } from "../actions";

const STATUS_MESSAGE: Record<string, string> = {
  past_due: "お支払いが確認できていません。カード情報をご確認ください（このままだと読み取り専用になります）。",
  canceled: "ご契約が終了しているため、読み取り専用です。自動案内も停止しています。",
  unpaid: "お支払いが確認できないため、読み取り専用です。自動案内も停止しています。",
  incomplete: "お支払いの手続きが完了していません。",
  incomplete_expired: "お支払いの手続きが完了しなかったため、読み取り専用です。",
  paused: "ご契約が一時停止中のため、読み取り専用です。",
};

async function BillingBanner() {
  const { supabase, salon } = await requireSalon();
  // 「直近7日に使った店舗」の集計用に、使った日を1日1行で記録する（表示を遅らせないよう後で実行）
  const day = todayJst();
  after(async () => {
    await supabase.from("salon_activity").upsert({ salon_id: salon.id, day }, { onConflict: "salon_id,day", ignoreDuplicates: true });
  });
  const msg = STATUS_MESSAGE[salon.subscription_status];
  if (!msg) return null;
  return (
    <Link href="/app/settings#billing" className="block bg-amber-100 px-4 py-2 text-sm text-amber-900">
      {msg} <span className="underline">プラン・お支払い</span>
    </Link>
  );
}

async function SalonName() {
  const { salon } = await requireSalon();
  return <span className="truncate">{salon.name}</span>;
}

export default function MainLayout({ children }: LayoutProps<"/app">) {
  return (
    <div className="mx-auto flex min-h-dvh max-w-xl flex-col">
      <header className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-neutral-200 bg-white/95 px-4 py-3 backdrop-blur">
        <Link href="/app/customers" className="min-w-0 flex-1 text-base font-bold">
          <Suspense fallback={<span className="text-neutral-400">リペアコール</span>}>
            <SalonName />
          </Suspense>
        </Link>
        <form action={signOut}>
          <button className="text-sm text-neutral-500 underline-offset-2 active:underline">ログアウト</button>
        </form>
      </header>
      <Suspense>
        <BillingBanner />
      </Suspense>
      <main className="flex-1 px-4 pt-4 pb-24">{children}</main>
      <Suspense fallback={<NavBar pathname="" />}>
        <BottomNav />
      </Suspense>
    </div>
  );
}
