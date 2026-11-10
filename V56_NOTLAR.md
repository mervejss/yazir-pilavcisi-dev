# V56 Güncellemesi
- Hızlı Sipariş ve Masa Düzeni aynı `table_session_id` üzerinden hesaplanmaya devam eder.
- Aynı masa için birden fazla açık oturum oluşmasını engelleyen benzersiz indeks eklendi.
- Eski çift açık oturum varsa en yeni açık tutulur; diğerleri kapatılır ve sipariş toplamı korunur.
- Bildirim ekranına TÜM KANALLAR toplu aç/kapat, tüm personellere uygula ve 8 saat/24 saat/48 saat/1 hafta/1 ay/1 yıl süreli susturma seçenekleri eklendi.
- Süreli susturma kullanıcı bazlıdır; bir kullanıcının susturması diğer kullanıcıları etkilemez.

## Kurulum
`sql/39_table_session_sync_and_notification_bulk.sql` dosyasını Supabase SQL Editor'de bir kez çalıştırın.
