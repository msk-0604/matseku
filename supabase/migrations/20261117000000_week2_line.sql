-- =========================================================
-- 2週目：LINE接続・予約
-- 1つ目のSQL（20261110000000_init.sql）の実行後に、SQL Editor で1回だけ実行してください。
-- =========================================================

-- LINE公式アカウントの情報（接続テスト時に LINE から取得して保存）
alter table public.salons
  add column if not exists line_basic_id     text,   -- 例：@123abcde（友だち追加リンク用）
  add column if not exists line_bot_name     text,
  add column if not exists line_connected_at timestamptz;

grant select (line_basic_id, line_bot_name, line_connected_at) on public.salons to authenticated;

-- 予約一覧・空き枠の検索用
create index if not exists bookings_salon_status_idx on public.bookings (salon_id, status);
create index if not exists slots_salon_open_idx on public.slots (salon_id, starts_at) where not is_booked;

-- 予約の取り消し：予約を canceled にし、枠を空きに戻す（同じトランザクションで）
create or replace function public.cancel_booking(p_booking_id uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare v_slot uuid;
begin
  update public.bookings
     set status = 'canceled'
   where id = p_booking_id and status = 'confirmed'
  returning slot_id into v_slot;

  if v_slot is null then
    raise exception 'booking not found or not cancelable';
  end if;

  update public.slots set is_booked = false where id = v_slot;
end;
$$;

revoke all on function public.cancel_booking(uuid) from public, anon;
grant execute on function public.cancel_booking(uuid) to authenticated;

-- お客さま（LIFF）からの予約：枠を確保して予約を作る（service role から呼ぶ）
-- 枠がすでに埋まっている／過去の場合は null を返す
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
declare v_booking uuid;
begin
  update public.slots
     set is_booked = true
   where id = p_slot_id
     and salon_id = p_salon_id
     and not is_booked
     and starts_at > now();
  if not found then
    return null;
  end if;

  insert into public.bookings (salon_id, customer_id, slot_id, status, source, reminder_id)
  values (p_salon_id, p_customer_id, p_slot_id, 'confirmed', p_source, p_reminder_id)
  returning id into v_booking;

  return v_booking;
end;
$$;

revoke all on function public.book_slot(uuid, uuid, uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.book_slot(uuid, uuid, uuid, text, uuid) to service_role;
