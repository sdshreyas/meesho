import { useEffect, useMemo, useState } from 'react'
import { CircleMarker, MapContainer, Marker, Polyline, TileLayer, Tooltip, useMap } from 'react-leaflet'
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip as RTooltip, XAxis, YAxis } from 'recharts'
import L from '../../lib/leaflet-global.js'
import { api } from '../../api.js'
import products from '../../data/products.json'
import { CATEGORY_KEYS } from '../../i18n/strings.js'
import { INDIA_CENTER, Kpi, STAGE_COLOR, airhubIcon, dcIcon, money, num, pct, utilTone } from './common.jsx'

const MODES = [
  ['valmo', 'Valmo end-to-end', '#9f2089'],
  ['valmo_alt', 'Valmo via alternate sort centre', '#c2255c'],
  ['hybrid_lm', 'Valmo + 3PL last mile', '#e64980'],
  ['hybrid_fm', '3PL pickup + Valmo', '#f783ac'],
  ['ZR', 'Partner Z · Regional', '#74c0fc'],
  ['YS', 'Partner Y · Surface', '#339af0'],
  ['XP', 'Partner X · Express', '#1864ab'],
]
const modeColor = (m) => MODES.find((x) => x[0] === m)?.[2] ?? '#888'
const LEG = [
  ['firstMile', 'First mile'], ['feederOut', 'Feeder to sort centre'], ['lineHaul', 'Line haul'], ['feederIn', 'Feeder to Airhub'], ['lastMile', 'Last mile'],
]
export const STAGE_BARS = [['firstMile', '1 First mile'], ['sourceSort', '2 Source sort'], ['lineHaul', '3 Line haul'], ['destSort', '4 Dest sort'], ['lastMile', '5 Last mile'], ['rto', 'RTO / failed']]

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

export function StageChart({ rows, height = 260 }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={rows} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#eee" />
        <XAxis type="number" tickFormatter={(v) => '₹' + v} tick={{ fontSize: 11 }} />
        <YAxis type="category" dataKey="name" width={180} tick={{ fontSize: 11 }} />
        <RTooltip formatter={(v, n) => [`₹${(+v).toFixed(1)}`, n]} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        {STAGE_BARS.map(([k, l]) => <Bar key={k} dataKey={k} name={l} stackId="s" fill={STAGE_COLOR[k]} />)}
      </BarChart>
    </ResponsiveContainer>
  )
}

function RouteOrder({ network }) {
  const [productId, setProductId] = useState('P006')
  const sellers = useMemo(() => network.sellers.filter((s) => s.productIds.includes(productId)), [network, productId])
  const [sellerId, setSellerId] = useState('')
  const [cityId, setCityId] = useState('Kanpur')
  const [qty, setQty] = useState(1)
  const [cod, setCod] = useState(true)
  const [quote, setQuote] = useState(null)
  const [sel, setSel] = useState(0)
  const seller = sellers.find((s) => s.id === sellerId) ? sellerId : sellers[0]?.id

  useEffect(() => {
    if (!seller) return
    api.logistics.quote({ productId, sellerId: seller, cityId, qty, cod }).then((q) => {
      setQuote(q)
      setSel(0)
    })
  }, [productId, seller, cityId, qty, cod])

  const opt = quote?.options[sel]
  const cities = [...network.cities].sort((a, b) => a.name.localeCompare(b.name))
  const chartRows = quote?.options.map((o) => ({ name: o.label, ...Object.fromEntries(Object.entries(o.stages).map(([k, v]) => [k, +v.toFixed(2)])) })) ?? []
  const best = quote?.options[0]
  const worst = quote ? Math.max(...quote.options.map((o) => o.cost)) : 0

  return (
    <div className="box">
      <b>🧭 Plan a new order</b>
      <small className="muted">Prices every route stage by stage at today's consolidated volumes, and picks the cheapest plan.</small>
      <div className="form-row">
        <label>Product
          <select value={productId} onChange={(e) => setProductId(e.target.value)}>
            {CATEGORY_KEYS.map((c) => (
              <optgroup key={c} label={c}>{products.filter((p) => p.category === c).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</optgroup>
            ))}
          </select>
        </label>
        <label>Supplier
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
        <>
          <div className="parcel-card">
            <span>📦 Carton {quote.order.dims.join(' × ')} cm</span>
            <span>Volume {(quote.order.volume * 1000).toFixed(1)} L</span>
            <span>Actual {quote.order.weight.toFixed(2)} kg</span>
            <span>Volumetric {quote.order.volKg.toFixed(2)} kg</span>
            <span><b>Chargeable {quote.order.chargeKg.toFixed(2)} kg</b></span>
            <span>{quote.distanceKm} km</span>
            <span>{quote.sellerAirhub ? `Pickup: ${quote.sellerAirhub}` : 'No Airhub near supplier'}</span>
            <span>{quote.customerAirhub ? `Delivery: ${quote.customerAirhub}` : 'No Airhub at destination'}</span>
          </div>

          <div className="best-plan">
            ✅ Best plan: <b>{best.label}</b> at <b>₹{best.cost.toFixed(1)}</b> per parcel
            {worst > best.cost && <> — saves ₹{(worst - best.cost).toFixed(1)} vs the costliest of {quote.options.length} routes</>}
          </div>

          <b className="mt">Stage-wise cost of each route (₹ per parcel)</b>
          <StageChart rows={chartRows} height={50 + chartRows.length * 34} />

          <div className="table-wrap">
            <table className="sku-table opt-table">
              <thead>
                <tr><th>Route</th><th>Total</th><th>1 First mile</th><th>2 Source sort</th><th>3 Line haul</th><th>4 Dest sort</th><th>5 Last mile</th><th>RTO</th><th>ETA</th></tr>
              </thead>
              <tbody>
                {quote.options.map((o, i) => (
                  <tr key={o.mode} className={(i === sel ? 'sel ' : '') + (i === 0 ? 'best' : '')} onClick={() => setSel(i)}>
                    <td><i className="mode-dot" style={{ background: modeColor(o.mode) }} /><b>{o.label}</b> {i === 0 && <span className="pill green">Best</span>}</td>
                    <td><b>₹{o.cost.toFixed(1)}</b></td>
                    {STAGE_BARS.map(([k]) => <td key={k}>₹{o.stages[k].toFixed(1)}</td>)}
                    <td>{Math.round((o.etaH / 24) * 10) / 10} d</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <small className="muted">Click a route to see its legs and vehicles. 3PL stage split is the typical share of a partner's rate card.</small>
          </div>

          {opt && (
            <div className="route-grid">
              <div className="plan-detail">
                <b>{opt.label} — leg by leg</b>
                <ol className="path-list">
                  {opt.path.map((n, i) => <li key={i} className={'pk ' + n.kind}><span>{n.name}</span></li>)}
                </ol>
                {Object.keys(opt.fleet).length > 0 && (
                  <table className="sku-table">
                    <thead><tr><th>Leg</th><th>Vehicle plan (lowest cost)</th><th>Fill</th></tr></thead>
                    <tbody>
                      {LEG.filter(([k]) => opt.fleet[k]).map(([k, l]) => (
                        <tr key={k}>
                          <td>{l}{opt.fleet[k].km ? <small className="muted block">{Math.round(opt.fleet[k].km)} km</small> : null}</td>
                          <td>{opt.fleet[k].label}{opt.fleet[k].premium ? <small className="down block">+{pct(opt.fleet[k].premium)} spot truck premium</small> : null}</td>
                          <td>{opt.fleet[k].util != null ? <span className={'pill ' + (opt.fleet[k].util > 0.75 ? 'green' : opt.fleet[k].util > 0.5 ? 'amber' : 'red')}>{pct(opt.fleet[k].util)}</span> : '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
                {opt.fleet.lineHaul?.alternatives && (
                  <>
                    <b className="mt">Line-haul vehicle mixes considered for this lane</b>
                    <table className="sku-table">
                      <thead><tr><th>Vehicle mix for the lane's daily volume</th><th>Fill</th><th>Lane cost / day</th></tr></thead>
                      <tbody>
                        {opt.fleet.lineHaul.alternatives.map((a, i) => (
                          <tr key={a.label} className={i === 0 ? 'best' : ''}>
                            <td>{a.label} {i === 0 && <span className="pill green">Chosen</span>}</td>
                            <td>{pct(a.util)}</td>
                            <td>{money(a.cost)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </>
                )}
                {opt.notes?.map((n) => <small key={n} className="muted block">• {n}</small>)}
              </div>
              <div className="route-map">
                <MapContainer center={INDIA_CENTER} zoom={4} style={{ height: '100%', width: '100%' }} scrollWheelZoom={false}>
                  <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution="&copy; OpenStreetMap" />
                  <Fit route={opt.path} />
                  <Polyline positions={opt.path.map((p) => [p.lat, p.lng])} pathOptions={{ color: modeColor(opt.mode), weight: 4 }} />
                  {opt.path.map((n, i) =>
                    n.kind === 'airhub' ? (
                      <Marker key={i} position={[n.lat, n.lng]} icon={airhubIcon}><Tooltip>{n.name}</Tooltip></Marker>
                    ) : n.kind === 'sort' || n.kind === 'hub' ? (
                      <Marker key={i} position={[n.lat, n.lng]} icon={dcIcon({ type: n.kind })}><Tooltip>{n.name}</Tooltip></Marker>
                    ) : (
                      <CircleMarker key={i} center={[n.lat, n.lng]} radius={7} pathOptions={{ color: '#fff', fillColor: n.kind === 'seller' ? '#0ca678' : '#f43397', fillOpacity: 1 }}>
                        <Tooltip permanent direction="top">{n.kind === 'seller' ? 'Supplier' : 'Customer'}</Tooltip>
                      </CircleMarker>
                    ),
                  )}
                </MapContainer>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}

function NetworkOptimiser({ network }) {
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
  const per = days === 1 ? ' / day' : ` / ${days} days`
  const fleetVal = (id, k) => draft[id]?.[k] ?? data.fleet[id]?.[k] ?? 0
  const setFleet = (id, k, v) => setDraft((d) => ({ ...d, [id]: { ...d[id], [k]: Math.max(0, +v || 0) } }))
  const util = Object.fromEntries(optimized.utilisation.map((u) => [u.id, u]))
  const stageRows = [['All 3PL', external], ["Today's rule", rule], ['Optimised', optimized]].map(([name, r]) => ({
    name, ...Object.fromEntries(Object.entries(r.totals.stagesPerOrder).map(([k, v]) => [k, +v.toFixed(2)])),
  }))

  return (
    <div className="box">
      <div className="box-head">
        <b>⚙️ Optimise the whole network</b>
        <div className="seg">
          {[[1, 'Latest day'], [7, 'Last 7 days'], [30, 'Last 30 days']].map(([d, l]) => (
            <button key={d} className={days === d ? 'sel' : ''} onClick={() => setDays(d)}>{l}</button>
          ))}
        </div>
      </div>
      <small className="muted">
        {days === 1 ? `Orders of ${data.day}` : `Orders of the last ${days} days`}. Each day the optimiser consolidates volume on every leg, picks the cheapest vehicle mix (highest useful fill), prices every route per parcel and keeps the cheapest. Sort centres whose lanes need more trucks than contracted pay a {pct(network.model.cost.spotPremium)} spot premium on the shortfall, and orders are re-priced.
      </small>
      <div className="kpis">
        <Kpi label="Parcels" value={num(optimized.totals.orders)} sub={per.replace(' / ', '')} />
        <Kpi label="All 3PL" value={money(external.totals.cost)} sub={`₹${external.totals.perOrder.toFixed(1)} / parcel`} />
        <Kpi label="Today's rule" value={money(rule.totals.cost)} sub={`₹${rule.totals.perOrder.toFixed(1)} / parcel`} />
        <Kpi label="Optimised" value={money(optimized.totals.cost)} sub={`₹${optimized.totals.perOrder.toFixed(1)} / parcel`} tone="purple" />
        <Kpi label="Saving vs rule" value={money(saving)} sub={pct(saving / rule.totals.cost, 1) + per} tone="green" />
      </div>

      <b className="mt">Stage-wise cost per parcel</b>
      <StageChart rows={stageRows} height={170} />

      <div className="mode-compare">
        <div><small>Today's rule · Valmo network {pct(rule.valmoShare)}</small><ModeBar byMode={rule.totals.byMode} total={rule.totals.orders} /></div>
        <div><small>Optimised · Valmo network {pct(optimized.valmoShare)}</small><ModeBar byMode={optimized.totals.byMode} total={optimized.totals.orders} /></div>
        <div className="mode-legend">{MODES.map(([k, l, c]) => <span key={k}><i style={{ background: c }} /> {l}</span>)}</div>
      </div>

      <div className="box-head mt">
        <b>🚛 Contracted line-haul fleet by sort centre</b>
        <div className="row-gap">
          <button className="btn-outline sm" disabled={busy} onClick={() => run({ reset: true })}>Reset fleet</button>
          <button className="btn-primary sm" disabled={busy || !Object.keys(draft).length} onClick={() => run({ fleet: draft })}>{busy ? 'Running…' : 'Apply & re-optimise'}</button>
        </div>
      </div>
      <small className="muted">Trucks contracted at each origin sort centre, by type. "Need/day" is the vehicle-days the optimised plan uses (a long lane ties a truck up for several days of round trip). Fleet usage compares the capacity needed with the capacity contracted, so swapping a 19 ft for a 32 ft still counts; above 100% the shortfall is hired on the spot market at a premium.</small>
      <div className="table-wrap">
        <table className="sku-table fleet-table">
          <thead>
            <tr><th>Sort centre / Base</th><th>Parcels / day</th><th>Truck fill</th><th>Fleet usage</th>{data.lineHaulTypes.map((t) => <th key={t}>{data.vehicles[t].label}<small className="muted block">contracted · need/day</small></th>)}</tr>
          </thead>
          <tbody>
            {data.dcs.map((dc) => {
              const u = util[dc.id] ?? { usage: {} }
              return (
                <tr key={dc.id}>
                  <td><b>{dc.name.replace('Valmo ', '')}</b><small className="muted block">{dc.typeLabel}</small></td>
                  <td>{num(u.orders ?? 0)}</td>
                  <td>{u.fill == null ? '—' : <span className={'pill ' + (u.fill > 0.75 ? 'green' : u.fill > 0.5 ? 'amber' : 'red')}>{pct(u.fill)}</span>}</td>
                  <td>{u.fleetUse == null ? '—' : <span className={'pill ' + utilTone(u.fleetUse)}>{u.fleetUse > 9 ? 'all spot' : pct(u.fleetUse)}</span>}</td>
                  {data.lineHaulTypes.map((t) => (
                    <td key={t} className="fleet-cell">
                      <input className="fleet-input" type="number" min="0" value={fleetVal(dc.id, t)} onChange={(e) => setFleet(dc.id, t, e.target.value)} />
                      <small className="muted">{u.usage[t]?.need ? u.usage[t].need.toFixed(1) : '—'}</small>
                    </td>
                  ))}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <b className="mt">🛣️ Busiest line-haul lanes</b>
      <div className="table-wrap">
        <table className="sku-table">
          <thead><tr><th>Lane</th><th>Distance</th><th>Volume / day</th><th>Vehicles / day</th><th>Fill</th><th>Cost / day</th></tr></thead>
          <tbody>
            {data.lanes.map((l) => (
              <tr key={l.key}>
                <td>{l.from.slice(3)} → {l.to.slice(3)}</td>
                <td>{num(l.km)} km</td>
                <td>{num(l.vol / days)} m³</td>
                <td>{Object.entries(l.perDay).map(([t, n]) => `${n.toFixed(1)} × ${data.vehicles[t].label}`).join(' + ')}</td>
                <td><span className={'pill ' + (l.fill > 0.75 ? 'green' : l.fill > 0.5 ? 'amber' : 'red')}>{pct(l.fill)}</span></td>
                <td>{money(l.cost / days)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function FleetCatalogue({ network }) {
  const m = network.model
  return (
    <div className="box">
      <b>🚚 Vehicle catalogue & last-mile model</b>
      <small className="muted">Every leg is costed with these vehicles. Usable volume = {pct(m.cost.fill)} of the body after stacking.</small>
      <div className="table-wrap">
        <table className="sku-table">
          <thead><tr><th>Vehicle</th><th>Volume</th><th>Payload</th><th>Running ₹/km</th><th>Toll ₹/km</th><th>Driver ₹/day</th><th>Fixed ₹/day</th><th>Used for</th></tr></thead>
          <tbody>
            {Object.entries(network.vehicles).map(([k, v]) => (
              <tr key={k}>
                <td><b>{v.label}</b></td>
                <td>{v.volM3} m³</td>
                <td>{num(v.kg)} kg</td>
                <td>₹{v.perKm}</td>
                <td>₹{v.tollPerKm}</td>
                <td>{v.driverDay ? '₹' + num(v.driverDay) : 'per piece'}</td>
                <td>{v.fixedDay ? '₹' + num(v.fixedDay) : '—'}</td>
                <td>{v.use}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul className="model-notes">
        <li><b>Pilot payout per attempt</b> = day earning ₹{m.cost.pilotDayEarning} ÷ drops per day (tier 1/2/3: {Object.values(m.cost.dropsPerDay).join(' / ')}) + route fuel.</li>
        <li><b>Expected attempts</b> = 1 + f + f² (max 3); re-attempts cost {pct(m.cost.reattemptShare)} of a first attempt. First-attempt failure: COD tier 1/2/3 {Object.values(m.failRate.cod).map((x) => pct(x)).join(' / ')}, prepaid {pct(m.failRate.prepaid)}.</li>
        <li><b>Airhub fees</b>: Captain ₹{m.cost.captainDelivery} per delivery + handling ₹{m.cost.airhubHandling}; COD cash handling ₹{m.cost.codFixed} + {m.cost.codPct}% of value.</li>
        <li><b>RTO allowance</b> = RTO rate (COD tier 1/2/3 {Object.values(m.rtoRate.cod).map((x) => pct(x)).join(' / ')}, prepaid {pct(m.rtoRate.prepaid)}) × {pct(m.cost.rtoReverseShare)} of the forward cost.</li>
        <li><b>3PL</b>: zone rate card on chargeable weight = max(actual, L×W×H ÷ 5000); {pct(m.cost.handoverDiscount)} of the rate when Valmo hands bulk over at a sort centre, {pct(m.cost.injectionDiscount)} when a partner injects pickups into Valmo.</li>
      </ul>
    </div>
  )
}

export default function OptimizerTab({ network }) {
  return (
    <div className="ops-stack">
      <RouteOrder network={network} />
      <NetworkOptimiser network={network} />
      <FleetCatalogue network={network} />
    </div>
  )
}
