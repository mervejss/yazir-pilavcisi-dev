-- =====================================================================
-- v40 · Kurye: sipariş detayı (kalem kalem fiyat) + kişi bazlı ayrı ödeme
-- Supabase > SQL Editor'de bir kez çalıştırın (tekrar çalıştırmak güvenli).
-- =====================================================================
create table if not exists public.order_split_payments (
  id          uuid primary key default gen_random_uuid(),
  order_id    uuid not null references public.orders(id) on delete cascade,
  courier_id  uuid references public.profiles(id) on delete set null,
  seq         int  not null default 1,
  label       text,
  method      text not null check (method in ('cash_on_delivery', 'card_on_delivery', 'iban')),
  amount      numeric(10,2) not null check (amount >= 0),
  lines       jsonb not null default '[]'::jsonb,
  created_at  timestamptz not null default now()
);
create index if not exists order_split_order_idx on public.order_split_payments(order_id);
create index if not exists order_split_courier_idx on public.order_split_payments(courier_id, created_at desc);

alter table public.order_split_payments enable row level security;

drop policy if exists order_split_select on public.order_split_payments;
create policy order_split_select on public.order_split_payments for select to authenticated
  using (courier_id = (select auth.uid()) or (select public.is_staff()));

-- Yazma yalnızca aşağıdaki güvenli fonksiyonlarla yapılır (doğrudan insert/update/delete politikası yok).

-- Kuryenin kendi siparişinin tam detayı (kalem kalem fiyat + kayıtlı ayrı ödemeler)
create or replace function public.courier_order_detail(p_order uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare o public.orders;
begin
  if public.current_app_role() is distinct from 'courier' then
    raise exception 'Yalnızca kuryeler kullanabilir' using errcode = '42501';
  end if;
  select * into o from public.orders where id = p_order and courier_id = auth.uid();
  if not found then raise exception 'Bu sipariş size atanmamış' using errcode = 'P0001'; end if;
  return jsonb_build_object(
    'id', o.id, 'order_no', o.order_no, 'status', o.status,
    'payment_method', o.payment_method,
    'subtotal', o.subtotal, 'delivery_fee', o.delivery_fee, 'discount', o.discount, 'total', o.total,
    'items', (select coalesce(jsonb_agg(jsonb_build_object(
                'id', i.id, 'name', i.product_name, 'variant', i.variant_name, 'qty', i.quantity,
                'unit_price', i.unit_price, 'line_total', i.line_total, 'note', i.note) order by i.created_at, i.id), '[]'::jsonb)
                from public.order_items i where i.order_id = o.id),
    'splits', (select coalesce(jsonb_agg(jsonb_build_object(
                'seq', s.seq, 'label', s.label, 'method', s.method, 'amount', s.amount, 'lines', s.lines) order by s.seq), '[]'::jsonb)
                from public.order_split_payments s where s.order_id = o.id)
  );
end $$;
grant execute on function public.courier_order_detail(uuid) to authenticated;

-- Ayrı ödemeleri kaydet (her çağrıda o siparişin listesi yenilenir)
create or replace function public.courier_save_splits(p_order uuid, p_splits jsonb)
returns integer language plpgsql security definer set search_path = '' as $$
declare o public.orders; s jsonb; n int := 0; v_sum numeric := 0;
begin
  if public.current_app_role() is distinct from 'courier' then
    raise exception 'Yalnızca kuryeler kullanabilir' using errcode = '42501';
  end if;
  select * into o from public.orders where id = p_order and courier_id = auth.uid();
  if not found then raise exception 'Bu sipariş size atanmamış' using errcode = 'P0001'; end if;
  if jsonb_typeof(coalesce(p_splits, '[]'::jsonb)) <> 'array' then raise exception 'Geçersiz veri'; end if;

  for s in select * from jsonb_array_elements(coalesce(p_splits, '[]'::jsonb)) loop
    v_sum := v_sum + coalesce((s->>'amount')::numeric, 0);
  end loop;
  if v_sum > o.total + 0.5 then raise exception 'Ödemelerin toplamı sipariş tutarını aşıyor' using errcode = 'P0001'; end if;

  delete from public.order_split_payments where order_id = p_order;
  for s in select * from jsonb_array_elements(coalesce(p_splits, '[]'::jsonb)) loop
    n := n + 1;
    insert into public.order_split_payments (order_id, courier_id, seq, label, method, amount, lines)
    values (p_order, auth.uid(), n, nullif(left(coalesce(s->>'label', ''), 40), ''),
            s->>'method', round((s->>'amount')::numeric, 2), coalesce(s->'lines', '[]'::jsonb));
  end loop;
  return n;
end $$;
grant execute on function public.courier_save_splits(uuid, jsonb) to authenticated;

-- =====================================================================
-- Kişiye özel zil sesi (hangi cihazdan girerse girsin yalnızca o kişide çalar)
-- Dosya ≤ 1,5 MB; satır yalnızca sahibi tarafından okunur/yazılır.
-- =====================================================================
create table if not exists public.user_ringtones (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  name       text not null,
  mime       text not null default 'audio/mpeg',
  data       text not null,           -- base64
  updated_at timestamptz not null default now()
);
alter table public.user_ringtones enable row level security;
drop policy if exists user_ringtones_own on public.user_ringtones;
create policy user_ringtones_own on public.user_ringtones for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
