-- =====================================================================
-- 24 · TRENDYOL FİNANS (Cari Hesap Ekstresi): hakediş, komisyon, kesintiler, net kâr
-- Tekrar çalıştırmak güvenlidir (idempotent). Yalnızca sahip ('integrations.manage') görür.
-- Veriyi Edge Function (service_role) yazar; panel yalnızca okur ve ayar kaydeder.
-- =====================================================================

-- settlements servisi: satış, iade, indirim, kupon, provizyon, komisyon/hakediş düzeltmeleri, teslimat ücreti
create table if not exists public.finance_settlements (
  id                    text primary key,            -- Trendyol kayıt id
  platform              text not null default 'trendyol',
  transaction_date      timestamptz,
  transaction_type      text,                        -- ham tür (Sale, Return, Discount ...)
  transaction_label     text,                        -- Trendyol'un Türkçe adı (Satış, İade ...)
  description           text,
  barcode               text,
  receipt_id            bigint,
  order_number          text,
  shipment_package_id   text,
  order_date            timestamptz,
  debt                  numeric(14,4) not null default 0,
  credit                numeric(14,4) not null default 0,
  commission_rate       numeric(8,4),
  commission_amount     numeric(14,4),
  seller_revenue        numeric(14,4),
  payment_period        int,
  payment_order_id      bigint,
  payment_date          timestamptz,
  commission_invoice_serial text,
  source                text not null default 'api', -- api | import
  raw                   jsonb,
  synced_at             timestamptz not null default now()
);
create index if not exists finance_settlements_date_idx on public.finance_settlements(transaction_date desc);
create index if not exists finance_settlements_order_idx on public.finance_settlements(order_number);
create index if not exists finance_settlements_pkg_idx on public.finance_settlements(shipment_package_id);
create index if not exists finance_settlements_po_idx on public.finance_settlements(payment_order_id);
create index if not exists finance_settlements_type_idx on public.finance_settlements(transaction_type);

-- otherfinancials servisi: stopaj, platform hizmet bedeli, faturalar, ödemeler, virman, erken ödeme ...
create table if not exists public.finance_other (
  id                    text primary key,
  platform              text not null default 'trendyol',
  transaction_date      timestamptz,
  transaction_type      text,
  transaction_label     text,
  description           text,
  receipt_id            bigint,
  debt                  numeric(14,4) not null default 0,
  credit                numeric(14,4) not null default 0,
  payment_order_id      bigint,
  commission_invoice_serial text,
  source                text not null default 'api',
  raw                   jsonb,
  synced_at             timestamptz not null default now()
);
create index if not exists finance_other_date_idx on public.finance_other(transaction_date desc);
create index if not exists finance_other_type_idx on public.finance_other(transaction_type);

-- payment-order servisi: haftalık ödeme emirleri (çarşamba)
create table if not exists public.finance_payment_orders (
  id            bigint primary key,
  platform      text not null default 'trendyol',
  status        text,
  amount        numeric(14,2),
  payout_date   timestamptz,
  payment_type  text,
  raw           jsonb,
  synced_at     timestamptz not null default now()
);
create index if not exists finance_po_date_idx on public.finance_payment_orders(payout_date desc);

-- Maliyet / KDV ayarları (tek satır)
create table if not exists public.finance_settings (
  id          int primary key default 1 check (id = 1),
  settings    jsonb not null default '{}'::jsonb,
  updated_at  timestamptz not null default now()
);
insert into public.finance_settings (id, settings) values (1, '{
  "foodCostPct": 35,
  "packagingPerOrder": 0,
  "courierPerOrder": 0,
  "otherCostPct": 0,
  "salesVatPct": 10,
  "commissionVatPct": 20,
  "costVatPct": 0
}'::jsonb) on conflict (id) do nothing;

-- Eşleşme / son senkron bilgisi için integrations.config kullanılır (finance_* anahtarları).

-- ---------- RLS ----------
alter table public.finance_settlements     enable row level security;
alter table public.finance_other           enable row level security;
alter table public.finance_payment_orders  enable row level security;
alter table public.finance_settings        enable row level security;

drop policy if exists finance_settlements_sel on public.finance_settlements;
create policy finance_settlements_sel on public.finance_settlements for select to authenticated
  using ((select public.has_permission('integrations.manage')));
drop policy if exists finance_other_sel on public.finance_other;
create policy finance_other_sel on public.finance_other for select to authenticated
  using ((select public.has_permission('integrations.manage')));
drop policy if exists finance_po_sel on public.finance_payment_orders;
create policy finance_po_sel on public.finance_payment_orders for select to authenticated
  using ((select public.has_permission('integrations.manage')));
drop policy if exists finance_settings_all on public.finance_settings;
create policy finance_settings_all on public.finance_settings for all to authenticated
  using ((select public.has_permission('integrations.manage')))
  with check ((select public.has_permission('integrations.manage')));

-- Excel/CSV içe aktarma (API çalışmazsa yedek yol) tarayıcıdan yazar → yalnızca yetkili kullanıcı
drop policy if exists finance_settlements_ins on public.finance_settlements;
create policy finance_settlements_ins on public.finance_settlements for insert to authenticated
  with check ((select public.has_permission('integrations.manage')));
drop policy if exists finance_settlements_upd on public.finance_settlements;
create policy finance_settlements_upd on public.finance_settlements for update to authenticated
  using ((select public.has_permission('integrations.manage')))
  with check ((select public.has_permission('integrations.manage')));
drop policy if exists finance_settlements_del on public.finance_settlements;
create policy finance_settlements_del on public.finance_settlements for delete to authenticated
  using ((select public.has_permission('integrations.manage')) and source = 'import');

drop policy if exists finance_other_ins on public.finance_other;
create policy finance_other_ins on public.finance_other for insert to authenticated
  with check ((select public.has_permission('integrations.manage')));
drop policy if exists finance_other_upd on public.finance_other;
create policy finance_other_upd on public.finance_other for update to authenticated
  using ((select public.has_permission('integrations.manage')))
  with check ((select public.has_permission('integrations.manage')));
drop policy if exists finance_other_del on public.finance_other;
create policy finance_other_del on public.finance_other for delete to authenticated
  using ((select public.has_permission('integrations.manage')) and source = 'import');

grant select, insert, update, delete on public.finance_settlements to authenticated;
grant select, insert, update, delete on public.finance_other to authenticated;
grant select on public.finance_payment_orders to authenticated;
grant select, insert, update on public.finance_settings to authenticated;
grant all on public.finance_settlements, public.finance_other, public.finance_payment_orders, public.finance_settings to service_role;
