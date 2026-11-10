import { Suspense } from "react";
import Link from "next/link";
import { requireSalon } from "@/lib/auth";
import { BottomNav, NavBar } from "@/components/bottom-nav";
import { signOut } from "../actions";

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
      <main className="flex-1 px-4 pt-4 pb-24">{children}</main>
      <Suspense fallback={<NavBar pathname="" />}>
        <BottomNav />
      </Suspense>
    </div>
  );
}
