"use server";

import { revalidatePath } from "next/cache";
import { randomBytes } from "node:crypto";
import { requireAdmin } from "@/lib/admin-auth";
import { createAdminClient } from "@/lib/supabase/admin";

export type InviteState = { ok?: boolean; error?: string; message?: string };

export async function createInvite(_prev: InviteState, fd: FormData): Promise<InviteState> {
  await requireAdmin();
  const trialDays = Number(fd.get("trial_days"));
  const maxUses = Number(fd.get("max_uses"));
  const note = String(fd.get("note") ?? "").trim().slice(0, 200) || null;
  const custom = String(fd.get("code") ?? "").trim().toUpperCase();

  if (!Number.isInteger(trialDays) || trialDays < 1 || trialDays > 730) return { error: "無料日数は1〜730日で入力してください" };
  if (!Number.isInteger(maxUses) || maxUses < 1 || maxUses > 1000) return { error: "使える回数は1〜1000回で入力してください" };
  if (custom && !/^[A-Z0-9]{6,20}$/.test(custom)) return { error: "コードは英大文字と数字で6〜20文字にしてください" };

  const code = custom || `BETA${randomBytes(4).toString("hex").toUpperCase()}`;
  const { error } = await createAdminClient().from("beta_invites").insert({ code, trial_days: trialDays, max_uses: maxUses, note });
  if (error) return { error: error.code === "23505" ? "そのコードはすでにあります" : error.message };
  revalidatePath("/admin/invites");
  return { ok: true, message: `招待コード ${code} を作成しました` };
}
