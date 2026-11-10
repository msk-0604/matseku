-- =========================================================
-- LIFFなしのLINE連携 ＋ サロン側からの予約登録
-- 4つ目のSQLの実行後に、SQL Editor で1回だけ実行してください。
-- =========================================================

-- ---------------------------------------------------------
-- salons：LINEの応答設定の確認用
-- ---------------------------------------------------------
alter table public.salons
  add column if not exists line_test_code           text,         -- 初期設定で送ってもらう確認コード
  add column if not exists line_webhook_verified_at timestamptz;  -- 確認コードを Webhook で受け取れた日時

grant select (line_test_code, line_webhook_verified_at) on public.salons to authenticated;

-- すでにLINE接続済みのサロンにも確認コードを用意する
update public.salons
   set line_test_code = 'RC' || upper(substr(md5(gen_random_uuid()::text), 1, 6))
 where line_test_code is null and line_access_token is not null;

-- ---------------------------------------------------------
-- bookings：日時を予約自体に持たせ、空き枠は任意にする
-- ---------------------------------------------------------
alter table public.bookings
  add column if not exists starts_at timestamptz,
  add column if not exists ends_at   timestamptz,
  add column if not exists channel   text not null default 'line',
  add column if not exists note      text;

update public.bookings b
   set starts_at = s.starts_at, ends_at = s.ends_at
  from public.slots s
 where s.id = b.slot_id and b.starts_at is null;

alter table public.bookings
  alter column starts_at set not null,
  alter column ends_at set not null,
  alter column slot_id drop not null;

alter table public.bookings drop constraint if exists bookings_channel_check;
alter table public.bookings add constraint bookings_channel_check check (channel in ('line', 'phone', 'hotpepper', 'other'));
alter table public.bookings drop constraint if exists bookings_time_check;
alter table public.bookings add constraint bookings_time_check check (ends_at > starts_at);
alter table public.bookings drop constraint if exists bookings_note_check;
alter table public.bookings add constraint bookings_note_check check (char_length(note) <= 500);

create index if not exists bookings_salon_starts_idx on public.bookings (salon_id, starts_at);
create index if not exists bookings_customer_starts_idx on public.bookings (customer_id, starts_at);

-- ---------------------------------------------------------
-- 案内からの予約かどうか（送信後14日以内の案内があればその id）
-- ---------------------------------------------------------
create or replace function public.recent_reminder_for(p_customer_id uuid)
returns uuid
language sql
stable
security invoker
set search_path = ''
as $$
  select r.id from public.reminders r
  where r.customer_id = p_customer_id
    and r.status = 'sent'
    and r.sent_at >= now() - interval '14 days'
  order by r.sent_at desc
  limit 1
$$;
grant execute on function public.recent_reminder_for(uuid) to authenticated, service_role;

-- 予約の時間と重なる空き枠を「予約済み」にする
create or replace function public.occupy_slots(p_salon_id uuid, p_starts_at timestamptz, p_ends_at timestamptz)
returns uuid  -- 最初に埋めた枠（なければ null）
language sql
security invoker
set search_path = ''
as $$
  with u as (
    update public.slots
       set is_booked = true
     where salon_id = p_salon_id
       and not is_booked
       and starts_at < p_ends_at
       and ends_at > p_starts_at
    returning id, starts_at
  )
  select id from u order by starts_at limit 1
$$;
grant execute on function public.occupy_slots(uuid, timestamptz, timestamptz) to authenticated, service_role;

-- ---------------------------------------------------------
-- サロンが予約を登録する（電話・ホットペッパーなど）
-- RLS が効くので、自分のサロン・支払い有効時だけ成功する
-- ---------------------------------------------------------
create or replace function public.salon_create_booking(
  p_customer_id uuid,
  p_starts_at   timestamptz,
  p_ends_at     timestamptz,
  p_channel     text,
  p_note        text
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_salon    uuid := public.current_salon_id();
  v_reminder uuid := public.recent_reminder_for(p_customer_id);
  v_slot     uuid;
  v_booking  uuid;
begin
  if v_salon is null then
    raise exception 'no salon';
  end if;
  v_slot := public.occupy_slots(v_salon, p_starts_at, p_ends_at);

  insert into public.bookings (salon_id, customer_id, slot_id, starts_at, ends_at, status, source, reminder_id, channel, note)
  values (v_salon, p_customer_id, v_slot, p_starts_at, p_ends_at, 'confirmed',
          case when v_reminder is null then 'direct' else 'reminder' end, v_reminder, p_channel, p_note)
  returning id into v_booking;
  return v_booking;
end;
$$;
revoke all on function public.salon_create_booking(uuid, timestamptz, timestamptz, text, text) from public, anon;
grant execute on function public.salon_create_booking(uuid, timestamptz, timestamptz, text, text) to authenticated;

-- ---------------------------------------------------------
-- お客さま（専用URL）からの予約：日時を予約にも保存する
-- ---------------------------------------------------------
create or replace function public.book_slot(
  p_salon_id uuid,
  p_customer_id uuid,
  p_slot_id uuid,
  p_source text,
  p_reminder_id uuid
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_booking uuid;
  v_start timestamptz;
  v_end timestamptz;
begin
  update public.slots
     set is_booked = true
   where id = p_slot_id
     and salon_id = p_salon_id
     and not is_booked
     and starts_at > now()
  returning starts_at, ends_at into v_start, v_end;
  if not found then
    return null;
  end if;

  insert into public.bookings (salon_id, customer_id, slot_id, starts_at, ends_at, status, source, reminder_id, channel)
  values (p_salon_id, p_customer_id, p_slot_id, v_start, v_end, 'confirmed', p_source, p_reminder_id, 'line')
  returning id into v_booking;
  return v_booking;
end;
$$;
revoke all on function public.book_slot(uuid, uuid, uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.book_slot(uuid, uuid, uuid, text, uuid) to service_role;

-- ---------------------------------------------------------
-- 予約の取り消し：重なっていた空き枠を、ほかの予約がなければ空きに戻す
-- ---------------------------------------------------------
create or replace function public.cancel_booking(p_booking_id uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_salon uuid;
  v_start timestamptz;
  v_end   timestamptz;
begin
  update public.bookings
     set status = 'canceled'
   where id = p_booking_id and status = 'confirmed'
  returning salon_id, starts_at, ends_at into v_salon, v_start, v_end;

  if not found then
    raise exception 'booking not found or not cancelable';
  end if;

  update public.slots s
     set is_booked = false
   where s.salon_id = v_salon
     and s.is_booked
     and s.starts_at < v_end
     and s.ends_at > v_start
     and not exists (
       select 1 from public.bookings b
       where b.salon_id = v_salon
         and b.status in ('confirmed', 'completed')
         and b.starts_at < s.ends_at
         and b.ends_at > s.starts_at
     );
end;
$$;

-- ---------------------------------------------------------
-- リペア案内の対象者：予約の日時で「今日以降の予約あり」を判定、LIFF は不要に
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
    and c.line_user_id is not null
    and not c.line_blocked
    and not c.notify_opt_out
    and l.visited_at + coalesce(c.repair_days, s.default_repair_days) <= p_today
    and not exists (
      select 1 from public.bookings b
      where b.customer_id = c.id
        and b.status = 'confirmed'
        and b.starts_at >= (p_today::timestamp at time zone 'Asia/Tokyo')
    )
    and not exists (
      select 1 from public.reminders r
      where r.customer_id = c.id and r.cycle_visit_id = l.visit_id
    )
  order by c.salon_id, l.visited_at
$$;
