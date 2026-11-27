-- =====================================================================
-- 50 · Müşteri "Restoranda yiyeceğim" siparişi (QR olmadan, masa + sandalye seçerek)
--   • public_dining_tables()  : masa seçim ekranı için aktif masalar (anon çağırabilir; id/token DÖNMEZ)
--   • place_table_order(...)  : masa numarası + (isteğe bağlı) sandalye ile masa siparişi
-- Önce 02 (place_order/_create_order) çalışmış olmalı. Tekrar çalıştırılabilir.
-- =====================================================================

create or replace function public.public_dining_tables()
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'number', t.number, 'name', t.name, 'capacity', t.capacity, 'shape', t.shape,
           'occupied', exists (select 1 from public.table_sessions s where s.table_id = t.id and s.status = 'open')
         ) order by t.number), '[]'::jsonb)
    from public.dining_tables t
   where t.is_active
$$;

create or replace function public.place_table_order(
  p_table_number int, p_items jsonb,
  p_note text default null, p_seat int default null, p_guest text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_s     public.business_settings%rowtype;
  v_t     public.dining_tables%rowtype;
  v_note  text;
  v_guest text := nullif(left(trim(coalesce(p_guest, '')), 60), '');
begin
  select * into v_s from public.business_settings where id = 1;
  if not v_s.is_accepting_orders then
    raise exception 'Şu an online sipariş alamıyoruz. Lütfen garsonumuza söyleyin.' using errcode = 'P0001';
  end if;
  if v_s.enforce_opening_hours and not public.is_open_now() then
    raise exception 'Şu an kapalıyız. Çalışma saatlerimizde tekrar deneyin.' using errcode = 'P0001';
  end if;

  select * into v_t from public.dining_tables where number = p_table_number and is_active;
  if not found then
    raise exception 'Masa bulunamadı. Lütfen masa numarasını tekrar seçin.' using errcode = 'P0001';
  end if;

  if p_seat is not null and (p_seat < 1 or p_seat > greatest(v_t.capacity, 1)) then
    raise exception 'Geçersiz sandalye numarası' using errcode = 'P0001';
  end if;

  -- kötüye kullanım koruması: aynı masaya 10 dakikada en fazla 15 müşteri siparişi
  if (select count(*) from public.orders
       where table_id = v_t.id and source = 'table' and created_by is null
         and created_at > now() - interval '10 minutes') >= 15 then
    raise exception 'Bu masadan çok fazla sipariş geldi. Lütfen garsonumuza söyleyin.' using errcode = 'P0001';
  end if;

  v_note := nullif(concat_ws(' · ',
              case when p_seat is not null then '🪑 Sandalye ' || p_seat end,
              nullif(left(trim(coalesce(p_note, '')), 400), '')), '');

  return public._create_order('table', 'dine_in',
           jsonb_build_object('name', v_guest), p_items, v_t.id, null, v_note, auth.uid(), false, false);
end $$;

revoke all on function public.public_dining_tables() from public;
revoke all on function public.place_table_order(int, jsonb, text, int, text) from public;
grant execute on function public.public_dining_tables() to anon, authenticated;
grant execute on function public.place_table_order(int, jsonb, text, int, text) to anon, authenticated;
