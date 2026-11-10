import "server-only";
import { addDays, jstMonth, jstToIso, todayJst } from "@/lib/date";
import { createAdminClient } from "@/lib/supabase/admin";

/*
 * 運営者向けの集計。お客さまの個人情報（名前・カルテ）は一切読まない。
 * 対象はサロン単位の件数と利用状況だけ。
 */

const MONTHLY = 7480;
const YEARLY = 74800;
const PAID = ["active", "past_due"];
const LIVE = ["trialing", "active", "past_due"];

export type SalonMetric = {
  id: string;
  name: string;
  status: string;
  plan: string | null;
  createdAt: string;
  trialEndsAt: string | null;
  setupDone: boolean;
  setupSteps: { line: boolean; webhook: boolean; slots: boolean };
  lastActiveDay: string | null;
  reminderBookingsThisMonth: number;
  pushThisMonth: number;
  paymentFailedRecently: boolean;
  source: string;
  risks: string[];
};

export type Metrics = {
  today: string;
  mrr: number;
  paidCount: number;
  trialCount: number;
  conversion: { converted: number; ended: number };
  churn: { canceled: number; base: number };
  setupRate: { done: number; total: number };
  active7: { active: number; total: number };
  sources: { source: string; trials: number; paid: number }[];
  salons: SalonMetric[];
};

function sourceOf(s: { acquisition: Record<string, string | null> | null; beta_invite_code: string | null }): string {
  const a = s.acquisition ?? {};
  if (a.ref) return `紹介：${a.ref}`;
  if (s.beta_invite_code) return `招待：${s.beta_invite_code}`;
  if (a.utm_source) return `UTM：${a.utm_source}${a.utm_campaign ? ` / ${a.utm_campaign}` : ""}`;
  return "直接";
}

export async function loadMetrics(): Promise<Metrics> {
  const admin = createAdminClient();
  const today = todayJst();
  const month = jstMonth();
  const monthStartIso = jstToIso(`${month}-01`, "00:00");
  const since30 = addDays(today, -30);
  const since7 = addDays(today, -6);

  const [salonsRes, slotsRes, activityRes, bookingsRes, usageRes, failedRes, statusRes] = await Promise.all([
    admin
      .from("salons")
      .select("id, name, subscription_status, plan, created_at, trial_ends_at, line_connected_at, line_webhook_verified_at, acquisition, beta_invite_code")
      .order("created_at", { ascending: false })
      .limit(5000),
    admin.from("slots").select("salon_id").limit(100000),
    admin.from("salon_activity").select("salon_id, day").gte("day", since30).limit(100000),
    admin.from("bookings").select("salon_id").eq("source", "reminder").neq("status", "canceled").gte("created_at", monthStartIso).limit(100000),
    admin.from("line_usage").select("salon_id, push_count").eq("month", month),
    admin.from("events").select("salon_id").eq("type", "payment_failed").gte("created_at", jstToIso(addDays(today, -14), "00:00")),
    admin.from("events").select("salon_id, props, created_at").eq("type", "subscription_status_changed").limit(100000),
  ]);

  const salonsRaw = salonsRes.data ?? [];
  const hasSlots = new Set((slotsRes.data ?? []).map((r) => r.salon_id as string));
  const lastActive = new Map<string, string>();
  for (const r of activityRes.data ?? []) {
    const cur = lastActive.get(r.salon_id);
    if (!cur || r.day > cur) lastActive.set(r.salon_id, r.day);
  }
  const reminderBookings = new Map<string, number>();
  for (const r of bookingsRes.data ?? []) reminderBookings.set(r.salon_id, (reminderBookings.get(r.salon_id) ?? 0) + 1);
  const usage = new Map((usageRes.data ?? []).map((r) => [r.salon_id as string, r.push_count as number]));
  const failed = new Set((failedRes.data ?? []).map((r) => r.salon_id as string));

  const statusEvents = (statusRes.data ?? []) as { salon_id: string; props: { from?: string; to?: string }; created_at: string }[];
  const everConverted = new Set(statusEvents.filter((e) => e.props.from === "trialing" && e.props.to === "active").map((e) => e.salon_id));
  const canceledThisMonth = new Set(
    statusEvents.filter((e) => e.props.to === "canceled" && e.created_at >= monthStartIso).map((e) => e.salon_id),
  );

  const salons: SalonMetric[] = salonsRaw.map((s) => {
    const steps = { line: Boolean(s.line_connected_at), webhook: Boolean(s.line_webhook_verified_at), slots: hasSlots.has(s.id) };
    const setupDone = steps.line && steps.webhook && steps.slots;
    const last = lastActive.get(s.id) ?? null;
    const risks: string[] = [];
    if (LIVE.includes(s.subscription_status)) {
      if (!last || last < addDays(today, -7)) risks.push("7日ログインなし");
      if (!setupDone) risks.push("初期設定が未完了");
      if (s.subscription_status === "past_due" || failed.has(s.id)) risks.push("決済失敗");
    }
    return {
      id: s.id,
      name: s.name,
      status: s.subscription_status,
      plan: s.plan,
      createdAt: s.created_at,
      trialEndsAt: s.trial_ends_at,
      setupDone,
      setupSteps: steps,
      lastActiveDay: last,
      reminderBookingsThisMonth: reminderBookings.get(s.id) ?? 0,
      pushThisMonth: usage.get(s.id) ?? 0,
      paymentFailedRecently: failed.has(s.id),
      source: sourceOf(s),
      risks,
    };
  });

  const paid = salons.filter((s) => PAID.includes(s.status));
  const live = salons.filter((s) => LIVE.includes(s.status));
  const mrr = Math.round(paid.reduce((sum, s) => sum + (s.plan === "yearly" ? YEARLY / 12 : MONTHLY), 0));

  // 体験が終わった店（trial_ends_at が過去）のうち、有料に切り替わった店
  const nowIso = new Date().toISOString();
  const ended = salons.filter((s) => s.trialEndsAt && s.trialEndsAt < nowIso);
  const converted = ended.filter((s) => everConverted.has(s.id) || PAID.includes(s.status)).length;

  const sourceMap = new Map<string, { trials: number; paid: number }>();
  for (const s of salons) {
    const g = sourceMap.get(s.source) ?? { trials: 0, paid: 0 };
    g.trials++;
    if (PAID.includes(s.status) || everConverted.has(s.id)) g.paid++;
    sourceMap.set(s.source, g);
  }

  return {
    today,
    mrr,
    paidCount: paid.length,
    trialCount: salons.filter((s) => s.status === "trialing").length,
    conversion: { converted, ended: ended.length },
    churn: { canceled: canceledThisMonth.size, base: paid.length + canceledThisMonth.size },
    setupRate: { done: live.filter((s) => s.setupDone).length, total: live.length },
    active7: { active: live.filter((s) => s.lastActiveDay && s.lastActiveDay >= since7).length, total: live.length },
    sources: [...sourceMap.entries()].map(([source, v]) => ({ source, ...v })).sort((a, b) => b.trials - a.trials),
    salons,
  };
}

export const pct = (n: number, d: number) => (d === 0 ? "—" : `${Math.round((n / d) * 100)}%`);
