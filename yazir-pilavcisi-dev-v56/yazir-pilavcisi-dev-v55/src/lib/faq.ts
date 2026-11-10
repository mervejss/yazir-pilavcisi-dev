export const SITE_ADDRESS_FULL = 'Yazır, Şht. Erkan Özbalcı Sk. No:20/b, 42310 Selçuklu/Konya';

/** Sık sorulan sorular — sayfada görünür + FAQPage yapılandırılmış verisi olarak kullanılır */
export const FAQ: Array<{ q: string; a: string }> = [
  {
    q: 'Yazır Pilavcısı nerede, nasıl ulaşırım?',
    a: `Yazır Pilavcısı, Konya Selçuklu Yazır mahallesinde, ${SITE_ADDRESS_FULL} adresindedir (Reyhan İş Merkezi arkası). Sayfanın altındaki haritadan "Yol tarifi al" düğmesiyle Google Haritalar'da doğrudan rota başlatabilirsiniz.`,
  },
  {
    q: 'Çalışma saatleriniz nedir, gece geç saate kadar açık mısınız?',
    a: "Geç saatlere kadar, genellikle gece 03:00'e kadar hizmet veriyoruz. Güncel ve özel gün saatleri her zaman sayfanın altındaki Çalışma Saatleri bölümünde ve iletişim sayfasında yayınlanır.",
  },
  {
    q: 'Online sipariş nasıl veriyorum?',
    a: "Menüden pilav ve içeceğinizi seçip sepete ekleyin, adresinizi yazın veya haritada konumunuzu işaretleyin, ödeme yönteminizi seçin ve siparişi onaylayın. Üye olmadan da sipariş verebilirsiniz. Siparişinizin durumunu takip bağlantısından canlı izlersiniz.",
  },
  {
    q: 'Paket servis ne kadar sürede gelir?',
    a: 'Siparişler kendi kuryelerimizle sıcak sıcak getirilir; ortalama teslimat süresi 15–25 dakikadır, yoğunluğa göre değişebilir. Sipariş takip sayfasında kuryenin haritadaki konumunu, kalan mesafeyi ve tahmini varış süresini görebilirsiniz.',
  },
  {
    q: 'Hangi ödeme yöntemlerini kabul ediyorsunuz?',
    a: 'Kapıda nakit, kapıda kredi/banka kartı ve IBAN / havale ile ödeme yapabilirsiniz.',
  },
  {
    q: 'WhatsApp üzerinden sipariş verebilir veya soru sorabilir miyim?',
    a: "Evet. Sitedeki yeşil WhatsApp düğmesine dokunarak hazır mesajlarla (şu an açık mısınız, menüyü alabilir miyim, kaç dakikada gelir vb.) 0540 331 41 42 numaralı WhatsApp hattımıza hızlıca yazabilirsiniz.",
  },
  {
    q: 'Cenaze, mevlit ve özel günler için toplu yemek yapıyor musunuz?',
    a: 'Evet. Kişi sayısını ve teslim saatini toplu sipariş formundan iletin, sizi arayıp fiyatı ve teslimatı netleştirelim.',
  },
];
