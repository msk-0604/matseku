import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { verifySigned } from "@/lib/crypto";
import { createAdminClient } from "@/lib/supabase/admin";

const icsDate = (iso: string) => new Date(iso).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
const esc = (s: string) => s.replace(/[\;,]/g, (c) => `\\${c}`).replace(/\n/g, "\\n");

/** 予約をカレンダーに登録するためのファイル（.ics）。URLの署名で本人のリンクか確認する */
export async function GET(request: NextRequest, { params }: RouteContext<"/api/ics/[bookingId]">) {
  const { bookingId } = await params;
  const sig = request.nextUrl.searchParams.get("s") ?? "";
  if (!z.uuid().safeParse(bookingId).success || !verifySigned(`ics:${bookingId}`, sig)) {
    return new NextResponse("not found", { status: 404 });
  }

  const admin = createAdminClient();
  const { data } = await admin
    .from("bookings")
    .select("id, status, starts_at, ends_at, salons!inner(name)")
    .eq("id", bookingId)
    .maybeSingle();
  if (!data || data.status === "canceled") return new NextResponse("not found", { status: 404 });

  const slot = { starts_at: data.starts_at as string, ends_at: data.ends_at as string };
  const salon = data.salons as unknown as { name: string };
  const body = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//repaircall//JP",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${bookingId}@repaircall`,
    `DTSTAMP:${icsDate(new Date().toISOString())}`,
    `DTSTART:${icsDate(slot.starts_at)}`,
    `DTEND:${icsDate(slot.ends_at)}`,
    `SUMMARY:${esc(`${salon.name} ご予約`)}`,
    "BEGIN:VALARM",
    "TRIGGER:-P1D",
    "ACTION:DISPLAY",
    `DESCRIPTION:${esc(`明日は ${salon.name} のご予約日です`)}`,
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR",
    "",
  ].join("\r\n");

  return new NextResponse(body, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `inline; filename="booking.ics"`,
      "Cache-Control": "private, no-store",
    },
  });
}
