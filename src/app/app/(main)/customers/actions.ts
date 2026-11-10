"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireSalon } from "@/lib/auth";
import { digitsOnly, toHiragana } from "@/lib/text";

export type CustomerFormState = {
  error?: string;
  fieldErrors?: Partial<Record<string, string>>;
};

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `${max}文字以内で入力してください`)
    .transform((v) => (v === "" ? null : v));

const optionalDate = z
  .string()
  .trim()
  .refine((v) => v === "" || /^\d{4}-\d{2}-\d{2}$/.test(v), "日付の形式が正しくありません")
  .transform((v) => (v === "" ? null : v));

const customerSchema = z.object({
  name: z.string().trim().min(1, "お名前を入力してください").max(100),
  name_kana: z
    .string()
    .transform(toHiragana)
    .pipe(
      z
        .string()
        .min(1, "ふりがなを入力してください")
        .max(100)
        .regex(/^[ぁ-ゖー\s]+$/, "ふりがなは ひらがな で入力してください"),
    ),
  phone: z
    .string()
    .transform(digitsOnly)
    .refine((v) => v === "" || /^\d{10,11}$/.test(v), "電話番号は10〜11桁の数字で入力してください")
    .transform((v) => (v === "" ? null : v)),
  birthday: optionalDate,
  memo: optionalText(2000),
  allergy_note: optionalText(1000),
  patch_test_on: optionalDate,
  sensitive_consent: z.boolean(),
  repair_days: z
    .string()
    .transform((v) => v.normalize("NFKC").trim())
    .refine((v) => v === "" || (/^\d+$/.test(v) && +v >= 7 && +v <= 90), "7〜90日の範囲で入力してください")
    .transform((v) => (v === "" ? null : Number(v))),
  notify_opt_out: z.boolean(),
});

function formToObject(fd: FormData) {
  const s = (k: string) => String(fd.get(k) ?? "");
  return {
    name: s("name"),
    name_kana: s("name_kana"),
    phone: s("phone"),
    birthday: s("birthday"),
    memo: s("memo"),
    allergy_note: s("allergy_note"),
    patch_test_on: s("patch_test_on"),
    sensitive_consent: fd.get("sensitive_consent") === "on",
    repair_days: s("repair_days"),
    notify_opt_out: fd.get("notify_opt_out") === "on",
  };
}

export async function saveCustomer(
  customerId: string | null,
  _prev: CustomerFormState,
  fd: FormData,
): Promise<CustomerFormState> {
  const { supabase, salon } = await requireSalon();

  const parsed = customerSchema.safeParse(formToObject(fd));
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0]);
      fieldErrors[key] ??= issue.message;
    }
    return { error: "入力内容を確認してください", fieldErrors };
  }
  const values = parsed.data;
  // 本人同意がない場合、要配慮情報は保存しない
  if (!values.sensitive_consent) values.allergy_note = null;

  let id = customerId;
  if (id) {
    const { error } = await supabase.from("customers").update(values).eq("id", id);
    if (error) return { error: `保存できませんでした（${error.message}）` };
  } else {
    const { data, error } = await supabase.from("customers").insert(values).select("id").single();
    if (error) return { error: `保存できませんでした（${error.message}）` };
    id = data.id as string;
    await supabase.from("events").insert({ salon_id: salon.id, type: "customer_created", props: {} });
  }

  revalidatePath("/app/customers");
  redirect(`/app/customers/${id}`);
}

export async function deleteCustomer(customerId: string) {
  const { supabase } = await requireSalon();

  // 写真ファイルを先に消す（行は ON DELETE CASCADE で消える）
  const { data: visits } = await supabase.from("visits").select("id").eq("customer_id", customerId);
  const visitIds = (visits ?? []).map((v) => v.id as string);
  const { data: photos } = visitIds.length
    ? await supabase.from("visit_photos").select("storage_path").in("visit_id", visitIds)
    : { data: [] as { storage_path: string }[] };
  const paths = (photos ?? []).map((p) => p.storage_path as string);
  if (paths.length) await supabase.storage.from("visit-photos").remove(paths);

  const { error } = await supabase.from("customers").delete().eq("id", customerId);
  if (error) throw new Error(`削除できませんでした（${error.message}）`);

  revalidatePath("/app/customers");
  redirect("/app/customers");
}
