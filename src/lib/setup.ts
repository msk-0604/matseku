import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Salon } from "@/lib/types";

export const DEFAULT_SALON_NAME = "マイサロン";

export type SetupStatus = {
  name: boolean;
  line: boolean;
  repairDays: boolean;
  slots: boolean;
  done: number;
  total: number;
  complete: boolean;
};

/** 初期設定ウィザードの進み具合 */
export async function getSetupStatus(supabase: SupabaseClient, salon: Salon): Promise<SetupStatus> {
  const [{ count: slotCount }, { count: repairEvents }] = await Promise.all([
    supabase.from("slots").select("id", { count: "exact", head: true }),
    supabase.from("events").select("id", { count: "exact", head: true }).eq("type", "setup_repair_days"),
  ]);
  const s = {
    name: salon.name.trim() !== "" && salon.name !== DEFAULT_SALON_NAME,
    line: Boolean(salon.line_connected_at && salon.liff_id),
    repairDays: (repairEvents ?? 0) > 0,
    slots: (slotCount ?? 0) > 0,
  };
  const done = Object.values(s).filter(Boolean).length;
  return { ...s, done, total: 4, complete: done === 4 };
}
