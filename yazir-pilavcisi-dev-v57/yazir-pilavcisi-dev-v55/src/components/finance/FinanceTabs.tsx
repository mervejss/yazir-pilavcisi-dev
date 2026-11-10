import { useState } from 'react';
import { shortKey, longKey, type DateRange } from '@/lib/analyticsData';
import {
  GROUP_LABELS, fmtDay, money2, signed,
  type FinResult, type FinSettings, type OrderFin, type PaymentRecon,
} from '@/lib/finance';
import { Card, DataTable, Grid, HBarList, KpiCard, TrendChart, fmtMoney, fmtNum1, type Col } from '@/components/analytics/pro/Kit';
import type { CargoRow, Coverage } from '@/hooks/useFinance';
import type { ProductFin, RateFin, UpcomingFin } from '@/lib/finance';

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
export function CoverageCard({ cov, onSync, busy }: { cov: Coverage; onSync: () => void; busy: boolean }) {
  if (!cov.panelOrders && !cov.firstTx) return null;
  const pct = cov.panelOrders ? (cov.matched / cov.panelOrders) * 100 : 100;
  const ok = cov.pending.length === 0;
  const cols: Col<(typeof cov.pending)[number]>[] = [
    { key: 'no', label: 'Sipariş no', value: (p) => p.no, render: (p) => <b>{p.no || '—'}</b> },
    { key: 'at', label: 'Sipariş tarihi', value: (p) => p.at, render: (p) => fmtDay(p.at) },
    { key: 'tot', label: 'Tutar', align: 'right', value: (p) => p.total, render: (p) => money2(p.total) },
  ];
  return (
    <Card title={`${ok ? '✅' : '🔎'} Veri bütünlüğü — panel ↔ Trendyol finansı`}
      sub="Panelde TESLİM görünen Trendyol siparişlerinin kaçı cari ekstrede (finans) karşılığını bulmuş? Trendyol finansal kaydı sipariş teslim edildikten sonra oluşturur; son 1–3 günün eksik görünmesi normaldir.">
      <div className="fin-kv">
        <span>Panelde teslim edilen Trendyol siparişi</span><b>{cov.panelOrders.toLocaleString('tr-TR')} · {money2(cov.panelRevenue)}</b>
        <span>Finansta karşılığı bulunan</span><b className="pos">{cov.matched.toLocaleString('tr-TR')} (%{fmtNum1(pct, 0)}) · {money2(cov.matchedRevenue)}</b>
        <span>Finansa henüz düşmemiş (bekleyen)</span><b className={cov.pending.length ? 'neg' : 'pos'}>{cov.pending.length.toLocaleString('tr-TR')} · {money2(cov.panelRevenue - cov.matchedRevenue)}</b>
        {cov.financeOnly > 0 && <><span>Finansta olup panelde eşleşmeyen sipariş</span><b>{cov.financeOnly.toLocaleString('tr-TR')}</b></>}
        <span>Finans kaydı kapsamı</span><b>{fmtDay(cov.firstTx)} → {fmtDay(cov.lastTx)}</b>
      </div>
      {!ok && (
        <>
          <p className="anp-hint" style={{ marginTop: 10 }}>Bekleyenlerin çoğu henüz muhasebeleşmemiş yeni siparişlerdir. Eski tarihli siparişler listedeyse “⬇ Trendyol’dan çek” ile aralığı yeniden çekin.</p>
          <div className="fin-actions"><button type="button" className="anp-btn gold" disabled={busy} onClick={onSync}>⬇ Bu aralığı yeniden çek</button></div>
          <DataTable rows={cov.pending} cols={cols} pageSize={8} csvName="finansa-dusmeyen-siparisler" rowKey={(p) => p.no + p.at} initialSort={{ key: 'at', dir: 'desc' }} empty="—" />
        </>
      )}
    </Card>
  );
}

export function SummaryTab({ r, settings, cov, onSync, busy }: { r: FinResult; settings: FinSettings; range: DateRange; cov?: Coverage; onSync?: () => void; busy?: boolean }) {
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
      {cov && onSync && <CoverageCard cov={cov} onSync={onSync} busy={!!busy} />}
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

      <div className="anp-kpis">
        <KpiCard icon="🧾" label="Sipariş sayısı" value={r.orders.toLocaleString('tr-TR')} color="#0ea5e9" sub={`ort. sepet ${money2(r.avgBasket)}`} />
        <KpiCard icon="↩️" label="İadeli sipariş" value={r.refundedOrders.toLocaleString('tr-TR')} color="#f27a1a" sub={`iade oranı %${fmtNum1(r.refundRate, 1)}`} />
        <KpiCard icon="💸" label="Sipariş başı komisyon" value={money2(r.commissionPerOrder)} color={RED} sub={`ort. %${fmtNum1(r.avgCommissionPct, 1)}`} />
        <KpiCard icon="🏦" label="Sipariş başı hakediş" value={money2(r.payoutPerOrder)} color="#0ea5e9" />
        <KpiCard icon="📈" label="Sipariş başı net kâr" value={money2(r.profitPerOrder)} color={r.profitPerOrder >= 0 ? GREEN : RED} />
        <KpiCard icon="✅" label="Ödeme emri oluşan hakediş" value={money2(r.paidPayout)} color={GREEN} sub="Trendyol ödeme emrine bağlanmış" />
        <KpiCard icon="⏳" label="Bekleyen hakediş (vade)" value={money2(r.pendingPayout)} color="#a16207" sub="henüz ödeme emri oluşmamış" />
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
export function PaymentsTab({ recon, onRefresh, upcoming = [] }: { recon: PaymentRecon[]; onRefresh: (id: number) => Promise<void>; upcoming?: UpcomingFin[] }) {
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
  const upCols: Col<UpcomingFin>[] = [
    { key: 'd', label: 'Vade / ödeme günü', value: (u) => u.ts, render: (u) => <b>{fmtDay(u.ts)}</b> },
    { key: 'o', label: 'Sipariş', align: 'right', value: (u) => u.orders },
    { key: 'p', label: 'Beklenen hakediş', align: 'right', value: (u) => u.payout, render: (u) => <b>{money2(u.payout)}</b> },
  ];
  return (
    <>
    <Card title="Haftalık ödemeler ve mutabakat" sub="Trendyol her çarşamba vadesi gelen siparişler için ödeme emri oluşturur. Fark ≈ 0 ise hesabımız Trendyol ile birebir tutuyor demektir. Ödeme emri oluştuktan sonra kayıtların güncellenmesi zaman alabilir; bir sonraki gün “Yenile” yapın.">
      <DataTable rows={recon} cols={cols} pageSize={12} csvName="trendyol-odeme-mutabakat" rowKey={(p) => String(p.id)} initialSort={{ key: 'dt', dir: 'desc' }} empty="Ödeme emri yok. Üstteki “Trendyol’dan çek” ile senkronlayın." />
    </Card>
    <Card title="📅 Vade takvimi — yaklaşan hakedişler" sub="Henüz ödeme emri oluşmamış kayıtların vade tarihine göre beklenen hakedişi (kesintiler / stopaj hariç). Ödeme emri oluştukça yukarıdaki listeye geçer.">
      <DataTable rows={upcoming} cols={upCols} pageSize={12} csvName="trendyol-vade-takvimi" rowKey={(u) => u.key} initialSort={{ key: 'd', dir: 'asc' }} empty="Bekleyen (ödeme emri oluşmamış) kayıt yok." />
    </Card>
    </>
  );
}

// ---------------------------------------------------------------------------
// 4) Kesinti dökümü (şeffaflık)
// ---------------------------------------------------------------------------
export function BreakdownTab({ r, cargo = [] }: { r: FinResult; cargo?: CargoRow[] }) {
  const cargoByType = new Map<string, { type: string; count: number; amount: number; desi: number }>();
  cargo.forEach((c) => {
    const k = c.package_type || 'Diğer';
    const e = cargoByType.get(k) || { type: k, count: 0, amount: 0, desi: 0 };
    e.count++; e.amount += c.amount; e.desi += c.desi || 0; cargoByType.set(k, e);
  });
  const cargoRows = [...cargoByType.values()].sort((a, b) => b.amount - a.amount);
  const rateCols: Col<RateFin>[] = [
    { key: 'r', label: 'Komisyon oranı', value: (x) => x.rate, render: (x) => <b>%{fmtNum1(x.rate, 1)}</b> },
    { key: 'n', label: 'Satır', align: 'right', value: (x) => x.lines },
    { key: 's', label: 'Satış', align: 'right', value: (x) => x.sales, render: (x) => money2(x.sales) },
    { key: 'c', label: 'Komisyon', align: 'right', value: (x) => x.commission, render: (x) => money2(x.commission) },
  ];
  return (
    <>
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
    <Grid cols={2}>
      <Card title="Komisyon oranına göre satışlar" sub="Trendyol her ürün satırında farklı oran uygulayabilir">
        <DataTable rows={r.byRate} cols={rateCols} pageSize={12} rowKey={(x) => String(x.rate)} csvName="trendyol-komisyon-oranlari" empty="Oran bilgisi yok." />
      </Card>
      <Card title="🚚 Kargo faturası detayı" sub="Cari ekstredeki “Kargo Fatura” kayıtlarının kalemleri (Kargo Faturası Detayları servisi). Restoran/Go siparişlerinde kargo faturası yoksa boş kalır.">
        <DataTable rows={cargoRows} rowKey={(x) => x.type} pageSize={10} csvName="trendyol-kargo-faturasi" empty="Kargo faturası kalemi yok (veya henüz çekilmedi)."
          cols={[
            { key: 't', label: 'Kalem türü', value: (x) => x.type, render: (x) => <b>{x.type}</b> },
            { key: 'n', label: 'Adet', align: 'right', value: (x) => x.count },
            { key: 'd', label: 'Toplam desi', align: 'right', value: (x) => x.desi, render: (x) => fmtNum1(x.desi, 0) },
            { key: 'a', label: 'Tutar', align: 'right', value: (x) => x.amount, render: (x) => money2(x.amount) },
          ]} />
      </Card>
    </Grid>
    </>
  );
}

// ---------------------------------------------------------------------------
// 4b) Ürün bazında (barkod / açıklama)
// ---------------------------------------------------------------------------
export function ProductsTab({ products }: { products: ProductFin[] }) {
  const top = products.slice(0, 10);
  const cols: Col<ProductFin>[] = [
    { key: 'n', label: 'Ürün (barkod / açıklama)', value: (p) => p.name, render: (p) => <b>{p.name}</b> },
    { key: 'l', label: 'Satış satırı', align: 'right', value: (p) => p.lines },
    { key: 's', label: 'Satış', align: 'right', value: (p) => p.sales, render: (p) => money2(p.sales) },
    { key: 'r', label: 'İade', align: 'right', value: (p) => p.returns, render: (p) => (p.returns ? <span className="anp-bad">{money2(p.returns)}</span> : '—') },
    { key: 'd', label: 'İndirim', align: 'right', value: (p) => p.discounts, render: (p) => (p.discounts ? money2(p.discounts) : '—') },
    { key: 'c', label: 'Komisyon', align: 'right', value: (p) => p.commission, render: (p) => money2(p.commission) },
    { key: 'cp', label: 'Kom. %', align: 'right', value: (p) => p.commissionPct, render: (p) => `%${fmtNum1(p.commissionPct, 1)}` },
    { key: 'p', label: 'Hakediş', align: 'right', value: (p) => p.payout, render: (p) => <b>{money2(p.payout)}</b> },
  ];
  return (
    <>
      <Card title="En çok satan 10 (Trendyol finansına göre)">
        <HBarList rank rows={top.map((p) => ({ label: p.name, value: p.sales, sub: `${p.lines} satır · hakediş ${money2(p.payout)}` }))} format={fmtMoney} empty="Kayıt yok." />
      </Card>
      <Card title={`Ürün bazında satış, iade ve komisyon (${products.length.toLocaleString('tr-TR')})`} sub="Barkod yoksa işlem açıklaması kullanılır. Satış satırı = faturalanan ürün satırı adedi.">
        <DataTable rows={products} cols={cols} pageSize={15} csvName="trendyol-urun-finans" rowKey={(p) => p.key} initialSort={{ key: 's', dir: 'desc' }} empty="Bu aralıkta kayıt yok." />
      </Card>
    </>
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

