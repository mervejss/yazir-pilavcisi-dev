import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { DAY_NAMES } from '@/lib/constants';
import { FAQ } from '@/lib/faq';
import type { BusinessSettings, OpeningHour } from '@/types/database';

export const SITE_URL = 'https://yazirpilavcisi.com.tr';
const OG_IMAGE = `${SITE_URL}/logo.png`;

const PAGES: Record<string, { title: string; desc: string; noindex?: boolean }> = {
  '/': { title: 'Yazır Pilavcısı | Pilav Restoranı Yazır, Konya', desc: "Yazır Pilavcısı, Konya Yazır'da pilav restoranı: tavuk, et ve körili pilav. Şht. Erkan Özbalcı Sk. No:20/b Selçuklu. Online sipariş, kendi kuryelerimizle 15 dakikada kapınızda." },
  '/pilav-restorani': { title: 'Yazır Pilav Restoranı | Yazır Pilavcısı Konya', desc: "Yazır'da pilav restoranı arıyorsanız: Yazır Pilavcısı, Şht. Erkan Özbalcı Sk. No:20/b Selçuklu/Konya. Menü, çalışma saatleri, paket servis ve yol tarifi." },
  '/menu': { title: 'Menü ve Fiyatlar | Yazır Pilavcısı Pilav Restoranı', desc: 'Yazır Pilavcısı menüsü: tavuk pilav, et pilav, körili pilav, kuru fasulye ve içecekler. Güncel fiyatları görün, Yazır Konya için hemen online sipariş verin.' },
  '/siparis': { title: 'Online Pilav Siparişi Ver | Yazır Pilavcısı', desc: "Yazır Pilavcısı'ndan online paket servis veya gel-al pilav siparişi verin. Kapıda nakit, kart ya da IBAN ile ödeme; canlı kurye takibi." },
  '/kampanyalar': { title: 'Kampanyalar ve Kupon Kodları | Yazır Pilavcısı', desc: 'Yazır Pilavcısı güncel kampanyalar ve indirim kuponları. Pilav siparişlerinizde kupon kodunuzu kullanın.' },
  '/toplu': { title: 'Toplu Yemek Siparişi: Cenaze, Mevlit, Özel Gün | Yazır Pilavcısı', desc: "Konya'da cenaze, mevlit, düğün ve iş yeri yemekleri için toplu pilav siparişi. Kişi sayısını yazın, Yazır Pilavcısı sizi arasın." },
  '/galeri': { title: 'Galeri | Yazır Pilavcısı Pilav Restoranı', desc: 'Yazır Pilavcısı restoranından ve yemeklerinden fotoğraflar.' },
  '/yorumlar': { title: 'Müşteri Yorumları | Yazır Pilavcısı Konya', desc: 'Yazır Pilavcısı müşterilerinin Google ve site yorumları, puanlar ve deneyimler.' },
  '/iletisim': { title: 'İletişim, Adres ve Çalışma Saatleri | Yazır Pilavcısı Konya', desc: 'Yazır Pilavcısı adres, telefon (0540 331 41 42), WhatsApp, çalışma saatleri ve yol tarifi. Yazır, Şht. Erkan Özbalcı Sk. No:20/b, 42310 Selçuklu/Konya.' },
  '/giris': { title: 'Giriş Yap | Yazır Pilavcısı', desc: 'Hesabınıza giriş yapın.', noindex: true },
  '/kayit': { title: 'Kayıt Ol | Yazır Pilavcısı', desc: 'Yeni hesap oluşturun.', noindex: true },
  '/profil': { title: 'Profilim | Yazır Pilavcısı', desc: 'Hesabım.', noindex: true },
  '/personel-giris': { title: 'Personel Girişi', desc: 'Personel girişi.', noindex: true },
  '/kurye': { title: 'Kurye', desc: 'Kurye uygulaması.', noindex: true },
};

function setMeta(sel: string, attr: 'name' | 'property', key: string, value: string) {
  let el = document.head.querySelector<HTMLMetaElement>(sel);
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.setAttribute('content', value);
}

/** Sayfa başına title / description / canonical / OG + Restaurant JSON-LD */
export default function Seo({ settings, hours }: { settings: BusinessSettings | null; hours: OpeningHour[] }) {
  const { pathname } = useLocation();

  useEffect(() => {
    const key = pathname.replace(/\/+$/, '') || '/';
    const base = '/' + key.split('/')[1];
    const page = PAGES[key] || PAGES[base === '/' ? '/' : base] || (key.startsWith('/takip') || key.startsWith('/qr') || key.startsWith('/admin') ? { title: 'Sipariş Takibi | Yazır Pilavcısı', desc: 'Siparişinizi takip edin.', noindex: true } : PAGES['/']);
    const url = SITE_URL + (key === '/' ? '/' : key);
    document.title = page.title;
    setMeta('meta[name="description"]', 'name', 'description', page.desc);
    setMeta('meta[name="robots"]', 'name', 'robots', page.noindex ? 'noindex,nofollow' : 'index,follow,max-image-preview:large');
    setMeta('meta[property="og:title"]', 'property', 'og:title', page.title);
    setMeta('meta[property="og:description"]', 'property', 'og:description', page.desc);
    setMeta('meta[property="og:url"]', 'property', 'og:url', url);
    setMeta('meta[property="og:image"]', 'property', 'og:image', OG_IMAGE);
    setMeta('meta[name="twitter:title"]', 'name', 'twitter:title', page.title);
    setMeta('meta[name="twitter:description"]', 'name', 'twitter:description', page.desc);
    let link = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (!link) {
      link = document.createElement('link');
      link.rel = 'canonical';
      document.head.appendChild(link);
    }
    link.href = url;
  }, [pathname]);

  useEffect(() => {
    if (!settings) return;
    const specs = hours
      .filter((h) => !h.is_closed)
      .map((h) => ({
        '@type': 'OpeningHoursSpecification',
        dayOfWeek: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'][h.day_of_week - 1] || DAY_NAMES[h.day_of_week - 1],
        opens: h.open_time.slice(0, 5),
        closes: h.close_time.slice(0, 5),
      }));
    const tel = (settings.phone || '0540 331 41 42').replace(/\s/g, '').replace(/^0/, '+90');
    const data: Record<string, unknown> = {
      '@context': 'https://schema.org',
      '@type': 'Restaurant',
      '@id': SITE_URL + '/#restaurant',
      name: settings.name || 'Yazır Pilavcısı',
      url: SITE_URL + '/',
      image: OG_IMAGE,
      logo: OG_IMAGE,
      telephone: tel,
      servesCuisine: ['Pilav', 'Türk mutfağı'],
      areaServed: ['Yazır', 'Selçuklu', 'Konya'],
      potentialAction: { '@type': 'OrderAction', target: { '@type': 'EntryPoint', urlTemplate: SITE_URL + '/siparis', actionPlatform: ['http://schema.org/DesktopWebPlatform', 'http://schema.org/MobileWebPlatform'] }, deliveryMethod: ['http://purl.org/goodrelations/v1#DeliveryModeOwnFleet', 'http://purl.org/goodrelations/v1#DeliveryModePickUp'] },
      priceRange: '₺₺',
      hasMenu: SITE_URL + '/menu',
      acceptsReservations: false,
      address: { '@type': 'PostalAddress', streetAddress: 'Yazır, Şht. Erkan Özbalcı Sk. No:20/b', addressLocality: 'Selçuklu', addressRegion: 'Konya', postalCode: '42310', addressCountry: 'TR' },
      sameAs: [settings.instagram_url, settings.google_maps_url].filter(Boolean),
    };
    if (settings.lat && settings.lng) data.geo = { '@type': 'GeoCoordinates', latitude: Number(settings.lat), longitude: Number(settings.lng) };
    if (specs.length) data.openingHoursSpecification = specs;
    let el = document.getElementById('ld-restaurant') as HTMLScriptElement | null;
    if (!el) {
      el = document.createElement('script');
      el.id = 'ld-restaurant';
      el.type = 'application/ld+json';
      document.head.appendChild(el);
    }
    el.textContent = JSON.stringify(data);
  }, [settings, hours]);

  // SSS (FAQPage) yalnızca ana sayfa ve pilav restoranı sayfasında
  useEffect(() => {
    const id = 'ld-faq';
    const old = document.getElementById(id);
    const key = pathname.replace(/\/+$/, '') || '/';
    if (key !== '/' && key !== '/pilav-restorani') {
      old?.remove();
      return;
    }
    const el = (old as HTMLScriptElement | null) || document.createElement('script');
    el.id = id;
    el.type = 'application/ld+json';
    el.textContent = JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: FAQ.map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })),
    });
    if (!old) document.head.appendChild(el);
  }, [pathname]);

  return null;
}
