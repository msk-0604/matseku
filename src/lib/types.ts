export type Salon = {
  id: string;
  name: string;
  default_repair_days: number;
  subscription_status: string;
  line_channel_id: string | null;
  liff_id: string | null;
};

/** salons テーブルからブラウザ側で読める列（秘密情報の列は権限上読めない） */
export const SALON_COLUMNS =
  "id, name, default_repair_days, subscription_status, line_channel_id, liff_id";

export type Customer = {
  id: string;
  salon_id: string;
  name: string;
  name_kana: string;
  phone: string | null;
  birthday: string | null;
  memo: string | null;
  allergy_note: string | null;
  patch_test_on: string | null;
  sensitive_consent: boolean;
  line_user_id: string | null;
  line_blocked: boolean;
  repair_days: number | null;
  notify_opt_out: boolean;
  created_at: string;
};

export type CustomerOverview = Customer & {
  last_visited_at: string | null;
  visit_count: number;
};

export type Visit = {
  id: string;
  salon_id: string;
  customer_id: string;
  visited_at: string;
  menu: string | null;
  price: number | null;
  lash_design: LashDesign;
  note: string | null;
  booking_id: string | null;
  created_at: string;
};

export type VisitPhoto = {
  id: string;
  visit_id: string;
  storage_path: string;
};

export type ZoneLengths = {
  inner: number | null;
  center: number | null;
  outer: number | null;
};

/** マツエク設計（visits.lash_design に jsonb で保存） */
export type LashDesign = {
  technique?: string | null;
  length?: { left: ZoneLengths; right: ZoneLengths };
  curl?: string[];
  thickness?: number | null;
  count?: number | null;
  color?: string | null;
  glue?: string | null;
  next_note?: string | null;
};
