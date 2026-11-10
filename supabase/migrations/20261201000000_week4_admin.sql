-- =========================================================
-- 4週目：運営者の管理画面・ベータ招待・利用状況・写真の掃除
-- 3つ目のSQLの実行後に、SQL Editor で1回だけ実行してください。
-- =========================================================

-- サロンが画面を使った日（1日1行）。「直近7日に使った店舗」「7日ログインなし」の判定に使う
create table if not exists public.salon_activity (
  salon_id uuid not null references public.salons (id) on delete cascade,
  day      date not null,
  primary key (salon_id, day)
);
alter table public.salon_activity enable row level security;
revoke all on public.salon_activity from anon, authenticated;
grant select, insert on public.salon_activity to authenticated;
create policy "salon_activity_select_own" on public.salon_activity
  for select to authenticated using (salon_id = (select public.current_salon_id()));
create policy "salon_activity_insert_own" on public.salon_activity
  for insert to authenticated with check (salon_id = (select public.current_salon_id()));

-- ベータ用の招待コード（運営者が管理画面で作る）
create table if not exists public.beta_invites (
  code        text primary key check (code ~ '^[A-Z0-9]{6,20}$'),
  trial_days  integer not null default 30 check (trial_days between 1 and 730),
  max_uses    integer not null default 1 check (max_uses between 1 and 1000),
  used_count  integer not null default 0,
  note        text,
  expires_at  timestamptz,
  created_at  timestamptz not null default now()
);
alter table public.beta_invites enable row level security;
revoke all on public.beta_invites from anon, authenticated;

alter table public.salons add column if not exists beta_invite_code text references public.beta_invites (code) on delete set null;

-- 招待コードの使用回数を1増やす（上限を超えない）
create or replace function public.use_beta_invite(p_code text)
returns boolean
language sql
security invoker
set search_path = ''
as $$
  with u as (
    update public.beta_invites
       set used_count = used_count + 1
     where code = p_code and used_count < max_uses
    returning 1
  )
  select exists (select 1 from u)
$$;
revoke all on function public.use_beta_invite(text) from public, anon, authenticated;
grant execute on function public.use_beta_invite(text) to service_role;

-- 来店記録として保存されなかった写真ファイル（1日以上前）を探す
create or replace function public.orphan_visit_photos(p_limit integer default 500)
returns table (name text)
language sql
stable
security definer
set search_path = ''
as $$
  select o.name
  from storage.objects o
  where o.bucket_id = 'visit-photos'
    and o.created_at < now() - interval '1 day'
    and not exists (select 1 from public.visit_photos p where p.storage_path = o.name)
  limit p_limit
$$;
revoke all on function public.orphan_visit_photos(integer) from public, anon, authenticated;
grant execute on function public.orphan_visit_photos(integer) to service_role;

create index if not exists events_created_idx on public.events (created_at desc);
