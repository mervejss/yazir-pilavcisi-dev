-- =====================================================================
-- YAZIR PİLAVCISI · 49 · Admin siparişinde TL (sabit tutar) İNDİRİMİ
-- Önkoşul: 48_admin_order_discount.sql çalıştırılmış olmalı. Supabase SQL Editor'de BİR KEZ çalıştırın.
-- Yalnızca public._apply_order_discount fonksiyonunu GENİŞLETİR (aynı imza; mevcut siparişler/veri değişmez).
-- Eski davranış (yüzde) birebir korunur. Yeni:
--  'cart_amount' → Tüm sepetten sabit TL: orders.discount = min(TL, ara toplam)   (p_percent = TL tutarı)
--  'items'       → satırlarda {variant_id, percent} VEYA {variant_id, amount}:
--                  amount → ürünün BİRİM fiyatından TL düşer (0'ın altına inmez)
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

  elsif p_mode = 'cart_amount' then
    if p_percent is null or p_percent <= 0 or p_percent > 1000000 then
      raise exception 'İndirim tutarı geçersiz' using errcode = 'P0001';
    end if;
    v_disc := least(round(p_percent, 2), v_before);

  elsif p_mode = 'items' then
    if p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
      raise exception 'İndirim uygulanacak ürün seçilmedi' using errcode = 'P0001';
    end if;
    for r in
      select (x->>'variant_id')::uuid as variant_id,
             nullif(x->>'percent', '')::numeric as pct,
             nullif(x->>'amount', '')::numeric  as amt
        from jsonb_array_elements(p_lines) x
    loop
      if r.pct is not null then
        if r.pct <= 0 or r.pct > 100 then
          raise exception 'İndirim yüzdesi 0 ile 100 arasında olmalı' using errcode = 'P0001';
        end if;
        update public.order_items
           set unit_price = round(unit_price * (1 - r.pct / 100), 2)
         where order_id = p_order_id and variant_id = r.variant_id;
      elsif r.amt is not null then
        if r.amt <= 0 or r.amt > 1000000 then
          raise exception 'İndirim tutarı geçersiz' using errcode = 'P0001';
        end if;
        update public.order_items
           set unit_price = greatest(round(unit_price - r.amt, 2), 0)
         where order_id = p_order_id and variant_id = r.variant_id;
      else
        raise exception 'İndirim oranı veya tutarı eksik' using errcode = 'P0001';
      end if;
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
          jsonb_build_object('mode', p_mode, 'value', p_percent, 'lines', p_lines, 'discount', v_disc, 'total', v_total),
          'Yönetici indirimi', auth.uid(), public.current_app_role());

  return jsonb_build_object('discount', v_disc, 'total', v_total);
end $$;

revoke execute on function public._apply_order_discount(uuid, text, numeric, jsonb) from public, anon, authenticated;
