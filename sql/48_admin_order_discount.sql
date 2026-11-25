-- =====================================================================
-- YAZIR PİLAVCISI · 48 · Admin siparişinde İNDİRİM (Yeni Sipariş ekranı)
-- Supabase SQL Editor'de BİR KEZ çalıştırın. Mevcut tablo/veri/fonksiyon DEĞİŞMEZ; yalnızca 2 yeni fonksiyon eklenir.
-- Önkoşul: 46_scheduled_orders_bulk_requests.sql (staff_create_order_ex) çalıştırılmış olmalı.
--
-- İki indirim türü:
--  'cart'  → Tüm sepet tutarından yüzde: orders.discount = ara toplam × %, ürün fiyatları aynı kalır.
--  'items' → Her ürüne ayrı: seçilen satırların birim fiyatı (order_items.unit_price) yüzde kadar düşer;
--            orders.subtotal ORİJİNAL kalır, orders.discount = toplam düşen tutar (referans indirimiyle aynı yöntem).
-- İndirim yalnızca ürün tutarına uygulanır, teslimat ücretine uygulanmaz.
-- Toplam = ara toplam + teslimat ücreti − indirim (0'ın altına inmez). Denetim kaydı (audit_logs) tutulur.
-- Yetki: orders.create (siparişi oluşturabilen personel).
-- =====================================================================

create or replace function public._apply_order_discount(p_order_id uuid, p_mode text, p_percent numeric, p_lines jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_o      public.orders%rowtype;
  v_before numeric(10,2);
  v_after  numeric(10,2);
  v_disc   numeric(10,2);
  v_total  numeric(10,2);
  r        record;
begin
  select * into v_o from public.orders where id = p_order_id for update;
  if not found then raise exception 'Sipariş bulunamadı' using errcode = 'P0001'; end if;
  v_before := v_o.subtotal;

  if p_mode = 'cart' then
    if p_percent is null or p_percent <= 0 or p_percent > 100 then
      raise exception 'İndirim yüzdesi 0 ile 100 arasında olmalı' using errcode = 'P0001';
    end if;
    v_disc := round(v_before * p_percent / 100, 2);

  elsif p_mode = 'items' then
    if p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
      raise exception 'İndirim uygulanacak ürün seçilmedi' using errcode = 'P0001';
    end if;
    for r in
      select (x->>'variant_id')::uuid as variant_id, (x->>'percent')::numeric as pct
        from jsonb_array_elements(p_lines) x
    loop
      if r.pct is null or r.pct <= 0 or r.pct > 100 then
        raise exception 'İndirim yüzdesi 0 ile 100 arasında olmalı' using errcode = 'P0001';
      end if;
      update public.order_items
         set unit_price = round(unit_price * (1 - r.pct / 100), 2)
       where order_id = p_order_id and variant_id = r.variant_id;
    end loop;
    select coalesce(sum(line_total), 0) into v_after from public.order_items where order_id = p_order_id;
    v_disc := greatest(v_before - v_after, 0);

  else
    raise exception 'Geçersiz indirim türü' using errcode = 'P0001';
  end if;

  v_disc  := v_o.discount + v_disc;
  v_total := greatest(v_before + v_o.delivery_fee - v_disc, 0);
  update public.orders set discount = v_disc, total = v_total where id = p_order_id;

  insert into public.audit_logs (table_name, record_id, action, old_data, new_data, reason, actor_id, actor_role)
  values ('orders', p_order_id::text, 'DISCOUNT_APPLIED',
          jsonb_build_object('subtotal', v_before, 'discount', v_o.discount, 'total', v_o.total),
          jsonb_build_object('mode', p_mode, 'percent', p_percent, 'lines', p_lines, 'discount', v_disc, 'total', v_total),
          'Yönetici indirimi', auth.uid(), public.current_app_role());

  return jsonb_build_object('discount', v_disc, 'total', v_total);
end $$;

-- Sipariş + indirim TEK işlemde (biri başarısız olursa hiçbiri kaydedilmez)
create or replace function public.staff_create_order_discounted(
  p_source text, p_type public.order_type, p_customer jsonb, p_items jsonb,
  p_table_id uuid default null, p_payment public.payment_method default null,
  p_note text default null, p_courier_id uuid default null, p_save_address boolean default true,
  p_scheduled_for timestamptz default null,
  p_discount_mode text default null, p_discount_percent numeric default null, p_discount_lines jsonb default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_res jsonb;
  v_d   jsonb;
begin
  perform public._require_permission('orders.create');
  v_res := public.staff_create_order_ex(p_source, p_type, p_customer, p_items, p_table_id, p_payment,
                                        p_note, p_courier_id, p_save_address, p_scheduled_for);
  v_d := public._apply_order_discount((v_res->>'order_id')::uuid, p_discount_mode, p_discount_percent, p_discount_lines);
  return v_res || v_d;
end $$;

revoke execute on function public._apply_order_discount(uuid, text, numeric, jsonb) from public, anon, authenticated;
revoke execute on function public.staff_create_order_discounted(text, public.order_type, jsonb, jsonb, uuid, public.payment_method, text, uuid, boolean, timestamptz, text, numeric, jsonb) from public, anon;
grant  execute on function public.staff_create_order_discounted(text, public.order_type, jsonb, jsonb, uuid, public.payment_method, text, uuid, boolean, timestamptz, text, numeric, jsonb) to authenticated;

-- GERİ ALMA (gerekirse; mevcut siparişler etkilenmez):
--   drop function if exists public.staff_create_order_discounted(text, public.order_type, jsonb, jsonb, uuid, public.payment_method, text, uuid, boolean, timestamptz, text, numeric, jsonb);
--   drop function if exists public._apply_order_discount(uuid, text, numeric, jsonb);
