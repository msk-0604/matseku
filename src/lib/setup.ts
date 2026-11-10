import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Salon } from "@/lib/types";

export const DEFAULT_SALON_NAME = "マイサロン";

/** トークンとシークレットが保存され、公式アカウントの情報を取得できている */
export function lineConnected(salon: Pick<Salon, "line_connected_at" | "line_basic_id">): boolean {
  return Boolean(salon.line_connected_at && salon.line_basic_id);
}

export type SetupStatus = {
  name: boolean;
  line: boolean;
  lineResponse: boolean;
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
    line: lineConnected(salon),
    lineResponse: Boolean(salon.line_webhook_verified_at),
    repairDays: (repairEvents ?? 0) > 0,
    slots: (slotCount ?? 0) > 0,
  };
  const done = Object.values(s).filter(Boolean).length;
  return { ...s, done, total: 5, complete: done === 5 };
}
