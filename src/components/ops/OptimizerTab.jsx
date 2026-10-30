import { useEffect, useMemo, useState } from 'react'
import { CircleMarker, MapContainer, Marker, Polyline, TileLayer, Tooltip, useMap } from 'react-leaflet'
import L from '../../lib/leaflet-global.js'
import { api } from '../../api.js'
import products from '../../data/products.json'
import { CATEGORY_KEYS } from '../../i18n/strings.js'
import { INDIA_CENTER, Kpi, dcIcon, money, num, pct, utilTone } from './common.jsx'

const MODES = [
  ['valmo', 'Valmo end-to-end', '#9f2089'],
  ['hybrid', 'Valmo + partner last mile', '#e64980'],
  ['ZR', 'Partner Z · Regional', '#74c0fc'],
  ['YS', 'Partner Y · Surface', '#339af0'],
  ['XP', 'Partner X · Express', '#1864ab'],
]
const PARTS = [['firstMile', 'First mile'], ['handling', 'Sorting'], ['lineHaul', 'Line haul / base'], ['lastMile', 'Last mile / weight'], ['cod', 'COD']]

function Fit({ route }) {
  const map = useMap()
  useEffect(() => {
    if (route?.length) map.fitBounds(L.latLngBounds(route.map((p) => [p.lat, p.lng])), { padding: [30, 30], maxZoom: 7 })
  }, [map, route])
  return null
}

function ModeBar({ byMode, total }) {
  return (
    <div className="mode-bar">
      {MODES.map(([k, label, col]) => {
        const v = (byMode[k] ?? 0) / total
        return v > 0 ? <i key={k} style={{ width: `${v * 100}%`, background: col }} title={`${label}: ${pct(v)}`}>{v > 0.07 ? pct(v) : ''}</i> : null
      })}
    </div>
  )
}

function RouteOrder({ network }) {
  const [productId, setProductId] = useState('P006')
  const sellers = useMemo(() => network.sellers.filter((s) => s.productIds.includes(productId)), [network, productId])
  const [sellerId, setSellerId] = useState('')
  const [cityId, setCityId] = useState('Varanasi')
  const [qty, setQty] = useState(1)
  const [cod, setCod] = useState(true)
  const [quote, setQuote] = useState(null)
  const [sel, setSel] = useState(0)
  const seller = sellers.find((s) => s.id === sellerId) ? sellerId : sellers[0]?.id

  const run = async () => {
    const q = await api.logistics.quote({ productId, sellerId: seller, cityId, qty, cod })
    setQuote(q)
    setSel(0)
  }
  useEffect(() => {
    if (seller) run()
  }, [productId, seller, cityId, qty, cod]) // eslint-disable-line react-hooks/exhaustive-deps

  const opt = quote?.options[sel]
  const worst = quote ? Math.max(...quote.options.map((o) => o.cost)) : 0
  const cities = [...network.cities].sort((a, b) => a.name.localeCompare(b.name))

  return (
    <div className="box">
      <b>🧭 Route a new order</b>
      <small className="muted">Prices every option at today's network volumes and picks the cheapest.</small>
      <div className="form-row">
        <label>Product
          <select value={productId} onChange={(e) => setProductId(e.target.value)}>
            {CATEGORY_KEYS.map((c) => (
              <optgroup key={c} label={c}>
                {products.filter((p) => p.category === c).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </optgroup>
            ))}
          </select>
        </label>
        <label>Seller
          <select value={seller} onChange={(e) => setSellerId(e.target.value)}>
            {sellers.map((s) => <option key={s.id} value={s.id}>{s.name} · {s.city}</option>)}
          </select>
        </label>
        <label>Deliver to
          <select value={cityId} onChange={(e) => setCityId(e.target.value)}>
            {cities.map((c) => <option key={c.id} value={c.id}>{c.name}, {c.state}</option>)}
          </select>
        </label>
        <label>Qty
          <select value={qty} onChange={(e) => setQty(+e.target.value)}>{[1, 2, 3, 5].map((n) => <option key={n}>{n}</option>)}</select>
        </label>
        <label>Payment
          <select value={cod ? 'cod' : 'pre'} onChange={(e) => setCod(e.target.value === 'cod')}>
            <option value="cod">Cash on delivery</option><option value="pre">Prepaid</option>
          </select>
        </label>
      </div>

      {quote && (
        <div className="route-grid">
          <div className="table-wrap">
            <table className="sku-table opt-table">
              <thead>
                <tr><th>Option</th><th>Cost</th>{PARTS.map(([, l]) => <th key={l}>{l}</th>)}<th>ETA</th></tr>
              </thead>
              <tbody>
                {quote.options.map((o, i) => (
                  <tr key={o.mode + i} className={(i === sel ? 'sel ' : '') + (i === 0 ? 'best' : '')} onClick={() => setSel(i)}>
                    <td>
                      <b>{o.label}</b> {i === 0 && <span className="pill green">Cheapest</span>}
                      {o.originName && <small className="muted block">{o.originName.replace('Valmo ', '')} → {o.destName.replace('Valmo ', '')} · {o.laneKm} km</small>}
                      {o.zone && <small className="muted block">{o.zone} zone</small>}
                    </td>
                    <td><b>₹{o.cost.toFixed(1)}</b>{i === 0 && worst > o.cost && <small className="up block">saves ₹{(worst - o.cost).toFixed(0)}</small>}</td>
                    {PARTS.map(([k]) => <td key={k}>{o.parts[k] ? '₹' + o.parts[k].toFixed(1) : '—'}</td>)}
                    <td>{o.eta} d</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <small className="muted">{quote.distanceKm} km seller → customer · {quote.order.weight} kg · Valmo is only offered when the seller is inside a DC's first-mile reach.</small>
          </div>
          <div className="route-map">
            <MapContainer center={INDIA_CENTER} zoom={4} style={{ height: '100%', width: '100%' }} scrollWheelZoom={false}>
              <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution="&copy; OpenStreetMap" />
              {opt && <Fit route={opt.route} />}
              {opt && <Polyline positions={opt.route.map((p) => [p.lat, p.lng])} pathOptions={{ color: MODES.find((m) => m[0] === opt.mode)?.[2], weight: 4 }} />}
              {opt?.route.map((p, i) =>
                i > 0 && i < opt.route.length - 1 ? (
                  <Marker key={i} position={[p.lat, p.lng]} icon={dcIcon({ type: 'hub' })}><Tooltip>{p.name}</Tooltip></Marker>
                ) : (
                  <CircleMarker key={i} center={[p.lat, p.lng]} radius={7} pathOptions={{ color: '#fff', fillColor: i === 0 ? '#0ca678' : '#f43397', fillOpacity: 1 }}>
                    <Tooltip permanent direction="top">{i === 0 ? 'Seller' : 'Customer'}</Tooltip>
                  </CircleMarker>
                ),
              )}
            </MapContainer>
          </div>
        </div>
      )}
    </div>
  )
}

function NetworkOptimiser() {
  const [days, setDays] = useState(1)
  const [draft, setDraft] = useState({})
  const [busy, setBusy] = useState(false)
  const [data, setData] = useState(null)
  const run = async (body = {}) => {
    setBusy(true)
    setData(await api.logistics.optimize({ days, ...body }))
    setDraft({})
    setBusy(false)
  }
  useEffect(() => {
    run()
  }, [days]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!data) return <div className="box"><div className="loading">Optimising…</div></div>
  const { external, rule, optimized } = data.runs
  const saving = rule.totals.cost - optimized.totals.cost
  const valmoShare = (r) => ((r.totals.byMode.valmo ?? 0) + (r.totals.byMode.hybrid ?? 0)) / r.totals.orders
  const per = days === 1 ? ' / day' : ` / ${days} days`
  const fleetVal = (id, k) => draft[id]?.[k] ?? data.fleet[id]?.[k] ?? 0
  const setFleet = (id, k, v) => setDraft((d) => ({ ...d, [id]: { ...d[id], [k]: Math.max(0, +v || 0) } }))
  const util = Object.fromEntries(optimized.utilisation.map((u) => [u.id, u]))

  return (
    <div className="box">
      <div className="box-head">
        <b>⚙️ Optimise the network</b>
        <div className="seg">
          {[[1, 'Latest day'], [7, 'Last 7 days'], [30, 'Last 30 days']].map(([d, l]) => (
            <button key={d} className={days === d ? 'sel' : ''} onClick={() => setDays(d)}>{l}</button>
          ))}
        </div>
      </div>
      <small className="muted">
        {days === 1 ? `Orders of ${data.day}` : `Orders of the last ${days} days`}. The optimiser ranks orders by how much Valmo saves versus the best partner and fills each DC's bikes, vans and trucks in that order. Anything that doesn't fit, or is cheaper outside, goes to a partner.
      </small>
      <div className="kpis">
        <Kpi label="Orders" value={num(optimized.totals.orders)} sub={per.replace(' / ', '')} />
        <Kpi label="All partners" value={money(external.totals.cost)} sub={`₹${external.totals.perOrder.toFixed(1)} / order`} />
        <Kpi label="Today's rule" value={money(rule.totals.cost)} sub={`₹${rule.totals.perOrder.toFixed(1)} / order`} />
        <Kpi label="Optimised" value={money(optimized.totals.cost)} sub={`₹${optimized.totals.perOrder.toFixed(1)} / order`} tone="purple" />
        <Kpi label="Saving vs rule" value={money(saving)} sub={pct(saving / rule.totals.cost, 1) + per} tone="green" />
      </div>
      <div className="mode-compare">
        <div><small>Today's rule · Valmo {pct(valmoShare(rule))}</small><ModeBar byMode={rule.totals.byMode} total={rule.totals.orders} /></div>
        <div><small>Optimised · Valmo {pct(valmoShare(optimized))}</small><ModeBar byMode={optimized.totals.byMode} total={optimized.totals.orders} /></div>
        <div className="mode-legend">{MODES.map(([k, l, c]) => <span key={k}><i style={{ background: c }} /> {l}</span>)}</div>
      </div>

      <div className="box-head mt">
        <b>🚛 Fleet by distribution centre</b>
        <div className="row-gap">
          <button className="btn-outline sm" disabled={busy} onClick={() => run({ reset: true })}>Reset fleet</button>
          <button className="btn-primary sm" disabled={busy || !Object.keys(draft).length} onClick={() => run({ fleet: draft })}>{busy ? 'Running…' : 'Apply & re-optimise'}</button>
        </div>
      </div>
      <small className="muted">Edit vehicles to see how fleet changes move orders between Valmo and partners. Utilisation is the average across the selected days; red means the fleet is the bottleneck.</small>
      <div className="table-wrap">
        <table className="sku-table fleet-table">
          <thead>
            <tr><th>Distribution centre</th><th>Shipments / day</th><th>Bikes</th><th>Use</th><th>Vans</th><th>Use</th><th>Trucks</th><th>Use</th></tr>
          </thead>
          <tbody>
            {data.dcs.map((dc) => {
              const u = util[dc.id] ?? {}
              return (
                <tr key={dc.id}>
                  <td><b>{dc.name.replace('Valmo ', '')}</b><small className="muted block">{dc.typeLabel}</small></td>
                  <td>{num(u.orders ?? 0)}</td>
                  {['bike', 'van', 'truck'].map((k) => [
                    <td key={k}><input className="fleet-input" type="number" min="0" value={fleetVal(dc.id, k)} onChange={(e) => setFleet(dc.id, k, e.target.value)} /></td>,
                    <td key={k + 'u'}><span className={'pill ' + utilTone(u[k])}>{u[k] == null ? '—' : pct(u[k])}</span></td>,
                  ])}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <b className="mt">🛣️ Busiest Valmo line-haul lanes</b>
      <div className="table-wrap">
        <table className="sku-table">
          <thead><tr><th>Lane</th><th>Distance</th><th>Orders</th><th>Load</th><th>Trucks needed</th></tr></thead>
          <tbody>
            {data.lanes.map((l) => (
              <tr key={l.from + l.to}>
                <td>{l.from.slice(3)} → {l.to.slice(3)}</td>
                <td>{num(l.km)} km</td>
                <td>{num(l.orders)}</td>
                <td>{num(l.kg / 1000)} t</td>
                <td>{Math.ceil(l.kg / days / 5000)} / day</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export default function OptimizerTab({ network }) {
  return (
    <div className="ops-stack">
      <RouteOrder network={network} />
      <NetworkOptimiser />
    </div>
  )
}

