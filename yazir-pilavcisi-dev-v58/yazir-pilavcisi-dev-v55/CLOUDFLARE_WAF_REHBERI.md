# Cloudflare WAF ve bot koruması — panelden yapılacaklar (kodla yapılamaz)

Site Cloudflare'de olduğu için WAF **Cloudflare panelinde** açılır (alan adı → Security). Veritabanı (Supabase) ayrı bir servistir; orada ise aşağıdaki "Supabase" bölümü geçerli.

## Cloudflare (yazirpilavcisi.com.tr)
1. **SSL/TLS** → Full (strict); *Always Use HTTPS* açık; *HSTS* (kodda başlık zaten var).
2. **Security → WAF → Managed rules:** "Cloudflare Managed Ruleset" ve "OWASP Core" açık (varsayılan: Log yerine *Block*).
3. **Security → Bots:** *Bot Fight Mode* açık. Googlebot/Bingbot gibi doğrulanmış botlar otomatik izinlidir; SEO botları engellenmez.
4. **Rate limiting kuralı:** `/giris`, `/kayit`, `/personel-giris` yollarına 1 dakikada 20 istekten fazlası → 10 dk engelle.
5. **Özel kural (WAF → Custom rules):** `URI Path starts with /admin` ve ülke ≠ Türkiye → Managed Challenge (personel yurtdışındaysa bu kuralı kapatın).
6. **Scrape Shield:** e-posta gizleme açık olabilir.
7. **Cache:** `/assets/*` zaten 1 yıl önbellekli (public/_headers).

## Supabase (arka uç)
- **Authentication → Rate limits** ve **CAPTCHA (Turnstile)**: kayıt/giriş formlarında bot korumasını açın (Cloudflare Turnstile ücretsiz).
- Tüm tablolarda RLS açık ve işlemler `security definer` fonksiyonlarla (projede mevcut). `anon` anahtarı herkese açıktır; yetki RLS'tedir.
- **Settings → API → Network restrictions** yalnızca sunucudan erişiyorsanız anlamlıdır (tarayıcı uygulaması için kullanmayın).
- Hizmet anahtarını (service_role) asla istemci koduna koymayın.

## "Otobot gelip href okusun" (tarama botları)
Yapıldı: robots.txt, sitemap.xml, feed.xml, llms.txt, gerçek `<a href>` bağlantıları, JS'siz ilk HTML, canonical, şema verisi. Search Console ve Bing Webmaster'a sitemap'i gönderin.
