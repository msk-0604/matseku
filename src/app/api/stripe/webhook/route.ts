import { NextResponse, type NextRequest } from "next/server";
import type Stripe from "stripe";
import { randomBytes } from "node:crypto";
import { sendSetupEmail } from "@/lib/onboarding";
import { DEFAULT_SALON_NAME } from "@/lib/setup";
import { COUPON_REFERRER, stripe } from "@/lib/stripe";
import { createAdminClient } from "@/lib/supabase/admin";
import { getBaseUrl } from "@/lib/url";

/*
 * Stripe の Webhook
 * - checkout.session.completed      … サロンのアカウントを作り、案内メールを送る
 * - customer.subscription.*         … subscription_status / trial_ends_at を更新、紹介特典
 * - invoice.payment_failed          … 支払い失敗を記録（状態は subscription.updated で更新される）
 */

type Admin = ReturnType<typeof createAdminClient>;

export async function POST(request: NextRequest) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) return new NextResponse("STRIPE_WEBHOOK_SECRET is not set", { status: 500 });

  const body = await request.text();
  let event: Stripe.Event;
  try {
    event = stripe().webhooks.constructEvent(body, request.headers.get("stripe-signature") ?? "", secret);
  } catch {
    return new NextResponse("invalid signature", { status: 400 });
  }

  const admin = createAdminClient();

  // 同じイベントは1回だけ処理する
  const { error: dupErr } = await admin.from("stripe_events").insert({ id: event.id, type: event.type });
  if (dupErr) {
    if (dupErr.code === "23505") return NextResponse.json({ duplicate: true });
    return new NextResponse(dupErr.message, { status: 500 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed":
        await onCheckoutCompleted(admin, event.data.object);
        break;
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted":
        await onSubscriptionChanged(admin, event.data.object, event.data.previous_attributes as Partial<Stripe.Subscription> | undefined);
        break;
      case "invoice.payment_failed":
        await onPaymentFailed(admin, event.data.object);
        break;
    }
  } catch (e) {
    // 失敗したら記録を消して、Stripe の再送で再処理できるようにする
    await admin.from("stripe_events").delete().eq("id", event.id);
    console.error(e);
    return new NextResponse("handler error", { status: 500 });
  }

  return NextResponse.json({ received: true });
}

const customerId = (c: string | Stripe.Customer | Stripe.DeletedCustomer | null) => (typeof c === "string" ? c : (c?.id ?? null));

async function onCheckoutCompleted(admin: Admin, session: Stripe.Checkout.Session) {
  if (session.mode !== "subscription") return;
  const email = session.customer_details?.email;
  const stripeCustomerId = customerId(session.customer);
  const subscriptionId = typeof session.subscription === "string" ? session.subscription : session.subscription?.id;
  if (!email || !stripeCustomerId || !subscriptionId) throw new Error("checkout session に必要な情報がありません");

  const salonName =
    session.custom_fields?.find((f) => f.key === "salon_name")?.text?.value?.trim().slice(0, 100) || DEFAULT_SALON_NAME;
  const meta = session.metadata ?? {};
  const sub = await stripe().subscriptions.retrieve(subscriptionId);

  // ユーザー作成（または既存ユーザー）＋案内メール
  const base = await getBaseUrl();
  const { userId } = await sendSetupEmail(email, base, salonName);

  const values = {
    name: salonName,
    stripe_customer_id: stripeCustomerId,
    stripe_subscription_id: subscriptionId,
    subscription_status: sub.status,
    trial_ends_at: sub.trial_end ? new Date(sub.trial_end * 1000).toISOString() : null,
    plan: meta.plan === "yearly" ? "yearly" : "monthly",
  };

  const { data: existing } = await admin.from("salons").select("id").eq("owner_user_id", userId).maybeSingle();
  let salonId: string;
  if (existing) {
    // 解約後の再申し込みなど：既存のサロンを再び有効にする
    await admin.from("salons").update(values).eq("id", existing.id);
    salonId = existing.id;
  } else {
    const { data: created, error } = await admin
      .from("salons")
      .insert({
        ...values,
        owner_user_id: userId,
        referral_code: randomBytes(4).toString("hex").toUpperCase(),
        referred_by_salon_id: meta.referrer_salon_id || null,
        beta_invite_code: meta.invite || null,
        acquisition: {
          ref: meta.ref || null,
          utm_source: meta.utm_source || null,
          utm_medium: meta.utm_medium || null,
          utm_campaign: meta.utm_campaign || null,
        },
      })
      .select("id")
      .single();
    if (error) throw error;
    salonId = created.id;
  }

  if (meta.invite && !existing) await admin.rpc("use_beta_invite", { p_code: meta.invite });

  await admin.from("events").insert({
    salon_id: salonId,
    type: "signup",
    props: { plan: values.plan, ref: meta.ref || null, invite: meta.invite || null, utm_source: meta.utm_source || null, utm_campaign: meta.utm_campaign || null },
  });
}

async function onSubscriptionChanged(admin: Admin, sub: Stripe.Subscription, prev?: Partial<Stripe.Subscription>) {
  const cid = customerId(sub.customer);
  const { data: salon } = await admin
    .from("salons")
    .select("id, stripe_subscription_id, referred_by_salon_id, referral_rewarded_at")
    .eq("stripe_customer_id", cid)
    .maybeSingle();
  if (!salon) return; // checkout.session.completed より先に届いた場合は、そちらで状態を保存する

  // 古いサブスクリプションのイベントで上書きしない
  if (salon.stripe_subscription_id && salon.stripe_subscription_id !== sub.id) return;

  await admin
    .from("salons")
    .update({
      stripe_subscription_id: sub.id,
      subscription_status: sub.status,
      trial_ends_at: sub.trial_end ? new Date(sub.trial_end * 1000).toISOString() : null,
    })
    .eq("id", salon.id);

  if (prev?.status && prev.status !== sub.status) {
    await admin.from("events").insert({ salon_id: salon.id, type: "subscription_status_changed", props: { from: prev.status, to: sub.status } });
  }

  // 紹介特典：紹介された店が無料体験から有料に切り替わったら、紹介した店に1か月分の割引
  if (prev?.status === "trialing" && sub.status === "active" && salon.referred_by_salon_id && !salon.referral_rewarded_at) {
    const { data: referrer } = await admin
      .from("salons")
      .select("id, stripe_subscription_id, subscription_status")
      .eq("id", salon.referred_by_salon_id)
      .maybeSingle();
    let rewarded = false;
    if (referrer?.stripe_subscription_id && ["active", "trialing", "past_due"].includes(referrer.subscription_status)) {
      await stripe().subscriptions.update(referrer.stripe_subscription_id, { discounts: [{ coupon: COUPON_REFERRER }] });
      rewarded = true;
    }
    await admin.from("salons").update({ referral_rewarded_at: new Date().toISOString() }).eq("id", salon.id);
    await admin.from("events").insert({
      salon_id: referrer?.id ?? null,
      type: rewarded ? "referral_rewarded" : "referral_reward_skipped",
      props: { referred_salon_id: salon.id },
    });
  }
}

async function onPaymentFailed(admin: Admin, invoice: Stripe.Invoice) {
  const { data: salon } = await admin.from("salons").select("id").eq("stripe_customer_id", customerId(invoice.customer)).maybeSingle();
  if (salon) await admin.from("events").insert({ salon_id: salon.id, type: "payment_failed", props: { attempt: invoice.attempt_count } });
}
