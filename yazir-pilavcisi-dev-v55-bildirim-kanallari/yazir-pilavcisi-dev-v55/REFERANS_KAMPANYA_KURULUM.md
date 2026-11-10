# Referans Kampanyaları — Kurulum

Bu güncelleme Yazır Pilavcısı projesine işletme bazlı referans kampanyaları ekler.

## 0. Ortam değişkenleri

Güvenlik için mevcut `.env` dosyası arşive eklenmedi. Kendi projenizdeki `.env` dosyasını koruyun; yeni klasöre taşırken `.env.example` dosyasındaki değişkenleri kendi Supabase bilgilerinizle doldurun.

## 1. Supabase SQL

Supabase Dashboard → SQL Editor bölümünde, mevcut veritabanı şemanız ve `15_coupons_loyalty.sql` kurulumunuz tamamlandıktan sonra `sql/36_referral_campaigns.sql` dosyasının tamamını çalıştırın.

Bu migration:
- Kampanya tablosunu ve her kitle için ayrı, 10 karakterli referans kodlarını oluşturur.
- Kodların kampanya oluşturulduktan sonra değiştirilmesini engeller.
- Müşterinin referans kodunu hesabına bağlayan doğrulama RPC'lerini ekler.
- Sepet toplamı ve ürün bazlı referans indirimlerini sipariş oluşturulurken sunucu tarafında uygular.
- Müşteri profilinde ve kayıt ekranında anlaşmalı işletme listesini sunar.

## 2. Yönetim

`/admin/kuponlar` sayfasında **Referans Kampanyaları** bölümüne girin. Kampanya adı ve işletme adı boş bırakılabilir; sistem otomatik ad üretir. Personel ve müşteri kitleleri ayrı ayrı açılıp kapatılabilir. Her kitleye ayrı indirim yüzdesi, indirim kapsamı ve kod atanır.

Kodlar kaydedildikten sonra sabit kalır. Kampanyayı pasife almak kodu yeni kullanıma kapatır; tekrar aktif etmek yeniden kullanılmasını sağlar.

## 3. Müşteri akışı

- Kayıt ekranındaki referans alanı isteğe bağlıdır.
- Kayıt sırasında girilen kod, kullanıcı ilk kez oturum açıp profili oluşturulduğunda doğrulanıp hesaba bağlanır.
- Giriş yapan müşteri `/profil` → **Referans** bölümünden kod ekleyebilir veya kaldırabilir.
- Aktif referans kampanyası menüde (ürün kapsamı) ve sipariş özetinde görünür; sipariş oluşturulurken indirim veritabanında tekrar doğrulanıp uygulanır.
- Kampanya güncellemeleri açık sayfalarda en geç yaklaşık 30 saniyede yenilenir.

## 4. Önemli not

Bu migration, mevcut kupon/sadakat altyapısını silmez veya değiştirmez. Mevcut kuponlar ve puan kullanımı aynı şekilde devam eder. Referans kampanyası ayrıca uygulanır. SQL migration çalıştırılmadan yeni arayüz veritabanına bağlanamaz.
