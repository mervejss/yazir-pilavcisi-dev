import { useState } from 'react';
import { shortKey, longKey, type DateRange } from '@/lib/analyticsData';
import {
  GROUP_LABELS, fmtDay, money2, signed,
  type FinResult, type FinSettings, type OrderFin, type PaymentRecon,
} from '@/lib/finance';
import { Card, DataTable, Grid, KpiCard, TrendChart, fmtMoney, fmtNum1, type Col } from '@/components/analytics/pro/Kit';

const GREEN = '#16a34a', RED = '#dc2626';

// ---------------------------------------------------------------------------
// Şelale: brüt satıştan net kâra
// ---------------------------------------------------------------------------
interface WfRow { label: string; value: number; total?: boolean; hint?: string }

function Waterfall({ rows }: { rows: WfRow[] }) {
  const max = Math.max(1, ...rows.map((r) => Math.abs(r.value)));
  return (
    <div className="fin-wf">
      {rows.map((r, i) => (
        <div key={i} className={`fin-wf-row${r.total ? ' total' : ''}`}>
          <span className="fin-wf-l">{r.label}{r.hint && <small>{r.hint}</small>}</span>
          <span className="fin-wf-bar"><i className={r.value >= 0 ? 'pos' : 'neg'} style={{ width: `${r.value ? Math.max(2, (Math.abs(r.value) / max) * 100) : 0}%` }} /></span>
          <b className={`fin-wf-v ${r.value >= 0 ? 'pos' : 'neg'}`}>{r.total ? money2(r.value) : signed(r.value)}</b>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// 1) Özet
// ---------------------------------------------------------------------------
export function SummaryTab({ r, settings }: { r: FinResult; settings: FinSettings; range: DateRange }) {
  const d = r.deductions, c = r.cost;
  const rows: WfRow[] = [
    { label: GROUP_LABELS.sale, value: r.gross.sale, hint: 'Müşterinin ödediği ürün tutarı (KDV dahil)' },
    { label: GROUP_LABELS.delivery, value: r.gross.delivery },
    { label: GROUP_LABELS.return, value: r.gross.return },
    { label: GROUP_LABELS.discount, value: r.gross.discount, hint: 'Sizin karşıladığınız indirim ve kuponlar' },
    { label: GROUP_LABELS.tyPromo, value: r.gross.tyPromo, hint: 'Trendyol karşılar; ay sonunda kestiğiniz faturayla size ödenir' },
    { label: 'Provizyon ve düzeltmeler', value: r.gross.provision + r.gross.adjust },
    { label: 'Trendyol komisyonu', value: -r.rawCommission, hint: `KDV dahil · ort. %${fmtNum1(r.avgCommissionPct, 1)} · içindeki KDV ${money2(r.vat.commission)}` },
    { label: 'Mutabakat farkı', value: r.recon, hint: 'Trendyol’un hakedişi ile türlere göre toplamın farkı (yuvarlama / özel kayıtlar)' },
    { label: 'HAKEDİŞ (Trendyol hesabı)', value: r.payout, total: true },
    { label: 'E-ticaret stopajı', value: -d.stoppage, hint: 'Yıl sonu vergiden mahsup edilir' },
    { label: 'Platform hizmet bedeli', value: -d.platformFee },
    { label: 'Trendyol hizmet faturaları', value: -d.invoices },
    { label: 'Komisyon mutabakat / iade faturası / düzeltme', value: -(d.agreement + d.other) },
    { label: 'HESABIMA GEÇECEK', value: r.cashAfter, total: true },
    { label: 'Ürün / hammadde maliyeti', value: -c.food, hint: `net ürün satışının %${settings.foodCostPct}'i` },
    { label: 'Ambalaj + kurye + diğer gider', value: -(c.packaging + c.courier + c.other) },
    { label: 'Stopaj geri (vergiden mahsup)', value: d.stoppage, hint: 'Gider değil; yukarıda nakitten düşülmüştü' },
    { label: 'NET KÂR', value: r.netProfit, total: true },
    { label: 'KDV’ye ayrılması gereken (tahmini)', value: -Math.max(r.vat.payable, 0), hint: `satış KDV ${money2(r.vat.sales)} − indirilecek KDV ${money2(r.vat.commission + r.vat.fees + r.vat.cost)}` },
    { label: 'KDV SONRASI NET KÂR', value: r.netProfitExVat, total: true },
  ];

  return (
    <>
      <div className="anp-kpis">
        <KpiCard icon="💰" label="Müşteri satışı" value={money2(r.gross.sale + r.gross.delivery)} color="#d4af37" sub={`${r.orders.toLocaleString('tr-TR')} sipariş`} />
        <KpiCard icon="💸" label="Trendyol komisyonu" value={money2(r.rawCommission)} color={RED} sub={`ort. %${fmtNum1(r.avgCommissionPct, 1)} · içinde KDV ${money2(r.vat.commission)}`} />
        <KpiCard icon="↩️" label="İade + indirim" value={money2(-(r.gross.return + r.gross.discount))} color="#f27a1a" sub="iade, kısmi iade, satıcı indirim/kupon" />
        <KpiCard icon="🏦" label="Hakediş" value={money2(r.payout)} color="#0ea5e9" sub="komisyon düşülmüş, Trendyol hesabı" />
        <KpiCard icon="🧾" label="Diğer kesintiler" value={money2(r.deductions.total)} color="#a16207" sub="stopaj, hizmet bedeli, faturalar" />
        <KpiCard icon="✅" label="Hesabıma geçecek" value={money2(r.cashAfter)} color="#14b8a6" sub="hakediş − kesintiler" />
        <KpiCard icon="🍽️" label="Maliyet" value={money2(r.cost.total)} color="#7c4dff" sub={`ürün %${settings.foodCostPct} + ambalaj/kurye/diğer`} />
        <KpiCard icon="📈" label="NET KÂR" value={money2(r.netProfit)} color={r.netProfit >= 0 ? GREEN : RED} sub={`marj %${fmtNum1(r.marginPct, 1)} · KDV sonrası ${money2(r.netProfitExVat)}`} />
      </div>

      <Grid cols={2}>
        <Card title="Brüt satıştan net kâra" sub="Her kesinti kalem kalem: komisyon, iade, indirim, stopaj, hizmet bedeli, maliyet, KDV">
          <Waterfall rows={rows} />
        </Card>
        <div className="anp-grid c1">
          <Card title="Günlük hakediş ve net kâr" sub="İşlem tarihine göre (iş günü 03:00)">
            <TrendChart
              labels={r.byDay.map((x) => shortKey(x.key))} longLabels={r.byDay.map((x) => longKey(x.key))} format={fmtMoney} type="area" height={250}
              series={[
                { name: 'Hakediş', color: '#0ea5e9', values: r.byDay.map((x) => Math.max(x.payout, 0)) },
                { name: 'Net kâr (kesinti öncesi)', color: GREEN, values: r.byDay.map((x) => Math.max(x.profit, 0)), fill: false },
                { name: 'Komisyon', color: RED, values: r.byDay.map((x) => Math.max(x.commission, 0)), fill: false, dashed: true },
              ]}
            />
          </Card>
          <Card title="KDV özeti (tahmini)" sub="Mali müşavirinizle teyit edin; oranları “Maliyet & KDV” sekmesinden değiştirebilirsiniz">
            <div className="fin-kv">
              <span>Hesaplanan KDV (satış %{settings.salesVatPct})</span><b>{money2(r.vat.sales)}</b>
              <span>İndirilecek KDV — komisyon (%{settings.commissionVatPct})</span><b>{money2(r.vat.commission)}</b>
              <span>İndirilecek KDV — hizmet faturaları</span><b>{money2(r.vat.fees)}</b>
              {settings.costVatPct > 0 && <><span>İndirilecek KDV — maliyet (%{settings.costVatPct})</span><b>{money2(r.vat.cost)}</b></>}
              <span className="strong">Ödenecek / (devreden) KDV</span><b className={r.vat.payable >= 0 ? 'neg' : 'pos'}>{money2(r.vat.payable)}</b>
            </div>
          </Card>
        </div>
      </Grid>
    </>
  );
}

// ---------------------------------------------------------------------------
// 2) Sipariş bazında
// ---------------------------------------------------------------------------
export function OrdersTab({ orders }: { orders: OrderFin[] }) {
  const cols: Col<OrderFin>[] = [
    { key: 'no', label: 'Sipariş no', value: (o) => o.orderNumber, render: (o) => <b>{o.orderNumber}</b> },
    { key: 'dt', label: 'Tarih', value: (o) => o.date || 0, render: (o) => fmtDay(o.date) },
    { key: 'sales', label: 'Satış', align: 'right', value: (o) => o.sales, render: (o) => money2(o.sales) },
    { key: 'del', label: 'Teslimat', align: 'right', value: (o) => o.delivery, render: (o) => (o.delivery ? money2(o.delivery) : '—') },
    { key: 'ret', label: 'İade', align: 'right', value: (o) => o.returns, render: (o) => (o.returns ? <span className="anp-bad">{money2(o.returns)}</span> : '—') },
    { key: 'dis', label: 'İndirim', align: 'right', value: (o) => o.discounts, render: (o) => (o.discounts ? money2(o.discounts) : '—') },
    { key: 'com', label: 'Komisyon', align: 'right', value: (o) => o.commission, render: (o) => money2(o.commission) },
    { key: 'pct', label: 'Kom. %', align: 'right', value: (o) => (o.sales + o.delivery > 0 ? (o.commission / (o.sales + o.delivery)) * 100 : 0), render: (o) => `%${fmtNum1(o.sales + o.delivery > 0 ? (o.commission / (o.sales + o.delivery)) * 100 : 0, 1)}` },
    { key: 'pay', label: 'Hakediş', align: 'right', value: (o) => o.payout, render: (o) => <b>{money2(o.payout)}</b> },
    { key: 'cost', label: 'Maliyet', align: 'right', value: (o) => o.cost, render: (o) => money2(o.cost) },
    { key: 'profit', label: 'Kâr', align: 'right', value: (o) => o.profit, render: (o) => <b className={o.profit >= 0 ? 'anp-ok' : 'anp-bad'}>{money2(o.profit)}</b> },
    { key: 'po', label: 'Ödeme no', value: (o) => o.paymentOrderId ?? '', render: (o) => o.paymentOrderId ?? <span className="muted">bekliyor</span> },
  ];
  return (
    <Card title={`Sipariş bazında kesintiler (${orders.length.toLocaleString('tr-TR')})`}
      sub="Sipariş başına kâr = hakediş − maliyet. Stopaj ve hizmet faturaları siparişe dağıtılmaz (Özet’te görünür)."
    >
      <DataTable rows={orders} cols={cols} pageSize={15} csvName="trendyol-siparis-finans" rowKey={(o) => o.key} initialSort={{ key: 'dt', dir: 'desc' }} empty="Bu aralıkta finans kaydı yok." />
    </Card>
  );
}

// ---------------------------------------------------------------------------
// 3) Ödemeler / mutabakat
// ---------------------------------------------------------------------------
export function PaymentsTab({ recon, onRefresh }: { recon: PaymentRecon[]; onRefresh: (id: number) => Promise<void> }) {
  const [busy, setBusy] = useState<number | null>(null);
  const cols: Col<PaymentRecon>[] = [
    { key: 'id', label: 'Ödeme emri', value: (p) => p.id, render: (p) => <b>#{p.id}</b> },
    { key: 'dt', label: 'Ödeme günü', value: (p) => p.payoutDate || 0, render: (p) => fmtDay(p.payoutDate) },
    { key: 'paid', label: 'Trendyol’un ödediği', align: 'right', value: (p) => p.paid, render: (p) => <b>{money2(p.paid)}</b> },
    { key: 'pay', label: 'Hesaplanan hakediş', align: 'right', value: (p) => p.calcPayout, render: (p) => money2(p.calcPayout) },
    { key: 'ded', label: 'Kesintiler', align: 'right', value: (p) => p.calcDeductions, render: (p) => money2(p.calcDeductions) },
    { key: 'calc', label: 'Hesaplanan net', align: 'right', value: (p) => p.calc, render: (p) => money2(p.calc) },
    { key: 'diff', label: 'Fark', align: 'right', value: (p) => p.diff, render: (p) => (p.lines === 0 ? <span className="muted">kayıt yok</span> : <b className={Math.abs(p.diff) < 1 ? 'anp-ok' : 'anp-warn'}>{signed(p.diff)}</b>) },
    { key: 'n', label: 'Kayıt', align: 'right', value: (p) => p.lines },
    { key: 'act', label: '', value: () => '', render: (p) => (
      <button type="button" className="anp-mini" disabled={busy === p.id} onClick={async (e) => { e.stopPropagation(); setBusy(p.id); await onRefresh(p.id); setBusy(null); }}>
        {busy === p.id ? '…' : '🔄 Yenile'}
      </button>
    ) },
  ];
  return (
    <Card title="Haftalık ödemeler ve mutabakat" sub="Trendyol her çarşamba vadesi gelen siparişler için ödeme emri oluşturur. Fark ≈ 0 ise hesabımız Trendyol ile birebir tutuyor demektir. Ödeme emri oluştuktan sonra kayıtların güncellenmesi zaman alabilir; bir sonraki gün “Yenile” yapın.">
      <DataTable rows={recon} cols={cols} pageSize={12} csvName="trendyol-odeme-mutabakat" rowKey={(p) => String(p.id)} initialSort={{ key: 'dt', dir: 'desc' }} empty="Ödeme emri yok. Üstteki “Trendyol’dan çek” ile senkronlayın." />
    </Card>
  );
}

// ---------------------------------------------------------------------------
// 4) Kesinti dökümü (şeffaflık)
// ---------------------------------------------------------------------------
export function BreakdownTab({ r }: { r: FinResult }) {
  return (
    <Grid cols={2}>
      <Card title="Hareket türüne göre döküm (settlements)" sub="Komisyon / hakediş sütunları işaretli: + hesabınıza ekler, − düşer">
        <DataTable rows={r.byType} rowKey={(t) => t.type} pageSize={30} csvName="trendyol-hareket-turleri" empty="Kayıt yok." cols={[
          { key: 'l', label: 'Tür', value: (t) => t.label, render: (t) => <b>{t.label}</b> },
          { key: 'n', label: 'Adet', align: 'right', value: (t) => t.count },
          { key: 'cr', label: 'Alacak', align: 'right', value: (t) => t.credit, render: (t) => money2(t.credit) },
          { key: 'db', label: 'Borç', align: 'right', value: (t) => t.debt, render: (t) => money2(t.debt) },
          { key: 'cm', label: 'Komisyon maliyeti', align: 'right', value: (t) => t.commission, render: (t) => signed(t.commission) },
          { key: 'po', label: 'Hakediş etkisi', align: 'right', value: (t) => t.payout, render: (t) => <b className={t.payout >= 0 ? 'anp-ok' : 'anp-bad'}>{signed(t.payout)}</b> },
        ]} />
      </Card>
      <Card title="Diğer finansal kayıtlar (otherfinancials)" sub="Kesinti türleri hesabımdan düşer; hareketler (ödeme, virman, avans) kâr hesabına girmez">
        <DataTable rows={r.otherByType} rowKey={(t) => t.type} pageSize={30} csvName="trendyol-diger-finansal" empty="Kayıt yok." cols={[
          { key: 'l', label: 'Tür', value: (t) => t.label, render: (t) => <b>{t.label}</b> },
          { key: 'k', label: 'Sınıf', value: (t) => t.kind, render: (t) => (t.kind === 'kesinti' ? <span className="anp-bad">kesinti</span> : <span className="muted">hareket</span>) },
          { key: 'n', label: 'Adet', align: 'right', value: (t) => t.count },
          { key: 'db', label: 'Borç', align: 'right', value: (t) => t.debt, render: (t) => money2(t.debt) },
          { key: 'cr', label: 'Alacak', align: 'right', value: (t) => t.credit, render: (t) => money2(t.credit) },
          { key: 'net', label: 'Net etki', align: 'right', value: (t) => t.net, render: (t) => signed(t.net) },
        ]} />
      </Card>
    </Grid>
  );
}

// ---------------------------------------------------------------------------
// 5) Maliyet & KDV ayarları
// ---------------------------------------------------------------------------
export function CostTab({ settings, onSave }: { settings: FinSettings; onSave: (s: FinSettings) => Promise<string | null> }) {
  const [f, setF] = useState<FinSettings>(settings);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const set = (k: keyof FinSettings, v: string) => { setF((x) => ({ ...x, [k]: Math.max(0, Number(v.replace(',', '.')) || 0) })); setMsg(null); };
  const Field = ({ k, label, help, suffix }: { k: keyof FinSettings; label: string; help: string; suffix: string }) => (
    <label className="fin-field">
      <b>{label}</b>
      <span className="fin-input"><input type="number" step="0.01" min={0} value={f[k]} onChange={(e) => set(k, e.target.value)} /><em>{suffix}</em></span>
      <small>{help}</small>
    </label>
  );
  return (
    <Card title="Maliyet ve KDV ayarları" sub="Net kâr bu ayarlarla hesaplanır. Kaydedince tüm raporlara anında yansır.">
      <div className="fin-form">
        <Field k="foodCostPct" label="Ürün / hammadde maliyeti" suffix="%" help="Net ürün satışının yüzde kaçı. Reçete maliyetinizden hesaplayın (varsayılan 35)." />
        <Field k="packagingPerOrder" label="Ambalaj (sipariş başı)" suffix="₺" help="Kutu, poşet, peçete, sos vb. ortalama sipariş başı tutar." />
        <Field k="courierPerOrder" label="Kendi kurye / dağıtım (sipariş başı)" suffix="₺" help="Trendyol kuryesi kullanıyorsanız 0 bırakın." />
        <Field k="otherCostPct" label="Diğer değişken gider" suffix="%" help="İşçilik, gaz/elektrik gibi satışla orantılı paylar (isteğe bağlı)." />
        <Field k="salesVatPct" label="Satış KDV oranı" suffix="%" help="Restoran hizmeti oranı. Güncel oranı mali müşavirinizle doğrulayın." />
        <Field k="commissionVatPct" label="Komisyon / hizmet faturası KDV" suffix="%" help="Trendyol’un kestiği komisyon ve hizmet faturalarındaki KDV (genelde %20)." />
        <Field k="costVatPct" label="Maliyet girdi KDV (isteğe bağlı)" suffix="%" help="Maliyetlerinizi KDV dahil giriyorsanız ortalama oranı yazın; 0 = indirimi hesaba katma." />
      </div>
      <div className="fin-actions">
        <button type="button" className="anp-btn gold" disabled={busy} onClick={async () => { setBusy(true); const e = await onSave(f); setBusy(false); setMsg(e ? `Kaydedilemedi: ${e}` : 'Kaydedildi ✓'); }}>
          {busy ? 'Kaydediliyor…' : '💾 Kaydet'}
        </button>
        {msg && <span className={msg.startsWith('Kaydedilemedi') ? 'anp-bad' : 'anp-ok'}>{msg}</span>}
      </div>
      <p className="anp-hint">Not: Stopaj nakitten düşer ama gider sayılmaz (yıl sonunda vergiden mahsup edilir). Maliyet yüzdesi iade/indirim düşülmüş net ürün satışı üzerinden hesaplanır.</p>
    </Card>
  );
}

