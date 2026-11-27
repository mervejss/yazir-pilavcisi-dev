# SQL kurulum rehberi

Her şey **tek bir sıra listesine** bağlı: [`ORDER.txt`](ORDER.txt). Dosyalar bu sırayla çalışır; hepsi tekrar çalıştırılabilir (idempotent) olacak şekilde yazılmıştır.

## Hangi yolu seçmeliyim?
| Durum | Ne yapılır |
|---|---|
| **Boş Supabase projesi** | `yazir_full_schema.sql` dosyasını SQL Editor'de **bir kez** çalıştırın → sonra `07_bootstrap_owner.sql` (sahip e-postasını yazarak). |
| **Çalışan sistemi güncelleme** | Yalnızca daha önce çalıştırmadığınız **yeni numaralı** dosyaları, numara sırasıyla çalıştırın (şu an son dosya: `45_…`). |
| **Geçmiş siparişler (Trendyol Excel verisi)** | `veri/` klasörü: `005_past_orders.sql` → `005b_fix_id_identity.sql` → `006_past_orders_seed_trendyol.sql` (tam şemadan SONRA; isteğe bağlı). |

## Klasörler
- `01…45_*.sql` — kurulum/güncelleme dosyaları (sıra: `ORDER.txt`). `35a`/`35b` aynı numarayı taşıyan iki dosyanın sıralı hâlidir.
- `yazir_full_schema.sql` — `ORDER.txt`'teki dosyaların birleşimi (**otomatik üretilir**, elle düzenlemeyin).
- `07_bootstrap_owner.sql` — ilk işletme sahibini atar; e-posta yazmanız gerektiği için zincirin dışındadır.
- `bakim/` — normal kurulumda çalıştırılmaz: `00_quick_fix.sql` (acil izin onarımı — **izinleri genişletir**, dosyadaki uyarıya bakın), `99_dev_reset.sql` (**her şeyi siler**, yalnızca geliştirme).
- `veri/` — büyük veri dosyaları (geçmiş siparişler).
- `arsiv/` — eskimiş dosyalar, **çalıştırmayın** (`08_quick_order_support.sql`: `08_quick_orders.sql` ve `02` tarafından aşıldı).
- `tools/` — `supabase_stub.sql`, `verify.sh`, `build_full_schema.sh` (aşağıya bakın).
- `tests/` — veritabanı testleri.

## Ön koşullar (Supabase tarafı)
- **pg_cron** ve **pg_net** eklentileri açık olmalı (Database → Extensions). Zamanlayıcı dosyaları (`18, 34, 35b, 40, 42, 43`) bunları kullanır.
- Vault'ta **`cron_secret`** adlı bir sır olmalı (Edge Function çağrılarında `x-cron-secret` olarak gider; `18_trendyol_cron.sql` başındaki açıklamaya bakın).
- Edge Function'lar ayrıca deploy edilir (`supabase/functions`), SQL bunları kurmaz.

## Yeni SQL dosyası eklerken (geliştirici)
1. `NN_aciklama.sql` oluşturun (bir sonraki numara; aynı numarayı iki dosyaya vermeyin) ve **`ORDER.txt`**'in sonuna ekleyin.
2. `sql/tools/build_full_schema.sh` ile tam şemayı yeniden üretin.
3. `sql/tools/verify.sh` çalıştırın: boş bir PostgreSQL'de tüm dosyaları sırayla kurar, hata varsa dosya adıyla gösterir ve `tests/*.test.sql` testlerini koşar. (`--full` seçeneği tek dosya kurulumunu doğrular.)
   Gerekli: PostgreSQL + psql; `PGHOST/PGPORT/PGUSER` ayarlı olmalı. Geçici `yz_verify` veritabanı açıp siler; gerçek projede çalıştırmayın.

## Doğrulama durumu (v70)
- 01–45 dosyaların hepsi boş PostgreSQL 16'da hatasız kuruldu (Supabase'e özgü `auth/storage/vault/cron/net` parçaları `tools/supabase_stub.sql` ile taklit edildi; gerçek Supabase'te çalıştırılmadı).
- `yazir_full_schema.sql` ile parça parça kurulum **aynı şemayı** üretti (tablo, fonksiyon, politika, tetikleyici, indeks karşılaştırıldı).
- Testler: müşteri numarası ve aynı telefon, hesap bölme, Trendyol sipariş girişi.
