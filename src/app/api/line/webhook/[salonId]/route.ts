import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { decrypt } from "@/lib/crypto";
import { verifyLineSignature } from "@/lib/line";
import { createAdminClient } from "@/lib/supabase/admin";

type LineEvent = {
  type: string;
  source?: { type: string; userId?: string };
};

/**
 * LINE の Webhook（サロンごとのURL）。
 * follow：ブロック解除／友だち追加 → line_blocked = false
 * unfollow：ブロック → line_blocked = true
 */
export async function POST(request: NextRequest, { params }: RouteContext<"/api/line/webhook/[salonId]">) {
  const { salonId } = await params;
  if (!z.uuid().safeParse(salonId).success) return new NextResponse("not found", { status: 404 });

  const rawBody = await request.text();
  const supabase = createAdminClient();
  const { data: salon } = await supabase
    .from("salons")
    .select("id, line_channel_secret")
    .eq("id", salonId)
    .maybeSingle();
  if (!salon?.line_channel_secret) return new NextResponse("not found", { status: 404 });

  let secret: string;
  try {
    secret = decrypt(salon.line_channel_secret);
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

  for (const ev of events) {
    const userId = ev.source?.type === "user" ? ev.source.userId : undefined;
    if (!userId || (ev.type !== "follow" && ev.type !== "unfollow")) continue;

    const blocked = ev.type === "unfollow";
    const { data: updated } = await supabase
      .from("customers")
      .update({ line_blocked: blocked })
      .eq("salon_id", salonId)
      .eq("line_user_id", userId)
      .select("id");
    await supabase.from("events").insert({
      salon_id: salonId,
      type: blocked ? "line_unfollow" : "line_follow",
      props: { matched: (updated?.length ?? 0) > 0 },
    });
  }

  return NextResponse.json({ ok: true });
}
