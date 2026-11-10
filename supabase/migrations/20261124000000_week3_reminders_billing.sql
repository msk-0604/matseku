-- =========================================================
-- 3週目：リペア案内・月次レポート・Stripe
-- 2つ目のSQLの実行後に、SQL Editor で1回だけ実行してください。
-- =========================================================

-- ---------------------------------------------------------
-- salons に請求・紹介・案内文の列を追加
-- ---------------------------------------------------------
alter table public.salons
  add column if not exists stripe_subscription_id text unique,
  add column if not exists plan                   text check (plan in ('monthly', 'yearly')),
  add column if not exists referred_by_salon_id   uuid references public.salons (id) on delete set null,
  add column if not exists referral_rewarded_at   timestamptz,
  add column if not exists acquisition            jsonb not null default '{}'::jsonb,  -- 申込経路（紹介コード・UTM）
  add column if not exists reminder_template      text check (char_length(reminder_template) <= 300);

grant select (plan, reminder_template, stripe_subscription_id) on public.salons to authenticated;
grant update (reminder_template) on public.salons to authenticated;

-- 処理済みの Stripe Webhook（同じイベントを二重に処理しない）
create table if not exists public.stripe_events (
  id          text primary key,
  type        text not null,
  received_at timestamptz not null default now()
);
alter table public.stripe_events enable row level security;
revoke all on public.stripe_events from anon, authenticated;

-- ---------------------------------------------------------
-- 読み取り専用モード：支払いが無効なサロンは書き込めない
-- trialing / active / past_due（支払いの再試行中）は書き込み可
-- ---------------------------------------------------------
create or replace function public.salon_writable()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.salons
    where owner_user_id = (select auth.uid())
      and subscription_status in ('trialing', 'active', 'past_due')
  )
$$;
revoke all on function public.salon_writable() from public, anon;
grant execute on function public.salon_writable() to authenticated;

-- 1週目の「全操作」ポリシーを、読み取り（いつでも可）と書き込み（支払い有効時のみ）に分ける
do $$
declare t text;
begin
  foreach t in array array['customers', 'slots', 'visits', 'visit_photos', 'bookings', 'link_tokens']
  loop
    execute format('drop policy if exists %I on public.%I', t || '_own_salon', t);
    execute format(
      'create policy %I on public.%I for select to authenticated
         using (salon_id = (select public.current_salon_id()))',
      t || '_select_own', t);
    execute format(
      'create policy %I on public.%I for insert to authenticated
         with check (salon_id = (select public.current_salon_id()) and (select public.salon_writable()))',
      t || '_insert_writable', t);
    execute format(
      'create policy %I on public.%I for update to authenticated
         using (salon_id = (select public.current_salon_id()) and (select public.salon_writable()))
         with check (salon_id = (select public.current_salon_id()))',
      t || '_update_writable', t);
    execute format(
      'create policy %I on public.%I for delete to authenticated
         using (salon_id = (select public.current_salon_id()) and (select public.salon_writable()))',
      t || '_delete_writable', t);
  end loop;
end $$;

drop policy if exists "salons_update_own" on public.salons;
create policy "salons_update_own" on public.salons
  for update to authenticated
  using (owner_user_id = (select auth.uid()) and (select public.salon_writable()))
  with check (owner_user_id = (select auth.uid()));

drop policy if exists "visit_photos_storage_insert" on storage.objects;
drop policy if exists "visit_photos_storage_update" on storage.objects;
drop policy if exists "visit_photos_storage_delete" on storage.objects;
create policy "visit_photos_storage_insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'visit-photos' and (storage.foldername(name))[1] = (select public.current_salon_id())::text and (select public.salon_writable()));
create policy "visit_photos_storage_update" on storage.objects
  for update to authenticated
  using (bucket_id = 'visit-photos' and (storage.foldername(name))[1] = (select public.current_salon_id())::text and (select public.salon_writable()));
create policy "visit_photos_storage_delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'visit-photos' and (storage.foldername(name))[1] = (select public.current_salon_id())::text and (select public.salon_writable()));

-- ---------------------------------------------------------
-- リペア案内の対象者（毎朝の Cron が service role で呼ぶ）
-- 1. 最新の来店日 + リペア日数 <= 今日（日本時間）
-- 2. 今日以降の予約がない
-- 3. その最新来店に対する案内をまだ送っていない
-- 4. LINE連携済み・ブロックされていない・案内オフでない
-- ＋ サロンの支払いが有効で、LINE接続とLIFFの設定が済んでいる
-- ---------------------------------------------------------
create or replace function public.due_reminders(p_today date)
returns table (
  salon_id       uuid,
  customer_id    uuid,
  customer_name  text,
  line_user_id   text,
  cycle_visit_id uuid,
  visited_at     date
)
language sql
stable
security invoker
set search_path = ''
as $$
  with latest as (
    select distinct on (v.customer_id) v.customer_id, v.id as visit_id, v.visited_at
    from public.visits v
    order by v.customer_id, v.visited_at desc, v.created_at desc
  )
  select c.salon_id, c.id, c.name, c.line_user_id, l.visit_id, l.visited_at
  from latest l
  join public.customers c on c.id = l.customer_id
  join public.salons s on s.id = c.salon_id
  where s.subscription_status in ('trialing', 'active', 'past_due')
    and s.line_access_token is not null
    and s.liff_id is not null
    and c.line_user_id is not null
    and not c.line_blocked
    and not c.notify_opt_out
    and l.visited_at + coalesce(c.repair_days, s.default_repair_days) <= p_today
    and not exists (
      select 1
      from public.bookings b
      join public.slots sl on sl.id = b.slot_id
      where b.customer_id = c.id
        and b.status = 'confirmed'
        and sl.starts_at >= (p_today::timestamp at time zone 'Asia/Tokyo')
    )
    and not exists (
      select 1 from public.reminders r
      where r.customer_id = c.id and r.cycle_visit_id = l.visit_id
    )
  order by c.salon_id, l.visited_at
$$;
revoke all on function public.due_reminders(date) from public, anon, authenticated;
grant execute on function public.due_reminders(date) to service_role;

-- LINE送信数を1増やして、増やした後の値を返す
create or replace function public.increment_line_usage(p_salon_id uuid, p_month text)
returns integer
language sql
security invoker
set search_path = ''
as $$
  insert into public.line_usage (salon_id, month, push_count)
  values (p_salon_id, p_month, 1)
  on conflict (salon_id, month) do update set push_count = public.line_usage.push_count + 1
  returning push_count
$$;
revoke all on function public.increment_line_usage(uuid, text) from public, anon, authenticated;
grant execute on function public.increment_line_usage(uuid, text) to service_role;
