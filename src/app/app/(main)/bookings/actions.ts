"use server";

import { revalidatePath } from "next/cache";
import { requireSalon } from "@/lib/auth";

export async function cancelBooking(bookingId: string) {
  const { supabase, salon } = await requireSalon();
  const { error } = await supabase.rpc("cancel_booking", { p_booking_id: bookingId });
  if (error) throw new Error(`取り消せませんでした（${error.message}）`);
  await supabase.from("events").insert({ salon_id: salon.id, type: "booking_canceled", props: {} });
  revalidatePath("/app/bookings");
  revalidatePath("/app/slots");
}
