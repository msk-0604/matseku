import { NextResponse, type NextRequest } from "next/server";
import { decrypt } from "@/lib/crypto";
import { daysBetween, jstHour, jstMonth, todayJst } from "@/lib/date";
import { sendEmail, simpleEmail } from "@/lib/email";
import { liffUrl, pushMessage } from "@/lib/line";
import { reminderFlex, renderTemplate } from "@/lib/reminder";
import { createAdminClient } from "@/lib/supabase/admin";

/*
 * 毎朝のリペア案内（Vercel Cron が毎日 10:00 JST に呼ぶ）
 *
 * 手動で試すとき：
 *   curl -H "Authorization: Bearer $CRON_SECRET" "https://<URL>/api/cron/reminders?dry=1"
 *   dry=1 … 送らずに対象者の件数だけ返す
 */

const SEND_FROM_HOUR = 10;
const SEND_UNTIL_HOUR = 20; // 20:00 になったら送らない
const MONTHLY_FREE_LIMIT = 200;
const STOP_AT = 190;

type Due = {
  salon_id: string;
  customer_id: string;
  customer_name: string;
  line_user_id: string;
  cycle_visit_id: string;
  visited_at: string;
};

type SalonRow = {
  id: string;
  name: string;
  owner_user_id: string;
  line_access_token: string;
  liff_id: string;
  reminder_template: string | null;
};

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return new NextResponse("unauthorized", { status: 401 });
  }
  const dry = request.nextUrl.searchParams.get("dry") === "1";

  const hour = jstHour();
  if (!dry && (hour < SEND_FROM_HOUR || hour >= SEND_UNTIL_HOUR)) {
    return NextResponse.json({ skipped: `送信時間外です（日本時間 ${hour}時）` });
  }

  const admin = createAdminClient();
  const today = todayJst();
  const month = jstMonth();

  const { data: due, error } = await admin.rpc("due_reminders", { p_today: today });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const rows = (due ?? []) as Due[];

  const bySalon = new Map<string, Due[]>();
  for (const r of rows) bySalon.set(r.salon_id, [...(bySalon.get(r.salon_id) ?? []), r]);

  if (dry) {
    return NextResponse.json({
      dry: true,
      today,
      total: rows.length,
      salons: [...bySalon.entries()].map(([salonId, list]) => ({ salonId, count: list.length })),
    });
  }

  const summary: Record<string, { sent: number; failed: number; stoppedByLimit: boolean }> = {};

  for (const [salonId, list] of bySalon) {
    const result = { sent: 0, failed: 0, stoppedByLimit: false };
    summary[salonId] = result;

    const { data: salon } = await admin
      .from("salons")
      .select("id, name, owner_user_id, line_access_token, liff_id, reminder_template")
      .eq("id", salonId)
      .single<SalonRow>();
    if (!salon) continue;

    let token: string;
    try {
      token = decrypt(salon.line_access_token);
    } catch {
      await logEvent(admin, salonId, "reminder_failed", { reason: "token_decrypt_failed" });
      continue;
    }

    const { data: usage } = await admin.from("line_usage").select("push_count").eq("salon_id", salonId).eq("month", month).maybeSingle();
    let count = usage?.push_count ?? 0;

    for (const d of list) {
      if (count >= STOP_AT) {
        result.stoppedByLimit = true;
        await notifyLimit(admin, salon, month, count);
        break;
      }

      // 先に予約（pending）を入れる。同じ来店への二重送信はユニーク制約で防ぐ
      const { data: reminder } = await admin
        .from("reminders")
        .upsert(
          { salon_id: salonId, customer_id: d.customer_id, cycle_visit_id: d.cycle_visit_id, status: "pending" },
          { onConflict: "customer_id,cycle_visit_id", ignoreDuplicates: true },
        )
        .select("id")
        .maybeSingle();
      if (!reminder) continue;

      const message = reminderFlex({
        salonName: salon.name,
        visitedAt: d.visited_at,
        bookUrl: liffUrl(salon.liff_id, "/book"),
        text: renderTemplate(salon.reminder_template, {
          name: d.customer_name,
          salonName: salon.name,
          visitedAt: d.visited_at,
          days: daysBetween(d.visited_at, today),
        }),
      });

      // 失敗したら1回だけ再送（同じ retryKey なので二重には届かない）
      let res = await pushMessage(token, d.line_user_id, [message], reminder.id);
      if (!res.ok && (res.status === 0 || res.status >= 500 || res.status === 429)) {
        await new Promise((r) => setTimeout(r, 1500));
        res = await pushMessage(token, d.line_user_id, [message], reminder.id);
      }

      if (res.ok) {
        await admin.from("reminders").update({ status: "sent", sent_at: new Date().toISOString() }).eq("id", reminder.id);
        const { data: newCount } = await admin.rpc("increment_line_usage", { p_salon_id: salonId, p_month: month });
        count = (newCount as number | null) ?? count + 1;
        result.sent++;
        await logEvent(admin, salonId, "reminder_sent", {});
      } else {
        await admin.from("reminders").update({ status: "failed" }).eq("id", reminder.id);
        result.failed++;
        await logEvent(admin, salonId, "reminder_failed", { status: res.status, body: res.body });
        // トークンが無効なら、このサロンへの送信はやめる
        if (res.status === 401 || res.status === 403) break;
      }
    }
  }

  return NextResponse.json({ today, total: rows.length, summary });
}

async function logEvent(admin: ReturnType<typeof createAdminClient>, salonId: string, type: string, props: object) {
  await admin.from("events").insert({ salon_id: salonId, type, props });
}

/** 今月の上限に達したことをサロンにメールで知らせる（月1回だけ） */
async function notifyLimit(admin: ReturnType<typeof createAdminClient>, salon: SalonRow, month: string, count: number) {
  const { count: already } = await admin
    .from("events")
    .select("id", { count: "exact", head: true })
    .eq("salon_id", salon.id)
    .eq("type", "line_quota_reached")
    .eq("props->>month", month);
  if (already) return;

  await logEvent(admin, salon.id, "line_quota_reached", { month, count });
  const { data } = await admin.auth.admin.getUserById(salon.owner_user_id);
  const email = data.user?.email;
  if (!email) return;
  const { html, text } = simpleEmail([
    `${salon.name} さま`,
    `今月のLINE送信数が ${count}通 になりました。LINE公式アカウントの無料プラン（月${MONTHLY_FREE_LIMIT}通）を超えないよう、今月の自動案内を止めています。`,
    "来月1日から自動で再開します。今月も送りたい場合は、LINE公式アカウントの料金プランの変更をご検討ください。",
  ]);
  await sendEmail({ to: email, subject: "【リペアコール】今月のLINE送信数が上限に近づきました", html, text });
}
