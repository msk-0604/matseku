"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireSalon } from "@/lib/auth";
import { lashDesignFromForm } from "@/lib/lash";

export type VisitFormState = {
  error?: string;
  fieldErrors?: Partial<Record<string, string>>;
};

const uuid = z.uuid();

const visitSchema = z.object({
  visited_at: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "来店日を入力してください"),
  menu: z
    .string()
    .trim()
    .max(100, "100文字以内で入力してください")
    .transform((v) => (v === "" ? null : v)),
  price: z
    .string()
    .transform((v) => v.normalize("NFKC").replace(/[,¥円\s]/g, ""))
    .refine((v) => v === "" || (/^\d+$/.test(v) && Number(v) <= 1_000_000), "金額は0〜1,000,000の数字で入力してください")
    .transform((v) => (v === "" ? null : Number(v))),
  note: z
    .string()
    .trim()
    .max(2000, "2000文字以内で入力してください")
    .transform((v) => (v === "" ? null : v)),
});

/**
 * 来店記録の保存（新規・編集共通）。
 * 写真はブラウザから Storage に直接アップロード済みで、ここではパスを受け取って行を作る。
 */
export async function saveVisit(
  input: { visitId: string; customerId: string; isNew: boolean },
  _prev: VisitFormState,
  fd: FormData,
): Promise<VisitFormState> {
  const { supabase, salon } = await requireSalon();
  if (!uuid.safeParse(input.visitId).success || !uuid.safeParse(input.customerId).success) {
    return { error: "不正なリクエストです" };
  }

  const parsed = visitSchema.safeParse({
    visited_at: String(fd.get("visited_at") ?? ""),
    menu: String(fd.get("menu") ?? ""),
    price: String(fd.get("price") ?? ""),
    note: String(fd.get("note") ?? ""),
  });
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) fieldErrors[String(issue.path[0])] ??= issue.message;
    return { error: "入力内容を確認してください", fieldErrors };
  }
  const values = { ...parsed.data, lash_design: lashDesignFromForm(fd) };

  // 写真のパスは「自分のサロン/この来店ID/」の下だけ受け付ける
  const prefix = `${salon.id}/${input.visitId}/`;
  const photoPaths = fd
    .getAll("photo_path")
    .map(String)
    .filter((p) => p.startsWith(prefix) && /^[0-9a-f-]+\.(jpg|jpeg|png|webp)$/i.test(p.slice(prefix.length)));
  const removeIds = fd.getAll("remove_photo_id").map(String).filter((v) => uuid.safeParse(v).success);

  if (input.isNew) {
    const { error } = await supabase
      .from("visits")
      .insert({ id: input.visitId, customer_id: input.customerId, ...values });
    if (error) return { error: `保存できませんでした（${error.message}）` };
    await supabase.from("events").insert({ salon_id: salon.id, type: "visit_created", props: {} });
  } else {
    const { error } = await supabase.from("visits").update(values).eq("id", input.visitId);
    if (error) return { error: `保存できませんでした（${error.message}）` };
  }

  if (photoPaths.length) {
    const { error } = await supabase
      .from("visit_photos")
      .upsert(
        photoPaths.map((storage_path) => ({ visit_id: input.visitId, storage_path })),
        { onConflict: "storage_path", ignoreDuplicates: true },
      );
    if (error) return { error: `写真を保存できませんでした（${error.message}）` };
  }

  if (removeIds.length) {
    const { data: toRemove } = await supabase
      .from("visit_photos")
      .select("id, storage_path")
      .eq("visit_id", input.visitId)
      .in("id", removeIds);
    if (toRemove?.length) {
      await supabase.storage.from("visit-photos").remove(toRemove.map((p) => p.storage_path as string));
      await supabase.from("visit_photos").delete().in("id", toRemove.map((p) => p.id as string));
    }
  }

  revalidatePath(`/app/customers/${input.customerId}`);
  revalidatePath("/app/customers");
  // 2週目：ここで「LINE連携QR」画面へ移動する予定
  redirect(`/app/customers/${input.customerId}`);
}

export async function deleteVisit(visitId: string) {
  const { supabase } = await requireSalon();
  const { data: visit } = await supabase.from("visits").select("customer_id").eq("id", visitId).maybeSingle();
  if (!visit) redirect("/app/customers");

  const { data: photos } = await supabase.from("visit_photos").select("storage_path").eq("visit_id", visitId);
  if (photos?.length) {
    await supabase.storage.from("visit-photos").remove(photos.map((p) => p.storage_path as string));
  }
  const { error } = await supabase.from("visits").delete().eq("id", visitId);
  if (error) throw new Error(`削除できませんでした（${error.message}）`);

  revalidatePath(`/app/customers/${visit.customer_id}`);
  redirect(`/app/customers/${visit.customer_id}`);
}
