/**
 * Stripe の初期設定（何回実行しても大丈夫）
 *   npm run stripe:setup                         … 商品・価格・クーポン・Customer Portal を作る
 *   npm run stripe:setup -- https://xxx.vercel.app … ＋ Webhook の送り先を登録して署名シークレットを表示
 *
 * .env.local の STRIPE_SECRET_KEY（テスト中は sk_test_...）を使います。
 */
import { config } from "dotenv";
import Stripe from "stripe";

config({ path: ".env.local" });

const key = process.env.STRIPE_SECRET_KEY;
if (!key) {
  console.error("STRIPE_SECRET_KEY を .env.local に設定してください");
  process.exit(1);
}
const stripe = new Stripe(key);
const appUrl = process.argv[2]?.replace(/\/$/, "");

const PRICES = [
  { lookup_key: "repaircall_monthly", unit_amount: 7480, interval: "month" as const, nickname: "月額プラン" },
  { lookup_key: "repaircall_yearly", unit_amount: 74800, interval: "year" as const, nickname: "年額プラン" },
];
const COUPONS = [
  { id: "repaircall_referral_new", name: "紹介特典（最初の1か月分）", duration: "repeating" as const, duration_in_months: 1 },
  { id: "repaircall_referral_reward", name: "紹介お礼（1か月分）", duration: "once" as const },
];
const WEBHOOK_EVENTS: Stripe.WebhookEndpointCreateParams.EnabledEvent[] = [
  "checkout.session.completed",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "invoice.payment_failed",
];

async function main() {
  console.log(`Stripe：${key!.startsWith("sk_live") ? "本番モード" : "テストモード"}\n`);

  // 価格（lookup_key で探して、なければ作る）
  const existing = await stripe.prices.list({ lookup_keys: PRICES.map((p) => p.lookup_key), limit: 10 });
  let productId = existing.data[0] ? (typeof existing.data[0].product === "string" ? existing.data[0].product : existing.data[0].product.id) : null;
  if (!productId) {
    const product = await stripe.products.create({ name: "リペアコール", description: "マツエクサロン向け 再来店自動化サービス" });
    productId = product.id;
    console.log(`商品を作成：${product.id}`);
  }
  for (const p of PRICES) {
    if (existing.data.some((e) => e.lookup_key === p.lookup_key)) {
      console.log(`価格あり：${p.nickname}`);
      continue;
    }
    await stripe.prices.create({
      product: productId,
      currency: "jpy",
      unit_amount: p.unit_amount,
      tax_behavior: "inclusive",
      recurring: { interval: p.interval },
      lookup_key: p.lookup_key,
      nickname: p.nickname,
    });
    console.log(`価格を作成：${p.nickname} ${p.unit_amount}円`);
  }

  // クーポン（1か月分 = 7,480円引き）
  for (const c of COUPONS) {
    try {
      await stripe.coupons.retrieve(c.id);
      console.log(`クーポンあり：${c.name}`);
    } catch {
      await stripe.coupons.create({ ...c, amount_off: 7480, currency: "jpy" });
      console.log(`クーポンを作成：${c.name}`);
    }
  }

  // Customer Portal（カード変更・領収書・解約）
  const portals = await stripe.billingPortal.configurations.list({ is_default: true, limit: 1 });
  if (portals.data.length === 0) {
    await stripe.billingPortal.configurations.create({
      business_profile: { headline: "リペアコール" },
      features: {
        payment_method_update: { enabled: true },
        invoice_history: { enabled: true },
        customer_update: { enabled: true, allowed_updates: ["email", "address", "name"] },
        subscription_cancel: { enabled: true, mode: "at_period_end" },
      },
    });
    console.log("Customer Portal の設定を作成");
  } else {
    console.log("Customer Portal の設定あり");
  }

  // Webhook
  if (appUrl) {
    const url = `${appUrl}/api/stripe/webhook`;
    const hooks = await stripe.webhookEndpoints.list({ limit: 100 });
    const found = hooks.data.find((h) => h.url === url);
    if (found) {
      console.log(`\nWebhook はすでに登録済みです：${url}`);
      console.log("署名シークレットは Stripe ダッシュボード（開発者 → Webhook）で確認できます");
    } else {
      const hook = await stripe.webhookEndpoints.create({ url, enabled_events: WEBHOOK_EVENTS, description: "リペアコール" });
      console.log(`\nWebhook を登録：${url}`);
      console.log("↓ これを .env.local と Vercel の環境変数に設定してください（この1回しか表示されません）");
      console.log(`STRIPE_WEBHOOK_SECRET=${hook.secret}`);
    }
  } else {
    console.log("\n※ Webhook を登録するには、公開URLを付けて実行してください：npm run stripe:setup -- https://xxx.vercel.app");
  }
}

main().catch((e) => {
  console.error("失敗しました:", e.message ?? e);
  process.exit(1);
});
