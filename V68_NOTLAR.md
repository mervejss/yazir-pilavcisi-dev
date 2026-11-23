# v68 — Müşteriler: referans tanımlama + kalıcı filtreler
- sql/44_admin_referral_assign.sql (SQL Editor'de çalıştırın): yönetici üye müşteriye referans kodu tanımlar; kalıcıdır (müşteri değiştiremez/kaldıramaz). RPC: admin_set_customer_referral, admin_customer_referrals.
- Admin → Müşteriler → müşteri detayı → "🏷️ Referans kodu": kodu yazın/listeden seçin → Tanımla / Değiştir / Kaldır. Listede 🏷️ işletme rozeti görünür.
- Filtre işaretleri (tarayıcıda kalıcı): Üye, Telefon, İsimsizleri ayır. Biri seçiliyse yalnız o tür; ikisi de seçili/boşsa hepsi. "İsimsizleri ayır" açıkken adı boş/"İsimsiz" olanlar listenin altında ayrı bölümde.
- Not: referans yalnızca web hesabı olan müşteriye tanımlanır (telefon müşterisinin hesabı yok).
