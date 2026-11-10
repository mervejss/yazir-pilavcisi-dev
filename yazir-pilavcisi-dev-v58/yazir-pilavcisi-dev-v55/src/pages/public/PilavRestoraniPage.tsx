import { Link } from 'react-router-dom';
import Icon from '@/components/ui/Icon';
import { useMenu } from '@/hooks/useMenu';
import { useBusinessSettings } from '@/hooks/useBusinessSettings';
import { contactLinks } from '@/lib/contact';
import { categoryIcon } from '@/lib/categoryIcon';
import { FAQ, SITE_ADDRESS_FULL } from '@/lib/faq';
import { DAY_NAMES } from '@/lib/constants';
import { weekSchedule } from '@/lib/helpers';

/** GBP kategorisi "Pilav Restoranı" için özel iniş sayfası */
export default function PilavRestoraniPage() {
  const { categories, products } = useMenu();
  const { settings, hours, overrides, status } = useBusinessSettings();
  const { mapDirUrl, mapOpenUrl } = contactLinks(settings);
  const schedule = weekSchedule(hours, overrides);
  const phone = settings?.phone || '0540 331 41 42';

  return (
    <main className="page narrow seo-page">
      <nav className="crumbs" aria-label="Sayfa yolu">
        <Link to="/">Ana Sayfa</Link> <span aria-hidden="true">›</span> <span>Yazır Pilav Restoranı</span>
      </nav>

      <h1>Yazır Pilav Restoranı — Yazır Pilavcısı, Konya</h1>
      <p className="lead">
        Yazır Pilavcısı, Konya Selçuklu Yazır'da tane tane pilavı siparişe özel hazırlayan pilav restoranıdır. Tavuk pilav, et pilav, körili pilav ve kuru fasulye gibi
        çeşitleri restoranda yiyebilir ya da kendi kuryelerimizle kapınıza getirtebilirsiniz.
      </p>
      <div className="prow">
        <Link className="btn gold lg" to="/siparis"><Icon name="bag" size={19} /> Online sipariş ver</Link>
        <Link className="btn ghost lg" to="/menu"><Icon name="utensils" size={19} /> Menüyü gör</Link>
        <a className="btn ghost lg" href={`tel:${phone.replace(/\s/g, '')}`}><Icon name="phone" size={19} /> {phone}</a>
      </div>

      <h2>Yazır'da pilav nerede yenir?</h2>
      <p>
        Yazır mahallesinde pilav arayanlar için adresimiz: <b>{SITE_ADDRESS_FULL}</b> (Reyhan İş Merkezi arkası).
        Gelmeden önce <span className={status.open ? 'ok-txt' : 'err-txt'}>{status.label}</span> durumunu bu sayfadan görebilirsiniz.
        Yol tarifi için <a href={mapDirUrl} target="_blank" rel="noreferrer">Google Haritalar'da rota başlatın</a> ya da{' '}
        <a href={mapOpenUrl} target="_blank" rel="noreferrer">konumu haritada açın</a>.
      </p>

      {categories.length > 0 && (
        <>
          <h2>Pilav restoranı menüsü</h2>
          <p>Güncel fiyatlar ve ürün ayrıntıları için online menüyü kullanabilirsiniz.</p>
          <ul className="seo-cats">
            {categories.map((c) => (
              <li key={c.id}>
                <Link to="/menu">
                  <Icon name={categoryIcon(c.name)} size={20} /> <b>{c.name}</b>
                  <small>{products.filter((p) => p.category_id === c.id).length} ürün</small>
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}

      <h2>Paket servis ve gel-al</h2>
      <p>
        Online sipariş verdiğinizde pilavınız aracı olmadan, kendi kuryelerimizle sıcak sıcak gelir. Sipariş takip sayfasından kuryenin haritadaki konumunu, kalan mesafeyi ve tahmini
        varış süresini izleyebilirsiniz. Dilerseniz siparişinizi hazırlatıp restorandan kendiniz de alabilirsiniz. Cenaze, mevlit ve özel günler için{' '}
        <Link to="/toplu">toplu yemek siparişi</Link> de alıyoruz.
      </p>

      <h2>Çalışma saatleri</h2>
      <ul className="seo-hours">
        {schedule.map((r) => (
          <li key={r.dow}>
            <span>{DAY_NAMES[r.dow - 1]}</span>
            <b>{!r.eff || r.eff.is_closed ? 'Kapalı' : `${r.eff.open_time.slice(0, 5)} – ${r.eff.close_time.slice(0, 5)}`}</b>
          </li>
        ))}
      </ul>

      <h2>Sık sorulan sorular</h2>
      <div className="faq-list">
        {FAQ.map((f) => (
          <details key={f.q} className="faq-item">
            <summary><h3>{f.q}</h3></summary>
            <p>{f.a}</p>
          </details>
        ))}
      </div>

      <p className="muted small" style={{ marginTop: '1.5rem' }}>
        Ayrıca <Link to="/yorumlar">müşteri yorumlarını</Link>, <Link to="/kampanyalar">kampanyaları</Link> ve <Link to="/iletisim">iletişim bilgilerini</Link> inceleyebilirsiniz.
      </p>
    </main>
  );
}
