-- =====================================================================
-- 40 · TRENDYOL SUNUCU YÜKÜ + SUPABASE EGRESS / LOG DÜZELTMESİ  (v59)
-- Supabase → SQL Editor'de TAMAMINI bir kez çalıştırın. Tekrar çalıştırmak güvenlidir.
-- Ön koşul: sql/18 (vault'ta 'cron_secret') ve sql/22 (platform_* fonksiyonları) daha önce çalıştırılmış olmalı.
--
-- SORUN: Her Trendyol çekiminde, listedeki HER paket için platform_apply_status() çalışıyor ve değer aynı olsa bile
--        public.orders satırına UPDATE atıyordu. Her UPDATE → Realtime olayı → açık tüm yönetim panelleri sipariş listesini
--        (ham Trendyol JSON'u dahil) baştan indiriyordu. Çekim 3 sn'de bir olunca egress ve log kotası saatler içinde doldu.
-- ÇÖZÜM: (1) Fonksiyonlar değişiklik yoksa HİÇBİR YERE yazmaz (aşağıda).  (2) Edge Function artık değişmeyen paketi hiç göndermez.
--        (3) Zamanlayıcı makul aralığa çekilir.  (4) Eski kayıtlar düzenli temizlenir.
-- =====================================================================

-- ---------- 1) platform_apply_status: yalnızca gerçekten değişen şey varsa UPDATE ----------
create or replace function public.platform_apply_status(
  p_order_id uuid, p_status public.order_status, p_platform_status text default null,
  p_cancel_reason text default null, p_payload jsonb default null,
  p_call_center_phone text default null, p_pin_code text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_changed boolean; v_to public.order_status;
begin
  if coalesce(auth.role(), current_setting('request.jwt.claim.role', true), 'service_role') <> 'service_role' then
    raise exception 'Yetkisiz' using errcode = '42501';
  end if;
  update public.orders o
     set platform_status   = coalesce(nullif(p_platform_status, ''), o.platform_status),
         call_center_phone = coalesce(nullif(p_call_center_phone, ''), o.call_center_phone),
         pin_code          = coalesce(nullif(p_pin_code, ''), o.pin_code),
         external_payload  = coalesce(p_payload, o.external_payload)
   where o.id = p_order_id
     and (   (nullif(p_platform_status, '')    is not null and o.platform_status   is distinct from p_platform_status)
          or (nullif(p_call_center_phone, '')  is not null and o.call_center_phone is distinct from p_call_center_phone)
          or (nullif(p_pin_code, '')           is not null and o.pin_code          is distinct from p_pin_code)
          or (p_payload is not null and o.external_payload is distinct from p_payload));
  v_changed := public._platform_move_status(p_order_id, p_status, null, p_cancel_reason);
  select status into v_to from public.orders where id = p_order_id;
  return jsonb_build_object('order_id', p_order_id, 'changed', v_changed, 'status', v_to);
end $$;
revoke all on function public.platform_apply_status(uuid, public.order_status, text, text, jsonb, text, text) from public, anon, authenticated;
grant execute on function public.platform_apply_status(uuid, public.order_status, text, text, jsonb, text, text) to service_role;

-- ---------- 2) platform_ingest_order: var olan siparişte de aynı koruma (webhook tekrarları için önemli) ----------
create or replace function public.platform_ingest_order(p jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_source  text := p->>'source';
  v_ref     text := nullif(p->>'external_ref', '');
  v_id      uuid;
  v_no      bigint;
  v_new     public.order_status := coalesce(nullif(p->>'status', '')::public.order_status, 'new');
  v_created boolean := false;
begin
  if coalesce(auth.role(), current_setting('request.jwt.claim.role', true), 'service_role') <> 'service_role' then
    raise exception 'Yetkisiz' using errcode = '42501';
  end if;
  if v_ref is null or not exists (select 1 from public.order_sources where code = v_source and is_platform and is_active) then
    raise exception 'Geçersiz platform veya sipariş numarası' using errcode = 'P0001';
  end if;

  select id into v_id from public.orders where source = v_source and external_ref = v_ref;

  if v_id is null then
    insert into public.orders (
      source, order_type, status, customer_name, customer_phone, delivery_address, district, lat, lng, note,
      payment_method, payment_status, subtotal, delivery_fee, discount, total,
      external_ref, external_payload, pin_code, order_code, call_center_phone, platform_app, platform_status)
    values (
      v_source, 'delivery', 'new',
      nullif(left(p->>'customer_name', 120), ''), nullif(left(p->>'customer_phone', 40), ''),
      nullif(left(p->>'delivery_address', 800), ''), nullif(left(p->>'district', 80), ''),
      nullif(p->>'lat', '')::numeric, nullif(p->>'lng', '')::numeric,
      nullif(left(p->>'note', 500), ''),
      'platform_online', 'paid',
      coalesce(nullif(p->>'subtotal', '')::numeric, 0), coalesce(nullif(p->>'delivery_fee', '')::numeric, 0),
      coalesce(nullif(p->>'discount', '')::numeric, 0), coalesce(nullif(p->>'total', '')::numeric, 0),
      v_ref, p->'payload',
      nullif(p->>'pin_code', ''), nullif(p->>'order_code', ''), nullif(p->>'call_center_phone', ''),
      nullif(p->>'platform_app', ''), nullif(p->>'platform_status', ''))
    returning id, order_no into v_id, v_no;

    insert into public.order_items (order_id, product_name, variant_name, unit_price, quantity, note)
    select v_id, left(coalesce(x.name, 'Ürün'), 200), nullif(left(x.variant, 200), ''),
           greatest(coalesce(x.unit_price, 0), 0), least(greatest(coalesce(x.quantity, 1), 1), 100),
           nullif(left(x.note, 300), '')
      from jsonb_to_recordset(coalesce(p->'items', '[]'::jsonb))
           as x(name text, variant text, unit_price numeric, quantity int, note text);
    v_created := true;
  else
    select order_no into v_no from public.orders where id = v_id;
    update public.orders o
       set platform_status   = coalesce(nullif(p->>'platform_status', ''), o.platform_status),
           call_center_phone = coalesce(nullif(p->>'call_center_phone', ''), o.call_center_phone),
           pin_code          = coalesce(nullif(p->>'pin_code', ''), o.pin_code),
           external_payload  = coalesce(p->'payload', o.external_payload)
     where o.id = v_id
       and (   (nullif(p->>'platform_status', '')   is not null and o.platform_status   is distinct from p->>'platform_status')
            or (nullif(p->>'call_center_phone', '') is not null and o.call_center_phone is distinct from p->>'call_center_phone')
            or (nullif(p->>'pin_code', '')          is not null and o.pin_code          is distinct from p->>'pin_code')
            or (p->'payload' is not null and o.external_payload is distinct from p->'payload'));
  end if;

  -- Trendyol'daki gerçek durum "yeni"den ilerideyse (ör. tabletten kabul edilmiş) siteye de yansıt
  if v_new <> 'new' then
    perform public._platform_move_status(v_id, v_new, null, nullif(p->>'cancel_reason', ''));
  end if;

  return jsonb_build_object('order_id', v_id, 'order_no', v_no, 'created', v_created);
end $$;
revoke all on function public.platform_ingest_order(jsonb) from public, anon, authenticated;
grant execute on function public.platform_ingest_order(jsonb) to service_role;

-- ---------- 3) Zamanlayıcı: eski/hızlı Trendyol işlerini kaldır, TEK iş kur ----------
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- 30 sn'lik, 3 sn'lik, "trendyol-order-sync" vb. ne varsa hepsini temizler
select cron.unschedule(jobid) from cron.job where jobname ilike '%trendyol%';

-- AÇIK KARAR (varsayılan: 2 dakika). Siparişi çok geç fark etmek istemezseniz '* * * * *' (1 dk) yapabilirsiniz.
--   Webhook'u kurduktan sonra bu işi '*/10 * * * *' (10 dk, yalnızca güvenlik ağı) yapın — bkz. V59_NOTLAR.md.
select cron.schedule(
  'trendyol-sync-orders',
  '*/2 * * * *',
  $$
  select net.http_post(
    url     := 'https://pgapkexzykydecedgzti.supabase.co/functions/v1/platform-trendyol',
    headers := jsonb_build_object(
                 'Content-Type', 'application/json',
                 'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')),
    body    := '{"action":"sync_orders"}'::jsonb,
    timeout_milliseconds := 20000
  );
  $$
);

-- ---------- 4) Temizlik: kayıt şişmesi (log / depolama) ----------
delete from public.integration_events where created_at < now() - interval '7 days';
delete from cron.job_run_details       where end_time   < now() - interval '2 days';
delete from net._http_response         where created    < now() - interval '1 day';

select cron.unschedule(jobid) from cron.job where jobname = 'yz-housekeeping';
select cron.schedule(
  'yz-housekeeping',
  '17 4 * * *',
  $$
  delete from public.integration_events where created_at < now() - interval '7 days';
  delete from cron.job_run_details       where end_time   < now() - interval '2 days';
  delete from net._http_response         where created    < now() - interval '1 day';
  $$
);

-- ---------- Kontrol ----------
--   select jobname, schedule, active from cron.job;                      -- trendyol-sync-orders  */2 * * * *
--   select status, return_message, start_time from cron.job_run_details order by start_time desc limit 5;
--   Kullanım: Dashboard → Settings → Usage → Egress ve Log ingestion grafikleri 1-2 saat içinde düşmeye başlamalı.
