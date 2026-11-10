import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { requireAdmin } from "@/lib/admin-auth";

export const metadata: Metadata = { title: { default: "運営管理", template: "%s | 運営管理" }, robots: { index: false } };

async function Gate({ children }: { children: React.ReactNode }) {
  await requireAdmin();
  return <>{children}</>;
}

export default function AdminLayout({ children }: LayoutProps<"/admin">) {
  return (
    <div className="mx-auto min-h-dvh max-w-5xl px-4 pb-16">
      <header className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-neutral-200 py-3">
        <span className="font-bold">リペアコール 運営管理</span>
        <nav className="flex gap-3 text-sm">
          <Link href="/admin" className="text-brand-600">ダッシュボード</Link>
          <Link href="/admin/invites" className="text-brand-600">ベータ招待</Link>
        </nav>
      </header>
      <Suspense fallback={<p className="py-16 text-center text-sm text-neutral-400">読み込み中…</p>}>
        <Gate>{children}</Gate>
      </Suspense>
    </div>
  );
}
