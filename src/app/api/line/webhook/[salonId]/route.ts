import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { bookingUrl } from "@/lib/booking-link";
import { decrypt } from "@/lib/crypto";
import { addFriendUrl, isFriend, replyMessage, verifyLineSignature } from "@/lib/line";
import { parseLinkCode } from "@/lib/link-token";
import { isActiveStatus } from "@/lib/stripe";
import { createAdminClient } from "@/lib/supabase/admin";
import { getBaseUrl } from "@/lib/url";

/*
 * LINE の Webhook（サロンごとのURL）
 * - follow / unfollow           … line_blocked を更新
 * - 「連携コード ABC234」         … お客さまと LINE を紐づける（QR からの送信）
 * - 「予約」                      … そのお客さま専用の予約URLを返信
 * - 初期設定の確認コード          … Webhook がオンになっていることを確認
 * 返信はすべて応答メッセージ（月の送信数に数えない）
 */

type LineEvent = {
  type: string;
  replyToken?: string;
  source?: { type: string; userId?: string };
  message?: { type: string; text?: string };
};

type Salon = {
  id: string;
  name: string;
  line_channel_secret: string;
  line_access_token: string;
  line_basic_id: string | null;
  line_test_code: string | null;
  subscription_status: string;
};

type Admin = ReturnType<typeof createAdminClient>;

const text = (t: string) => ({ type: "text", text: t });

function bookButton(salonName: string, url: string, lead: string) {
  return {
    type: "template",
    altText: `${salonName}のご予約はこちら：${url}`,
    template: {
      type: "buttons",
      text: lead.slice(0, 160),
      actions: [{ type: "uri", label: "空き枠を見て予約する", uri: url }],
    },
  };
}

export async function POST(request: NextRequest, { params }: RouteContext<"/api/line/webhook/[salonId]">) {
  const { salonId } = await params;
  if (!z.uuid().safeParse(salonId).success) return new NextResponse("not found", { status: 404 });

  const rawBody = await request.text();
  const admin = createAdminClient();
  const { data: salon } = await admin
    .from("salons")
    .select("id, name, line_channel_secret, line_access_token, line_basic_id, line_test_code, subscription_status")
    .eq("id", salonId)
    .maybeSingle<Salon>();
  if (!salon?.line_channel_secret || !salon.line_access_token) return new NextResponse("not found", { status: 404 });

  let secret: string;
  let token: string;
  try {
    secret = decrypt(salon.line_channel_secret);
    token = decrypt(salon.line_access_token);
  } catch {
    return new NextResponse("server misconfigured", { status: 500 });
  }
  if (!verifyLineSignature(secret, rawBody, request.headers.get("x-line-signature"))) {
    return new NextResponse("invalid signature", { status: 401 });
  }

  let events: LineEvent[] = [];
  try {
    events = (JSON.parse(rawBody) as { events?: LineEvent[] }).events ?? [];
  } catch {
    return new NextResponse("bad request", { status: 400 });
  }

  const base = await getBaseUrl();
  for (const ev of events) {
    const userId = ev.source?.type === "user" ? ev.source.userId : undefined;
    if (!userId) continue;
    try {
      if (ev.type === "follow" || ev.type === "unfollow") {
        await onFollowChange(admin, salon, userId, ev.type === "unfollow");
      } else if (ev.type === "message" && ev.message?.type === "text" && ev.replyToken) {
        await onText(admin, salon, token, base, userId, ev.replyToken, ev.message.text ?? "");
      }
    } catch (e) {
      console.error("[line webhook]", e);
      await admin.from("events").insert({ salon_id: salon.id, type: "line_webhook_error", props: { event: ev.type, message: String(e).slice(0, 300) } });
    }
  }

  return NextResponse.json({ ok: true });
}

async function onFollowChange(admin: Admin, salon: Salon, userId: string, blocked: boolean) {
  const { data: updated } = await admin
    .from("customers")
    .update({ line_blocked: blocked })
    .eq("salon_id", salon.id)
    .eq("line_user_id", userId)
    .select("id");
  await admin.from("events").insert({
    salon_id: salon.id,
    type: blocked ? "line_unfollow" : "line_follow",
    props: { matched: (updated?.length ?? 0) > 0 },
  });
}

async function onText(admin: Admin, salon: Salon, token: string, base: string, userId: string, replyToken: string, raw: string) {
  const msg = raw.normalize("NFKC").trim();

  // 初期設定の確認コード（サロンの人が自分のLINEから送る）
  if (salon.line_test_code && msg.toUpperCase().includes(salon.line_test_code)) {
    await admin.from("salons").update({ line_webhook_verified_at: new Date().toISOString() }).eq("id", salon.id);
    await admin.from("events").insert({ salon_id: salon.id, type: "line_webhook_verified", props: {} });
    await replyMessage(token, replyToken, [
      text("✅ リペアコールとの接続を確認できました。\n\nこのメッセージのあとに、別の自動返信が届いた場合は「応答メッセージ」がオンのままです。LINE Official Account Manager の応答設定でオフにしてください。"),
    ]);
    return;
  }

  if (!isActiveStatus(salon.subscription_status)) return;

  // 連携コード
  const code = parseLinkCode(msg);
  if (code) {
    await linkByCode(admin, salon, token, base, userId, replyToken, code);
    return;
  }

  // 「予約」と送られたら専用URLを返信
  if (msg.length <= 12 && /予約|よやく|ヨヤク/.test(msg)) {
    const { data: customer } = await admin
      .from("customers")
      .select("id, name")
      .eq("salon_id", salon.id)
      .eq("line_user_id", userId)
      .maybeSingle();
    if (!customer) {
      await replyMessage(token, replyToken, [
        text(`LINEからのご予約には、${salon.name}でのLINE連携が必要です。次回ご来店の際に、サロンで表示されるQRコードを読み取ってください。`),
      ]);
      return;
    }
    const url = bookingUrl(base, { salonId: salon.id, customerId: customer.id });
    await replyMessage(token, replyToken, [bookButton(salon.name, url, `${customer.name}さま、ご希望の日時をお選びください。`)]);
  }
  // それ以外のメッセージには返信しない（サロンがチャットで対応できるように）
}

async function linkByCode(admin: Admin, salon: Salon, token: string, base: string, userId: string, replyToken: string, code: string) {
  const { data: link } = await admin
    .from("link_tokens")
    .select("id, customer_id, expires_at, used_at")
    .eq("salon_id", salon.id)
    .eq("token", code)
    .maybeSingle();

  const retry = "お手数ですが、サロンで新しいQRコードを表示してもらってください。";
  if (!link) return void (await replyMessage(token, replyToken, [text(`連携コードが見つかりませんでした。${retry}`)]));
  if (link.used_at) return void (await replyMessage(token, replyToken, [text(`この連携コードはすでに使われています。${retry}`)]));
  if (new Date(link.expires_at).getTime() < Date.now()) {
    return void (await replyMessage(token, replyToken, [text(`連携コードの有効期限が切れています。${retry}`)]));
  }

  // 1回だけ使えるように、先に使用済みにする
  const { data: claimed } = await admin
    .from("link_tokens")
    .update({ used_at: new Date().toISOString() })
    .eq("id", link.id)
    .is("used_at", null)
    .select("id");
  if (!claimed?.length) return;

  // 同じLINEが別のお客さま（重複登録など）に連携されていたら外す
  await admin.from("customers").update({ line_user_id: null }).eq("salon_id", salon.id).eq("line_user_id", userId).neq("id", link.customer_id);
  const { data: customer, error } = await admin
    .from("customers")
    .update({ line_user_id: userId, line_blocked: false })
    .eq("salon_id", salon.id)
    .eq("id", link.customer_id)
    .select("id, name")
    .single();
  if (error || !customer) {
    await replyMessage(token, replyToken, [text("登録できませんでした。時間をおいてもう一度お試しください。")]);
    return;
  }
  await admin.from("events").insert({ salon_id: salon.id, type: "line_linked", props: {} });

  const messages: unknown[] = [
    text(`${customer.name}さま、${salon.name}とのLINE連携が完了しました。\nリペアの時期が近づいたら、こちらのLINEでお知らせします。\n\nご予約したいときは「予約」と送ってください。`),
  ];
  if (salon.line_basic_id && !(await isFriend(token, userId))) {
    messages.push(text(`お知らせを受け取るには、友だち追加をお願いします。\n${addFriendUrl(salon.line_basic_id)}`));
  }
  await replyMessage(token, replyToken, messages);
}
