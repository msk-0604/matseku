import { NextResponse, type NextRequest } from "next/server";
import { loadMetrics, pct } from "@/lib/admin-metrics";
import { addDays, jstToIso, todayJst } from "@/lib/date";
import { sendEmail, simpleEmail } from "@/lib/email";
import { createAdminClient } from "@/lib/supabase/admin";
import { yen } from "@/lib/text";
import { getBaseUrl } from "@/lib/url";

/*
 * 運営者への日次レポート（Vercel Cron が毎日 9:00 JST に呼ぶ）
 * ついでに、保存されなかった写真ファイル（1日以上前）を削除する。
 *   curl -H "Authorization: Bearer $CRON_SECRET" "https://<URL>/api/cron/daily-report"
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return new NextResponse("unauthorized", { status: 401 });
  }

  const admin = createAdminClient();
  const today = todayJst();
  const yesterday = addDays(today, -1);
  const from = jstToIso(yesterday, "00:00");
  const to = jstToIso(today, "00:00");

  const countEvents = async (type: string, extra?: (q: ReturnType<typeof base>) => ReturnType<typeof base>) => {
    let q = base(type);
    if (extra) q = extra(q);
    const { count } = await q;
    return count ?? 0;
  };
  function base(type: string) {
    return admin.from("events").select("id", { count: "exact", head: true }).eq("type", type).gte("created_at", from).lt("created_at", to);
  }

  const [signups, converted, canceled, remindersSent, remindersFailed, bookingsReminder, bookingsDirect, metrics] = await Promise.all([
    countEvents("signup"),
    countEvents("subscription_status_changed", (q) => q.eq("props->>from", "trialing").eq("props->>to", "active")),
    countEvents("subscription_status_changed", (q) => q.eq("props->>to", "canceled")),
    countEvents("reminder_sent"),
    countEvents("reminder_failed"),
    countEvents("booking_created", (q) => q.eq("props->>source", "reminder")),
    countEvents("booking_created", (q) => q.eq("props->>source", "direct")),
    loadMetrics(),
  ]);

  // 写真の掃除
  const { data: orphans } = await admin.rpc("orphan_visit_photos", { p_limit: 500 });
  const orphanPaths = ((orphans ?? []) as { name: string }[]).map((o) => o.name);
  if (orphanPaths.length) await admin.storage.from("visit-photos").remove(orphanPaths);

  const risky = metrics.salons.filter((s) => s.risks.length);
  const lines = [
    `【${yesterday} の動き】`,
    `新規申し込み：${signups}店　体験→有料：${converted}店　解約：${canceled}店`,
    `リペア案内：送信 ${remindersSent}通 / 失敗 ${remindersFailed}通`,
    `予約：案内から ${bookingsReminder}件 / その他 ${bookingsDirect}件`,
    "",
    "【現在】",
    `MRR ${yen(metrics.mrr)}　有料 ${metrics.paidCount}店　体験中 ${metrics.trialCount}店`,
    `体験→有料 ${pct(metrics.conversion.converted, metrics.conversion.ended)}　今月の解約率 ${pct(metrics.churn.canceled, metrics.churn.base)}`,
    `初期設定の完了率 ${pct(metrics.setupRate.done, metrics.setupRate.total)}　直近7日に使った店舗 ${pct(metrics.active7.active, metrics.active7.total)}`,
    "",
    `【解約リスク ${risky.length}店】`,
    ...risky.slice(0, 20).map((s) => `・${s.name}：${s.risks.join("、")}`),
    risky.length > 20 ? `ほか ${risky.length - 20}店` : null,
    orphanPaths.length ? `\n（保存されなかった写真 ${orphanPaths.length}件を削除しました）` : null,
  ].filter((l): l is string => l !== null);

  const adminEmail = process.env.ADMIN_REPORT_EMAIL;
  let emailed = false;
  if (adminEmail) {
    const { html, text } = simpleEmail([lines.join("\n")], { label: "管理画面を開く", url: `${await getBaseUrl()}/admin` });
    emailed = await sendEmail({ to: adminEmail, subject: `【リペアコール】日次レポート ${yesterday}`, html, text });
  }

  return NextResponse.json({ date: yesterday, emailed, orphansRemoved: orphanPaths.length, report: lines });
}
