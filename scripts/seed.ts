/**
 * テスト用データを作るスクリプト
 *   npm run seed
 *
 * .env.local の SEED_EMAIL / SEED_PASSWORD でログインユーザーを作り（既にあればパスワードを更新）、
 * そのユーザーのサロン1件・顧客10人・来店記録を作り直します。
 * ※ そのユーザーのサロンにある既存データは削除されます。ほかのユーザーのデータには触れません。
 */
import { config } from "dotenv";
import { randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

config({ path: ".env.local" });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const email = process.env.SEED_EMAIL ?? "demo@example.com";
const password = process.env.SEED_PASSWORD;

if (!url || !serviceKey) {
  console.error("NEXT_PUBLIC_SUPABASE_URL と SUPABASE_SERVICE_ROLE_KEY を .env.local に設定してください");
  process.exit(1);
}
if (!password || password.length < 8) {
  console.error("SEED_PASSWORD（8文字以上）を .env.local に設定してください");
  process.exit(1);
}

const supabase = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

const JST = 9 * 60 * 60 * 1000;
const daysAgo = (n: number) => new Date(Date.now() + JST - n * 86_400_000).toISOString().slice(0, 10);

async function findUserId(): Promise<string | null> {
  for (let page = 1; page <= 50; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const hit = data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
    if (hit) return hit.id;
    if (data.users.length < 200) return null;
  }
  return null;
}

type Design = Record<string, unknown>;
const design = (technique: string, len: [number, number, number], curl: string[], thickness: number, count: number, next_note: string | null = null): Design => ({
  technique,
  length: {
    left: { inner: len[0], center: len[1], outer: len[2] },
    right: { inner: len[0], center: len[1], outer: len[2] },
  },
  curl,
  thickness,
  count,
  color: "ブラック",
  glue: "速乾タイプ",
  next_note,
});

// [名前, ふりがな, 電話, アレルギー(同意あり), 来店からの経過日数の並び（新しい順）, メニュー, 金額, 設計]
const CUSTOMERS: [string, string, string | null, string | null, number[], string, number, Design][] = [
  ["青木 美咲", "あおき みさき", "09011112222", "グルーで目がしみやすい。低刺激グルーを使用", [24, 47, 70], "ボリュームラッシュ", 8800, design("ボリューム", [9, 11, 12], ["C", "D"], 0.07, 400, "目尻を1mm長めに")],
  ["井上 さくら", "いのうえ さくら", "08033334444", null, [10, 33, 55, 80], "付け放題", 6600, design("シングル", [9, 10, 11], ["C"], 0.15, 140)],
  ["上田 あかり", "うえだ あかり", "07055556666", null, [22], "シングル 120本", 5500, design("シングル", [8, 10, 11], ["J", "C"], 0.15, 120, "初回。次回はボリュームを提案")],
  ["加藤 由美", "かとう ゆみ", "09077778888", "花粉症（春は目がかゆくなりやすい）", [3, 25, 49], "フラットラッシュ", 7700, design("フラット", [10, 11, 12], ["CC"], 0.15, 130)],
  ["木村 真央", "きむら まお", null, null, [60, 85], "付け放題", 6600, design("シングル", [9, 10, 11], ["C"], 0.15, 140)],
  ["佐藤 優花", "さとう ゆうか", "08012340000", null, [28, 50], "ボリュームラッシュ", 8800, design("ボリューム", [10, 11, 12], ["D"], 0.06, 500)],
  ["鈴木 杏奈", "すずき あんな", "09098765432", null, [], "付け放題", 6600, design("シングル", [9, 10, 11], ["C"], 0.15, 140)],
  ["田中 莉子", "たなか りこ", "08055551234", null, [15, 36], "ラッシュリフト", 5500, { technique: "ラッシュリフト", next_note: "ロッドはMサイズ" }],
  ["中村 彩花", "なかむら あやか", "07011223344", null, [46, 70, 92], "シングル 100本", 4950, design("シングル", [8, 9, 10], ["J"], 0.12, 100)],
  ["山本 結衣", "やまもと ゆい", "09044445555", null, [21], "ボリュームラッシュ", 8800, design("ボリューム", [9, 10, 11], ["C"], 0.07, 400)],
];

async function main() {
  let userId = await findUserId();
  if (userId) {
    const { error } = await supabase.auth.admin.updateUserById(userId, { password, email_confirm: true });
    if (error) throw error;
    console.log(`ユーザーを更新：${email}`);
  } else {
    const { data, error } = await supabase.auth.admin.createUser({ email, password, email_confirm: true });
    if (error) throw error;
    userId = data.user.id;
    console.log(`ユーザーを作成：${email}`);
  }

  // 既存のサロン（とその配下のデータ）を削除して作り直す
  const { data: old } = await supabase.from("salons").select("id").eq("owner_user_id", userId).maybeSingle();
  if (old) {
    const { data: files } = await supabase.from("visit_photos").select("storage_path").eq("salon_id", old.id);
    if (files?.length) await supabase.storage.from("visit-photos").remove(files.map((f) => f.storage_path));
    const { error } = await supabase.from("salons").delete().eq("id", old.id);
    if (error) throw error;
  }

  const { data: salon, error: salonErr } = await supabase
    .from("salons")
    .insert({
      owner_user_id: userId,
      name: "テストサロン Lash Bloom",
      default_repair_days: 21,
      subscription_status: "trialing",
      trial_ends_at: new Date(Date.now() + 14 * 86_400_000).toISOString(),
      referral_code: randomBytes(4).toString("hex").toUpperCase(),
    })
    .select("id")
    .single();
  if (salonErr) throw salonErr;

  let visitCount = 0;
  for (const [name, kana, phone, allergy, visitDaysAgo, menu, price, lash] of CUSTOMERS) {
    const { data: customer, error } = await supabase
      .from("customers")
      .insert({
        salon_id: salon.id,
        name,
        name_kana: kana,
        phone,
        sensitive_consent: allergy != null,
        allergy_note: allergy,
        patch_test_on: allergy ? daysAgo(visitDaysAgo.at(-1)! + 3) : null,
        memo: visitDaysAgo.length === 0 ? "ホットペッパーから予約。来店前" : null,
      })
      .select("id")
      .single();
    if (error) throw error;

    if (visitDaysAgo.length) {
      const rows = visitDaysAgo.map((d, i) => ({
        salon_id: salon.id,
        customer_id: customer.id,
        visited_at: daysAgo(d),
        menu,
        price,
        lash_design: i === 0 ? lash : { ...lash, next_note: null },
        note: i === visitDaysAgo.length - 1 ? "ホットペッパー経由の初回" : null,
      }));
      const { error: vErr } = await supabase.from("visits").insert(rows);
      if (vErr) throw vErr;
      visitCount += rows.length;
    }
  }

  console.log(`サロン1件・顧客${CUSTOMERS.length}人・来店記録${visitCount}件を作成しました`);
  console.log(`ログイン：${email}`);
}

main().catch((e) => {
  console.error("失敗しました:", e.message ?? e);
  process.exit(1);
});
