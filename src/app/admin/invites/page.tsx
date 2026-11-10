import { Suspense } from "react";
import type { Metadata } from "next";
import { requireAdmin } from "@/lib/admin-auth";
import { formatDate, jstDate, todayJst } from "@/lib/date";
import { createAdminClient } from "@/lib/supabase/admin";
import { getBaseUrl } from "@/lib/url";
import { ActionForm } from "@/components/action-form";
import { CopyField } from "@/components/copy-field";
import { createInvite } from "./actions";

export const metadata: Metadata = { title: "ベータ招待" };

export default function InvitesPage() {
  return (
    <div className="space-y-6 pt-4">
      <section className="card max-w-md">
        <h2 className="mb-3 font-bold">招待コードを作る</h2>
        <ActionForm action={createInvite} submitLabel="作成する">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="trial_days" className="label">無料期間（日）</label>
              <input id="trial_days" name="trial_days" type="number" defaultValue={60} min={1} max={730} className="input" />
            </div>
            <div>
              <label htmlFor="max_uses" className="label">使える回数</label>
              <input id="max_uses" name="max_uses" type="number" defaultValue={1} min={1} max={1000} className="input" />
            </div>
          </div>
          <div>
            <label htmlFor="code" className="label">コード（空欄なら自動）</label>
            <input id="code" name="code" className="input font-mono uppercase" placeholder="BETA..." />
          </div>
          <div>
            <label htmlFor="note" className="label">メモ（誰に渡したか など）</label>
            <input id="note" name="note" className="input" />
          </div>
        </ActionForm>
      </section>
      <Suspense fallback={<p className="text-sm text-neutral-400">読み込み中…</p>}>
        <InviteList />
      </Suspense>
    </div>
  );
}

async function InviteList() {
  await requireAdmin();
  const base = await getBaseUrl();
  const today = todayJst();
  const { data } = await createAdminClient()
    .from("beta_invites")
    .select("code, trial_days, max_uses, used_count, note, created_at")
    .order("created_at", { ascending: false })
    .limit(200);
  const list = data ?? [];
  if (list.length === 0) return <p className="text-sm text-neutral-500">まだ招待コードはありません</p>;
  return (
    <ul className="space-y-3">
      {list.map((i) => (
        <li key={i.code} className="card space-y-2">
          <div className="flex flex-wrap items-baseline gap-2 text-sm">
            <b className="font-mono">{i.code}</b>
            <span>無料 {i.trial_days}日</span>
            <span className={i.used_count >= i.max_uses ? "text-red-600" : "text-neutral-600"}>使用 {i.used_count} / {i.max_uses}</span>
            {i.note && <span className="text-neutral-500">{i.note}</span>}
            <span className="ml-auto text-xs text-neutral-400">{formatDate(jstDate(i.created_at), today)}</span>
          </div>
          <CopyField value={`${base}/?invite=${i.code}#pricing`} />
        </li>
      ))}
    </ul>
  );
}
