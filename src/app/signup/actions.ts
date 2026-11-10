"use server";

import { redirect } from "next/navigation";
import { COUPON_REFERRED, TRIAL_DAYS, priceIdFor, stripe, type Plan } from "@/lib/stripe";
import { createAdminClient } from "@/lib/supabase/admin";
import { getBaseUrl } from "@/lib/url";

export type CheckoutState = { error?: string };

const clean = (v: FormDataEntryValue | null, max = 100) =>
  String(v ?? "").trim().replace(/[^\w\-.@ぁ-んァ-ヶ一-龠]/g, "").slice(0, max);

/** 「無料で試す」→ Stripe Checkout へ */
export async function startCheckout(_prev: CheckoutState, fd: FormData): Promise<CheckoutState> {
  const plan: Plan = fd.get("plan") === "yearly" ? "yearly" : "monthly";
  const ref = clean(fd.get("ref"), 20).toUpperCase();
  const utm = {
    utm_source: clean(fd.get("utm_source")),
    utm_medium: clean(fd.get("utm_medium")),
    utm_campaign: clean(fd.get("utm_campaign")),
  };

  // ベータ招待：無料期間を延長
  const invite = clean(fd.get("invite"), 20).toUpperCase();
  let trialDays = TRIAL_DAYS;
  if (invite) {
    const { data } = await createAdminClient()
      .from("beta_invites")
      .select("code, trial_days, max_uses, used_count, expires_at")
      .eq("code", invite)
      .maybeSingle();
    if (!data || data.used_count >= data.max_uses || (data.expires_at && new Date(data.expires_at) < new Date())) {
      return { error: "招待コードが無効か、使用回数の上限に達しています" };
    }
    trialDays = data.trial_days;
  }

  let referrerSalonId = "";
  if (ref) {
    const { data } = await createAdminClient()
      .from("salons")
      .select("id")
      .eq("referral_code", ref)
      .in("subscription_status", ["trialing", "active", "past_due"])
      .maybeSingle();
    if (!data) return { error: "紹介コードが見つかりません。もう一度ご確認ください（空欄でもお申し込みできます）" };
    referrerSalonId = data.id;
  }

  const base = await getBaseUrl();
  let url: string | null;
  try {
    const session = await stripe().checkout.sessions.create({
      mode: "subscription",
      locale: "ja",
      line_items: [{ price: await priceIdFor(plan), quantity: 1 }],
      payment_method_collection: "always",
      subscription_data: { trial_period_days: trialDays, metadata: { plan } },
      custom_fields: [
        { key: "salon_name", label: { type: "custom", custom: "サロン名" }, type: "text", text: { maximum_length: 100 } },
      ],
      discounts: referrerSalonId ? [{ coupon: COUPON_REFERRED }] : undefined,
      metadata: { plan, ref, invite, referrer_salon_id: referrerSalonId, ...utm },
      success_url: `${base}/signup/success`,
      cancel_url: `${base}/#pricing`,
    });
    url = session.url;
  } catch (e) {
    console.error(e);
    return { error: "お申し込みページを開けませんでした。時間をおいてもう一度お試しください" };
  }
  if (!url) return { error: "お申し込みページを開けませんでした" };
  redirect(url);
}
