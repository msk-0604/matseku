-- =========================================================
-- リペアコール 初期スキーマ
-- Supabase の SQL Editor に貼り付けて実行してください（1回だけ）。
-- =========================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------
-- salons（サロン）
-- ---------------------------------------------------------
create table public.salons (
  id                  uuid primary key default gen_random_uuid(),
  owner_user_id       uuid not null unique references auth.users (id) on delete cascade,
  name                text not null,
  line_channel_id     text,
  line_channel_secret text,          -- アプリ側で暗号化した値を保存する
  line_access_token   text,          -- アプリ側で暗号化した値を保存する
  default_repair_days integer not null default 21 check (default_repair_days between 7 and 90),
  liff_id             text,
  stripe_customer_id  text unique,
  subscription_status text not null default 'trialing'
    check (subscription_status in ('trialing', 'active', 'past_due', 'canceled', 'unpaid', 'incomplete', 'incomplete_expired', 'paused')),
  trial_ends_at       timestamptz,
  referral_code       text unique,
  created_at          timestamptz not null default now()
);

-- ログイン中ユーザーのサロンID（RLSで使う）
create or replace function public.current_salon_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select id from public.salons where owner_user_id = (select auth.uid()) limit 1
$$;

-- ---------------------------------------------------------
-- admins（運営者）
-- ---------------------------------------------------------
create table public.admins (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.admins where user_id = (select auth.uid()))
$$;

-- ---------------------------------------------------------
-- customers（お客さま）
-- ---------------------------------------------------------
create table public.customers (
  id                uuid primary key default gen_random_uuid(),
  salon_id          uuid not null default public.current_salon_id() references public.salons (id) on delete cascade,
  name              text not null check (char_length(name) between 1 and 100),
  name_kana         text not null check (char_length(name_kana) between 1 and 100),
  phone             text,
  birthday          date,
  memo              text,
  allergy_note      text,
  patch_test_on     date,
  sensitive_consent boolean not null default false,
  line_user_id      text,
  line_blocked      boolean not null default false,
  repair_days       integer check (repair_days between 7 and 90),
  notify_opt_out    boolean not null default false,
  created_at        timestamptz not null default now(),
  unique (id, salon_id),
  unique (salon_id, line_user_id),
  -- 本人同意がない場合、要配慮情報（アレルギー・病歴）は保存できない
  constraint allergy_requires_consent check (allergy_note is null or sensitive_consent)
);
create index customers_salon_kana_idx on public.customers (salon_id, name_kana);

-- ---------------------------------------------------------
-- slots（空き枠）
-- ---------------------------------------------------------
create table public.slots (
  id         uuid primary key default gen_random_uuid(),
  salon_id   uuid not null default public.current_salon_id() references public.salons (id) on delete cascade,
  starts_at  timestamptz not null,
  ends_at    timestamptz not null,
  is_booked  boolean not null default false,
  created_at timestamptz not null default now(),
  unique (id, salon_id),
  check (ends_at > starts_at)
);
create index slots_salon_starts_idx on public.slots (salon_id, starts_at);

-- ---------------------------------------------------------
-- visits（来店記録）
-- ---------------------------------------------------------
create table public.visits (
  id          uuid primary key default gen_random_uuid(),
  salon_id    uuid not null default public.current_salon_id() references public.salons (id) on delete cascade,
  customer_id uuid not null,
  visited_at  date not null,
  menu        text,
  price       integer check (price >= 0),
  lash_design jsonb not null default '{}'::jsonb,
  note        text,
  booking_id  uuid,
  created_at  timestamptz not null default now(),
  unique (id, salon_id),
  foreign key (customer_id, salon_id) references public.customers (id, salon_id) on delete cascade
);
create index visits_customer_visited_idx on public.visits (customer_id, visited_at desc);
create index visits_salon_visited_idx on public.visits (salon_id, visited_at desc);

-- ---------------------------------------------------------
-- visit_photos（施術写真）
-- storage_path は「{salon_id}/{visit_id}/{ファイル名}」
-- ---------------------------------------------------------
create table public.visit_photos (
  id           uuid primary key default gen_random_uuid(),
  salon_id     uuid not null default public.current_salon_id() references public.salons (id) on delete cascade,
  visit_id     uuid not null,
  storage_path text not null unique,
  created_at   timestamptz not null default now(),
  foreign key (visit_id, salon_id) references public.visits (id, salon_id) on delete cascade
);
create index visit_photos_visit_idx on public.visit_photos (visit_id);

-- ---------------------------------------------------------
-- reminders（リペア案内）
-- ---------------------------------------------------------
create table public.reminders (
  id             uuid primary key default gen_random_uuid(),
  salon_id       uuid not null references public.salons (id) on delete cascade,
  customer_id    uuid not null,
  cycle_visit_id uuid references public.visits (id) on delete set null,
  sent_at        timestamptz,
  status         text not null default 'pending' check (status in ('pending', 'sent', 'failed', 'skipped')),
  created_at     timestamptz not null default now(),
  foreign key (customer_id, salon_id) references public.customers (id, salon_id) on delete cascade,
  -- 同じ来店に対する案内は1回だけ
  unique (customer_id, cycle_visit_id)
);
create index reminders_salon_sent_idx on public.reminders (salon_id, sent_at);

-- ---------------------------------------------------------
-- bookings（予約）
-- ---------------------------------------------------------
create table public.bookings (
  id          uuid primary key default gen_random_uuid(),
  salon_id    uuid not null default public.current_salon_id() references public.salons (id) on delete cascade,
  customer_id uuid not null,
  slot_id     uuid not null,
  status      text not null default 'confirmed' check (status in ('confirmed', 'canceled', 'completed', 'no_show')),
  source      text not null default 'direct' check (source in ('reminder', 'direct')),
  reminder_id uuid references public.reminders (id) on delete set null,
  created_at  timestamptz not null default now(),
  foreign key (customer_id, salon_id) references public.customers (id, salon_id) on delete cascade,
  foreign key (slot_id, salon_id) references public.slots (id, salon_id) on delete restrict
);
create index bookings_salon_created_idx on public.bookings (salon_id, created_at);
create index bookings_customer_idx on public.bookings (customer_id);
-- 1つの枠に有効な予約は1件だけ
create unique index bookings_one_active_per_slot on public.bookings (slot_id) where status <> 'canceled';

alter table public.visits
  add constraint visits_booking_fk foreign key (booking_id) references public.bookings (id) on delete set null;

-- ---------------------------------------------------------
-- link_tokens（LINE連携QR、ワンタイム）
-- ---------------------------------------------------------
create table public.link_tokens (
  id          uuid primary key default gen_random_uuid(),
  salon_id    uuid not null default public.current_salon_id() references public.salons (id) on delete cascade,
  customer_id uuid not null,
  token       text not null unique,
  expires_at  timestamptz not null,
  used_at     timestamptz,
  created_at  timestamptz not null default now(),
  foreign key (customer_id, salon_id) references public.customers (id, salon_id) on delete cascade
);

-- ---------------------------------------------------------
-- line_usage（月ごとのLINE送信数）month は 'YYYY-MM'
-- ---------------------------------------------------------
create table public.line_usage (
  salon_id   uuid not null references public.salons (id) on delete cascade,
  month      text not null check (month ~ '^\d{4}-\d{2}$'),
  push_count integer not null default 0,
  primary key (salon_id, month)
);

-- ---------------------------------------------------------
-- events（利用ログ）
-- ---------------------------------------------------------
create table public.events (
  id         bigint generated always as identity primary key,
  salon_id   uuid references public.salons (id) on delete cascade,
  type       text not null,
  props      jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index events_salon_type_created_idx on public.events (salon_id, type, created_at desc);
create index events_type_created_idx on public.events (type, created_at desc);

-- ---------------------------------------------------------
-- customer_overview（一覧用：最終来店日・来店回数つき）
-- security_invoker なので RLS がそのまま効く
-- ---------------------------------------------------------
create view public.customer_overview
with (security_invoker = true) as
select
  c.*,
  v.last_visited_at,
  coalesce(v.visit_count, 0) as visit_count
from public.customers c
left join lateral (
  select max(visited_at) as last_visited_at, count(*)::int as visit_count
  from public.visits
  where customer_id = c.id
) v on true;

-- =========================================================
-- 権限（GRANT）
-- 未ログイン（anon）には何も許可しない。
-- =========================================================
revoke all on all tables in schema public from anon;
revoke all on function public.current_salon_id() from public, anon;
revoke all on function public.is_admin() from public, anon;
grant execute on function public.current_salon_id() to authenticated;
grant execute on function public.is_admin() to authenticated;

-- salons：暗号化トークンや請求情報はブラウザから読めない／書けない
revoke all on public.salons from authenticated;
grant select (id, owner_user_id, name, line_channel_id, default_repair_days, liff_id,
              subscription_status, trial_ends_at, referral_code, created_at)
  on public.salons to authenticated;
grant update (name, default_repair_days) on public.salons to authenticated;

-- customers：LINE連携の項目はサーバー（service role）だけが書く
revoke all on public.customers from authenticated;
grant select, delete on public.customers to authenticated;
grant insert (name, name_kana, phone, birthday, memo, allergy_note, patch_test_on,
              sensitive_consent, repair_days, notify_opt_out)
  on public.customers to authenticated;
grant update (name, name_kana, phone, birthday, memo, allergy_note, patch_test_on,
              sensitive_consent, repair_days, notify_opt_out)
  on public.customers to authenticated;

revoke all on public.admins from authenticated;
revoke all on public.reminders, public.line_usage from authenticated;
grant select on public.reminders, public.line_usage to authenticated;
revoke all on public.events from authenticated;
grant select, insert on public.events to authenticated;
grant select on public.customer_overview to authenticated;

-- =========================================================
-- Row Level Security：サロンは自分の salon_id の行だけ
-- =========================================================
alter table public.salons       enable row level security;
alter table public.admins       enable row level security;
alter table public.customers    enable row level security;
alter table public.slots        enable row level security;
alter table public.visits       enable row level security;
alter table public.visit_photos enable row level security;
alter table public.reminders    enable row level security;
alter table public.bookings     enable row level security;
alter table public.link_tokens  enable row level security;
alter table public.line_usage   enable row level security;
alter table public.events       enable row level security;

-- salons
create policy "salons_select_own" on public.salons
  for select to authenticated using (owner_user_id = (select auth.uid()));
create policy "salons_update_own" on public.salons
  for update to authenticated
  using (owner_user_id = (select auth.uid()))
  with check (owner_user_id = (select auth.uid()));

-- admins：ポリシーなし（service role からのみ参照）

-- 共通：salon_id が自分のサロンの行だけ（全操作）
do $$
declare t text;
begin
  foreach t in array array['customers', 'slots', 'visits', 'visit_photos', 'bookings', 'link_tokens']
  loop
    execute format(
      'create policy %I on public.%I for all to authenticated
         using (salon_id = (select public.current_salon_id()))
         with check (salon_id = (select public.current_salon_id()))',
      t || '_own_salon', t);
  end loop;
end $$;

-- 読み取りだけ（書き込みは Cron / Webhook が service role で行う）
create policy "reminders_select_own" on public.reminders
  for select to authenticated using (salon_id = (select public.current_salon_id()));
create policy "line_usage_select_own" on public.line_usage
  for select to authenticated using (salon_id = (select public.current_salon_id()));

-- events：自分のサロンの分だけ読める・書ける
create policy "events_select_own" on public.events
  for select to authenticated using (salon_id = (select public.current_salon_id()));
create policy "events_insert_own" on public.events
  for insert to authenticated with check (salon_id = (select public.current_salon_id()));

-- =========================================================
-- Storage：施術写真（非公開バケット）
-- パスの先頭フォルダが自分の salon_id のファイルだけ操作できる
-- =========================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('visit-photos', 'visit-photos', false, 10485760, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy "visit_photos_storage_select" on storage.objects
  for select to authenticated
  using (bucket_id = 'visit-photos' and (storage.foldername(name))[1] = (select public.current_salon_id())::text);
create policy "visit_photos_storage_insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'visit-photos' and (storage.foldername(name))[1] = (select public.current_salon_id())::text);
create policy "visit_photos_storage_update" on storage.objects
  for update to authenticated
  using (bucket_id = 'visit-photos' and (storage.foldername(name))[1] = (select public.current_salon_id())::text);
create policy "visit_photos_storage_delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'visit-photos' and (storage.foldername(name))[1] = (select public.current_salon_id())::text);
