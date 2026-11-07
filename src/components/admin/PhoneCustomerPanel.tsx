import { useEffect, useRef, useState } from 'react';
import { tl } from '@/lib/helpers';
import {
  fmtPhone, loadCustomerHistory, normalizePhone, phoneKey, searchCustomers, type CustomerHistory, type FoundCustomer, type HistoryOrder,
} from '@/lib/staffCustomers';
import { ORDER_TYPE_LABELS } from '@/lib/constants';
import Icon from '@/components/ui/Icon';
import VoiceDictateButton from '@/components/ui/VoiceDictateButton';

export interface PickedAddress {
  address: string;
  district: string;
  lat: number | null;
  lng: number | null;
}

interface Props {
  name: string;
  phone: string;
  onName: (v: string) => void;
  onPhone: (v: string) => void;
  requirePhone: boolean;
  customerId: string | null;
  onCustomerId: (id: string | null) => void;
  /** Kayıtlı adres seçilince (paket servis) */
  onPickAddress?: (a: PickedAddress) => void;
  /** Geçmiş siparişi sepete aktar */
  onRepeat: (o: HistoryOrder) => void;
  showAddresses: boolean;
}

const dt = (s: string) => new Date(s).toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit' });

/** Telefonla gelen müşteri: telefon/isimle kayıtlı müşteriyi bul → adresleri ve geçmiş siparişleri göster → tek tıkla tekrarla */
export default function PhoneCustomerPanel({ name, phone, onName, onPhone, requirePhone, customerId, onCustomerId, onPickAddress, onRepeat, showAddresses }: Props) {
  const [results, setResults] = useState<FoundCustomer[]>([]);
  const [open, setOpen] = useState(false);
  const [missing, setMissing] = useState(false);
  const [hist, setHist] = useState<CustomerHistory | null>(null);
  const [histLoading, setHistLoading] = useState(false);
  const [all, setAll] = useState(false);
  const [searched, setSearched] = useState('');
  const skip = useRef(false);
  const lastField = useRef<'phone' | 'name'>('phone');

  const query = lastField.current === 'phone' ? phone : name;

  // Arama (telefon veya isim yazılırken)
  useEffect(() => {
    if (skip.current) {
      skip.current = false;
      return;
    }
    const t = query.trim();
    const digits = t.replace(/\D/g, '');
    const useQ = lastField.current === 'phone' ? (digits.length >= 4 ? digits : '') : t.length >= 2 ? t : '';
    if (!useQ) {
      setResults([]);
      setOpen(false);
      setSearched('');
      return;
    }
    const h = setTimeout(async () => {
      const r = await searchCustomers(useQ);
      setMissing(r.missing);
      setResults(r.list);
      setSearched(useQ);
      setOpen(r.list.length > 0 && !customerId);
      // Tam numara (10+ hane) ve tek eşleşme → kendiliğinden seç
      if (lastField.current === 'phone' && digits.length >= 10 && r.list.length === 1 && phoneKey(r.list[0].phone || '') === digits.slice(-10) && customerId !== r.list[0].id) {
        pick(r.list[0]);
      }
    }, 300);
    return () => clearTimeout(h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phone, name]);

  // Seçili müşterinin geçmişi
  useEffect(() => {
    if (!customerId) {
      setHist(null);
      return;
    }
    let off = false;
    setHistLoading(true);
    loadCustomerHistory(customerId).then((h) => {
      if (off) return;
      setHist(h);
      setHistLoading(false);
      setAll(false);
    });
    return () => {
      off = true;
    };
  }, [customerId]);

  // Telefon başka bir numaraya değiştirilirse seçili müşteriyi bırak
  useEffect(() => {
    if (customerId && hist?.customer?.phone && phone.replace(/\D/g, '').length >= 10 && phoneKey(phone) !== phoneKey(hist.customer.phone)) onCustomerId(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phone]);

  function pick(c: FoundCustomer) {
    skip.current = true;
    setOpen(false);
    setResults([]);
    onCustomerId(c.id);
    onName(c.full_name || '');
    if (c.phone) onPhone(c.phone);
    if (showAddresses && c.last_address?.address && onPickAddress) {
      onPickAddress({
        address: c.last_address.address || '',
        district: c.last_address.district || '',
        lat: c.last_address.lat != null ? Number(c.last_address.lat) : null,
        lng: c.last_address.lng != null ? Number(c.last_address.lng) : null,
      });
    }
  }

  const digits = phone.replace(/\D/g, '');
  const phoneBad = phone.trim() !== '' && !normalizePhone(phone) && digits.length >= 10;
  const isNew = !customerId && !!normalizePhone(phone) && searched !== '' && results.length === 0;
  const orders = hist?.orders || [];
  const shown = all ? orders : orders.slice(0, 3);

  return (
    <div className="pcp">
      <div className="two-col">
        <label className="fld">
          <span className="fld-row">
            Telefon {requirePhone ? <span className="req">*</span> : <span className="muted">(isteğe bağlı)</span>}
            <VoiceDictateButton
              value={phone}
              onChange={(v) => { lastField.current = 'phone'; onPhone(v); }}
              onFinalize={(spoken) => {
                const n = normalizePhone(spoken) || normalizePhone(phone);
                if (n) { lastField.current = 'phone'; onPhone(n); }
              }}
              title="Telefon numarasını sesle yazdır"
            />
          </span>
          <input
            inputMode="tel"
            value={phone}
            onChange={(e) => {
              lastField.current = 'phone';
              onPhone(e.target.value);
            }}
            onFocus={() => results.length && setOpen(true)}
            placeholder="05xx xxx xx xx — kayıtlı müşteri otomatik bulunur veya 🎙️ ile söyleyin"
            autoComplete="off"
          />
          {phoneBad && <small className="err-txt">Telefon 11 haneli olmalı (05xx…)</small>}
        </label>
        <label className="fld">
          <span className="fld-row">
            Müşteri adı <span className="muted">(isteğe bağlı)</span>
            <VoiceDictateButton value={name} onChange={(v) => { lastField.current = 'name'; onName(v); }} title="Müşteri adını sesle yazdır" />
          </span>
          <input
            value={name}
            onChange={(e) => {
              lastField.current = 'name';
              onName(e.target.value);
            }}
            onFocus={() => results.length && setOpen(true)}
            placeholder="Ad soyad — yazarak da arayabilirsiniz veya 🎙️ ile söyleyin"
            autoComplete="off"
          />
        </label>
      </div>

      {open && results.length > 0 && (
        <ul className="pcp-results">
          {results.map((c) => (
            <li key={c.id}>
              <button type="button" onClick={() => pick(c)}>
                <span className="pcp-r-main">
                  <b>{c.full_name || 'İsimsiz'}</b>
                  <span className="muted"> · {fmtPhone(c.phone) || 'telefon yok'}</span>
                  {!c.has_account && <span className="chip">telefon müşterisi</span>}
                </span>
                <small className="muted">
                  {c.order_count} sipariş{c.last_order_at ? ` · son: ${dt(c.last_order_at)}` : ''}
                  {c.last_address?.address ? ` · ${c.last_address.address}` : ''}
                </small>
              </button>
            </li>
          ))}
        </ul>
      )}

      {missing && <div className="note small">Müşteri arama için <code>sql/25_phone_customers_maps.sql</code> dosyasını Supabase SQL Editor'de çalıştırın.</div>}
      {isNew && <p className="small pcp-new"><Icon name="plus" size={13} /> Yeni müşteri — sipariş kaydedilince otomatik müşteri olarak eklenir (yalnızca yöneticiler görür).</p>}

      {customerId && (
        <div className="pcp-card">
          <div className="pcp-head">
            <span>
              <Icon name="user" size={15} /> <b>{hist?.customer?.full_name || name || 'Kayıtlı müşteri'}</b>
              {hist?.customer && !hist.customer.has_account && <span className="chip">telefon müşterisi</span>}
              {hist?.customer?.has_account && <span className="chip">üye</span>}
            </span>
            <button type="button" className="linklike small" onClick={() => onCustomerId(null)}>Seçimi kaldır</button>
          </div>
          {hist?.customer?.notes && <div className="note small">📝 {hist.customer.notes}</div>}

          {histLoading && <p className="small muted">Geçmiş yükleniyor…</p>}

          {showAddresses && (hist?.addresses?.length || 0) > 0 && onPickAddress && (
            <div className="pcp-addrs">
              <small className="muted">Kayıtlı adresler</small>
              <div className="pcp-chips">
                {hist!.addresses.map((a) => (
                  <button
                    key={a.id}
                    type="button"
                    className="pcp-chip"
                    onClick={() => onPickAddress({ address: a.address, district: a.district || '', lat: a.lat != null ? Number(a.lat) : null, lng: a.lng != null ? Number(a.lng) : null })}
                  >
                    <Icon name="mapPin" size={13} /> <b>{a.title}</b> <span>{a.address}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {orders.length > 0 && (
            <div className="pcp-orders">
              <small className="muted">Geçmiş siparişler</small>
              {shown.map((o) => (
                <div key={o.id} className="pcp-order">
                  <div className="pcp-o-info">
                    <b>#{o.order_no}</b> <span className="muted small">{dt(o.created_at)} · {ORDER_TYPE_LABELS[o.order_type] || o.order_type}</span>
                    <div className="small">{o.items.map((i) => `${i.quantity}× ${i.product_name}${i.variant_name ? ` (${i.variant_name})` : ''}`).join(', ')}</div>
                    {o.address && <div className="small muted">📍 {o.address}</div>}
                  </div>
                  <div className="pcp-o-act">
                    <b>{tl(Number(o.total))}</b>
                    <button type="button" className="btn gold sm" onClick={() => onRepeat(o)}>🔁 Tekrarla</button>
                  </div>
                </div>
              ))}
              {orders.length > 3 && (
                <button type="button" className="linklike small" onClick={() => setAll((v) => !v)}>{all ? 'Daha az göster' : `Tüm geçmişi göster (${orders.length})`}</button>
              )}
            </div>
          )}
          {!histLoading && orders.length === 0 && <p className="small muted">Bu müşterinin geçmiş siparişi yok.</p>}
        </div>
      )}
    </div>
  );
}
