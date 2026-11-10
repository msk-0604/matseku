import "server-only";
import Stripe from "stripe";

let client: Stripe | null = null;

export function stripe(): Stripe {
  if (!client) {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) throw new Error("STRIPE_SECRET_KEY が設定されていません");
    client = new Stripe(key);
  }
  return client;
}

/** scripts/stripe-setup.ts で作る価格・クーポンの識別子 */
export const PRICE_LOOKUP = { monthly: "repaircall_monthly", yearly: "repaircall_yearly" } as const;
export const COUPON_REFERRED = "repaircall_referral_new"; // 紹介された店：最初の1か月分
export const COUPON_REFERRER = "repaircall_referral_reward"; // 紹介した店：次回請求から1か月分
export const TRIAL_DAYS = 14;

export type Plan = keyof typeof PRICE_LOOKUP;

export async function priceIdFor(plan: Plan): Promise<string> {
  const { data } = await stripe().prices.list({ lookup_keys: [PRICE_LOOKUP[plan]], active: true, limit: 1 });
  if (!data[0]) throw new Error(`Stripe に価格（${PRICE_LOOKUP[plan]}）がありません。npm run stripe:setup を実行してください`);
  return data[0].id;
}

/** 書き込みできる（＝自動案内も動く）支払い状態か */
export function isActiveStatus(status: string): boolean {
  return status === "trialing" || status === "active" || status === "past_due";
}
