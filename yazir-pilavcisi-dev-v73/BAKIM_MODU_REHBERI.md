# Yazır Pilavcısı — Bakım Modu Rehberi

Bakım modu **iki parçadan** oluşur. İkisi de açılıp kapatılabilir, hiçbir veri/dosya silinmez.

| Parça | Ne yapar | Nasıl açılır / kapanır |
|---|---|---|
| **Ön yüz (site)** | Müşteri ve personel yalnızca "bakımdayız" ekranını görür. Menü, sipariş, sepet, giriş, kayıt, admin, kurye hiç yüklenmez. | `src/config/maintenance.ts` içindeki `MAINTENANCE_MODE = true / false` → commit + push → Cloudflare deploy |
| **Arka uç (gerçek kilit)** | Supabase API'si (REST/RPC) ve Storage yazma, bakım açıkken 503 döner. Ekran aşılsa / eski sekme açık olsa / anon key ile doğrudan istek atılsa bile işlem yapılamaz. Edge Function'lar (personel oluşturma, panelden platform çağrıları) kapanır. | Supabase SQL Editor → `sql/bakim/maintenance_on.sql` / `maintenance_off.sql` |

Bakım ekranı metinleri `src/config/maintenance.ts` içindedir.

---

## A) KAPATMA (bakıma alma) — sırayla

### 1. Çalışan sürümü koru (geri dönüş noktası)
```bash
git branch --show-current          # main mi master mı? (aşağıda main varsayıldı)
git checkout main
git pull origin main
git status                         # "nothing to commit, working tree clean" olmalı
git log --oneline -1               # şu anki çalışan commit
git tag -a v72-calisan-surum -m "Bakım öncesi çalışan sürüm"
git push origin v72-calisan-surum
```
**Geri dönüş noktası = `v72-calisan-surum` etiketi.** (Ayrıca Cloudflare'de bu sürümün deploy'u "Deployments" listesinde durur.)

### 2. Ayrı branch aç, zip'i uygula
```bash
git checkout -b bakim-modu
```
Zip'in içindekileri proje köküne, aynı klasör yapısıyla kopyalayıp **üzerine yazın**. Sonra:
```bash
git status                         # yalnızca aşağıdaki dosyalar görünmeli
```
Yeni: `src/config/maintenance.ts`, `src/maintenance/*`, `sql/47_maintenance_mode.sql`, `sql/bakim/maintenance_on.sql`, `sql/bakim/maintenance_off.sql`, `BAKIM_MODU_REHBERI.md`
Değişen: `src/main.tsx`, `vite.config.ts`, `sql/ORDER.txt`, `supabase/functions/_shared/common.ts`, `staff-admin`, `platform-trendyol`, `platform-migros`, `google-reviews-sync`

### 3. Bilgisayarında test et
```bash
npm install
npm run build        # hatasız bitmeli
npm test
npm run dev          # http://localhost:3000  → /, /menu, /personel-giris, /admin  hepsi bakım ekranı
```

### 4. Branch'i GitHub'a gönder (production'a DOKUNMAZ)
```bash
git add src/config src/maintenance src/main.tsx vite.config.ts sql supabase BAKIM_MODU_REHBERI.md
git commit -m "Bakım modu eklendi"
git push -u origin bakim-modu
```
Cloudflare Pages bu branch için **Preview** adresi üretir (Dashboard → Workers & Pages → proje → Deployments → "Preview"). Orada bakım ekranını kontrol edin. Production hâlâ eski, çalışan sürümdür.

### 5. Supabase hazırlığı (zararsız, bakım hâlâ KAPALI kalır)
1. SQL Editor'de `sql/47_maintenance_mode.sql` dosyasını **bir kez** çalıştırın.
2. Edge Function'ları daha önce nasıl deploy ettiyseniz öyle yeniden deploy edin:
```bash
supabase functions deploy staff-admin --no-verify-jwt
supabase functions deploy platform-trendyol --no-verify-jwt
supabase functions deploy platform-migros --no-verify-jwt
supabase functions deploy google-reviews-sync
```
> Preview deploy'u da **aynı Supabase'i** kullanır. `maintenance_on.sql` preview testinden önce çalıştırılmamalı.

### 6. Onay → production'a al
```bash
git checkout main
git merge --no-ff bakim-modu -m "Bakım modu: siteyi geçici kapat"
git push origin main
```
Cloudflare Pages deploy'u bitirince (Deployments → Success) SQL Editor'de `sql/bakim/maintenance_on.sql` çalıştırın.

### 7. Kontrol
- `https://yazirpilavcisi.com.tr/`, `/menu`, `/siparis`, `/personel-giris`, `/admin` → bakım ekranı (telefondan da)
- API gerçekten kilitli mi:
```bash
curl -i "https://<proje>.supabase.co/rest/v1/products?select=id&limit=1" -H "apikey: <ANON_KEY>"
# → HTTP/2 503  "Sistem geçici olarak bakımdadır."
```
- (İsteğe bağlı) Supabase → Authentication → Sign In / Providers → **"Allow new users to sign up" kapalı** (bakım ekranı olmasa da API'den hesap açılmasın).

---

## B) TEKRAR AÇMA (ödeme geldi) — sırayla

1. Supabase SQL Editor → `sql/bakim/maintenance_off.sql` (API tekrar açılır).
2. Siteyi aç — iki yoldan biri:

**Yol 1 — bir satır değiştir (önerilen)**
```bash
git checkout main && git pull origin main
# src/config/maintenance.ts  →  MAINTENANCE_MODE: boolean = false;
git add src/config/maintenance.ts
git commit -m "Bakım modu kapatıldı"
git push origin main
```

**Yol 2 — merge'i geri al**
```bash
git log --oneline --merges -3                 # "Bakım modu: siteyi geçici kapat" commit'ini bul
git revert -m 1 <o-commitin-kodu>
git push origin main
```

**Yol 3 — en hızlısı (acil)**: Cloudflare Dashboard → proje → Deployments → bakımdan önceki Success deploy → **Rollback to this deployment**. Sonra SQL `maintenance_off.sql`.

Tekrar kapatmak için aynı kodu `true` yapın + `maintenance_on.sql`. Domain, hosting, veritabanı, kullanıcılar, siparişler, ürünler, oturumlar bakım boyunca olduğu gibi kalır; yeniden kurulum gerekmez.

## C) Çok kötü giderse: tamamen eski sürüme dön
```bash
git checkout main
git revert -m 1 <bakım-merge-commit-kodu>     # geçmişi bozmadan geri alır (force push GEREKMEZ)
git push origin main
```
veya yalnızca incelemek için: `git checkout v72-calisan-surum`. Sonra `maintenance_off.sql`.

---

## Kapsam ve sınırlar (bilmeniz gerekenler)
- **Zamanlanmış görevler (cron) bakımda da çalışır**: Trendyol/Migros senkronu, menü yedeği, Google yorum senkronu. Bilerek böyle: platformdan gelen sipariş/finans verisi kaybolmasın. Panelden tetiklenen çağrılar kapalıdır.
- Supabase **Auth** uçları (giriş/kayıt) bu kilidin dışındadır. Personel giriş yapsa bile token ile API'ye erişemez (503). Yeni kayıt açılmasın istiyorsanız yukarıdaki "Allow new users to sign up" ayarını kapatın.
- Realtime'a zaten bağlı eski bir sekme olay almaya devam edebilir; yazma/işlem yapamaz.
- Bakım sayfaları HTTP 200 döner (statik barındırma). Kapalılık haftalarca sürerse Google aramada geçici düşüş olabilir.
- `supabase/functions/google-reviews-sync` eskiden de yalnızca "Authorization başlığı var mı" diye bakıyordu (başlığın doğruluğunu doğrulamıyor). Bu bakımla ilgisiz, eski bir zayıflık; ayrıca düzeltilmesi önerilir.
- `.env` dosyası git'e girmez (`.gitignore`); bu pakete de konmadı.
