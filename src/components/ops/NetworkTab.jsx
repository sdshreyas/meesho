import { useEffect, useMemo, useState } from 'react'
import { Circle, CircleMarker, MapContainer, Marker, Polyline, TileLayer, Tooltip, useMap } from 'react-leaflet'
import { Bar, BarChart, ResponsiveContainer, Tooltip as RTooltip, XAxis } from 'recharts'
import 'leaflet/dist/leaflet.css'
import L from '../../lib/leaflet-global.js'
import { api } from '../../api.js'
import { useFetch } from '../../useFetch.js'
import products from '../../data/products.json'
import { CATEGORY_KEYS } from '../../i18n/strings.js'
import HeatLayer from './HeatLayer.jsx'
import { CATEGORY_COLOR, FlowStrip, INDIA_CENTER, airhubIcon, dcIcon, num, pct } from './common.jsx'

const productById = Object.fromEntries(products.map((p) => [p.id, p]))
const DEMAND_GRADIENT = { 0.15: '#fde2f0', 0.4: '#f783ac', 0.7: '#e64980', 1: '#9f2089' }
const SELLER_GRADIENT = { 0.3: '#c5f6fa', 0.6: '#3bc9db', 1: '#0b7285' }

/** Zooms to the product's suppliers + top demand cities whenever the product changes. */
function FitProduct({ product, points }) {
  const map = useMap()
  useEffect(() => {
    if (product === 'all' || !points.length) {
      map.setView(INDIA_CENTER, 5)
      return
    }
    map.fitBounds(L.latLngBounds(points), { padding: [40, 40], maxZoom: 6 })
  }, [product, points, map])
  return null
}

export default function NetworkTab({ network }) {
  const [product, setProduct] = useState('all')
  const [layers, setLayers] = useState({ dcs: true, airhubs: true, reach: false, sellers: true, sellerHeat: false, demand: true, flows: true })
  const fc = useFetch(() => api.logistics.forecast(product), [product])
  const toggle = (k) => setLayers((l) => ({ ...l, [k]: !l[k] }))
  const ready = fc.data?.productId === product

  const sellerIds = useMemo(() => new Set(ready ? fc.data.sellerIds : []), [fc.data, ready])
  const sellers = useMemo(
    () => network.sellers.filter((s) => product === 'all' || sellerIds.has(s.id)),
    [network, product, sellerIds],
  )
  const supply = ready ? fc.data.supply : {}
  const maxSupply = Math.max(1, ...Object.values(supply))
  const top = useMemo(() => (ready ? fc.data.points.slice(0, 10) : []), [fc.data, ready])
  const topMax = Math.max(1, ...top.map((x) => x.forecast30))
  const demandPts = useMemo(() => {
    if (!ready) return []
    const pts = fc.data.points
    const max = Math.max(1, ...pts.map((p) => p.forecast30))
    return pts.filter((p) => p.forecast30 > 0).map((p) => [p.lat, p.lng, Math.max(0.06, Math.sqrt(p.forecast30 / max))])
  }, [fc.data, ready])
  const sellerPts = useMemo(() => sellers.map((s) => [s.lat, s.lng, 0.5]), [sellers])
  const fitPts = useMemo(
    () => (product === 'all' ? [] : [...sellers.map((s) => [s.lat, s.lng]), ...top.slice(0, 6).map((c) => [c.lat, c.lng])]),
    [product, sellers, top],
  )
  const topSuppliers = [...sellers].sort((a, b) => (supply[b.id] ?? 0) - (supply[a.id] ?? 0)).slice(0, 3)
  const sellerColor = (s) => CATEGORY_COLOR[productById[s.productIds[0]]?.category] ?? '#555'
  const p = productById[product]

  return (
    <div className="ops-split">
      <aside className="ops-side">
        <div className="box">
          <b>Product</b>
          <select className="ops-select" value={product} onChange={(e) => setProduct(e.target.value)}>
            <option value="all">All products</option>
            {CATEGORY_KEYS.map((c) => (
              <optgroup key={c} label={c}>
                {products.filter((x) => x.category === c).map((x) => <option key={x.id} value={x.id}>{x.name} ({x.id})</option>)}
              </optgroup>
            ))}
          </select>
          {p && <small className="muted">{p.category} · ₹{p.price} · {p.tags.join(', ') || 'regular'}</small>}
        </div>

        <div className="box">
          <b>Map layers</b>
          {[
            ['dcs', `Sort Centres & Valmo Bases (${network.dcs.length})`],
            ['airhubs', `Valmo Airhubs (${network.airhubs.length})`],
            ['reach', 'Airhub coverage around each sort centre'],
            ['sellers', product === 'all' ? `Sellers (${sellers.length})` : `Suppliers of this product (${sellers.length})`],
            ['sellerHeat', 'Seller density heat map'],
            ['demand', 'Demand forecast heat map (next 30 days)'],
            ['flows', 'Supply → demand flows (product view)'],
          ].map(([k, label]) => (
            <label key={k} className="layer-toggle">
              <input type="checkbox" checked={layers[k]} onChange={() => toggle(k)} /> {label}
            </label>
          ))}
        </div>

        {ready && (
          <div className="box">
            <b>{p ? 'Demand for this product · next 30 days' : 'Demand · next 30 days'}</b>
            <div className="fc-big">{num(fc.data.total30)} <small>orders</small></div>
            <div className="fc-row"><span>Last 90 days</span><b>{num(fc.data.past90)}</b></div>
            <div className="fc-row">
              <span>Trend (last 4 vs prior 4 weeks)</span>
              <b className={fc.data.trend >= 0 ? 'up' : 'down'}>{fc.data.trend >= 0 ? '▲' : '▼'} {pct(Math.abs(fc.data.trend))}</b>
            </div>
            <div className="fc-row"><span>Festive uplift</span><b>+{fc.data.festiveUplift}%</b></div>
            <div className="fc-row"><span>{p ? 'Suppliers' : 'Sellers'}</span><b>{fc.data.sellerIds.length}</b></div>
            <div className="fc-row">
              <span>Demand in Valmo Airhub cities</span>
              <b className={fc.data.coveredShare > 0.7 ? 'up' : 'down'}>{pct(fc.data.coveredShare)}</b>
            </div>
            <ResponsiveContainer width="100%" height={90}>
              <BarChart data={fc.data.weekly} margin={{ top: 6, right: 0, left: 0, bottom: 0 }}>
                <XAxis dataKey="week" tick={{ fontSize: 10 }} />
                <RTooltip formatter={(v) => num(v) + ' orders'} />
                <Bar dataKey="orders" fill="#9f2089" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
            <b className="mt">Top demand cities</b>
            <ol className="top-cities">
              {top.slice(0, 8).map((c) => (
                <li key={c.cityId}>
                  <span className="tc-name">{c.name} <small>T{c.tier}</small></span>
                  <span className="tc-bar"><i style={{ width: `${(c.forecast30 / topMax) * 100}%` }} /></span>
                  <span className="tc-val">{num(c.forecast30)}</span>
                </li>
              ))}
            </ol>
            {p && topSuppliers.length > 0 && (
              <>
                <b className="mt">Top suppliers</b>
                <ol className="top-cities">
                  {topSuppliers.map((s) => (
                    <li key={s.id}>
                      <span className="tc-name">{s.name} <small>{s.city}</small></span>
                      <span className="tc-bar"><i className="sup" style={{ width: `${((supply[s.id] ?? 0) / maxSupply) * 100}%` }} /></span>
                      <span className="tc-val">{num(supply[s.id] ?? 0)}</span>
                    </li>
                  ))}
                </ol>
              </>
            )}
            <small className="muted">Forecast = weighted moving average of 8 weeks + trend + festive uplift; city split from this product's own orders, lightly smoothed.</small>
          </div>
        )}
      </aside>

      <div className="ops-main">
        <FlowStrip />
        <div className="ops-map">
          <MapContainer center={INDIA_CENTER} zoom={5} minZoom={4} style={{ height: '100%', width: '100%' }}>
            <TileLayer attribution="&copy; OpenStreetMap contributors" url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
            <FitProduct product={product} points={fitPts} />
            {layers.demand && <HeatLayer key={'d' + product} points={demandPts} radius={26} blur={20} gradient={DEMAND_GRADIENT} />}
            {layers.sellerHeat && <HeatLayer key={'s' + product} points={sellerPts} radius={26} blur={20} gradient={SELLER_GRADIENT} />}
            {layers.reach && network.dcs.map((d) => (
              <Circle key={'r' + d.id} center={[d.lat, d.lng]} radius={(d.airhubKm / 1.25) * 1000} pathOptions={{ color: '#9f2089', weight: 1, fillOpacity: 0.05, dashArray: '4 4' }} />
            ))}
            {layers.flows && p && topSuppliers.flatMap((s) => top.slice(0, 5).map((c) => (
              <Polyline key={s.id + c.cityId} positions={[[s.lat, s.lng], [c.lat, c.lng]]} pathOptions={{ color: '#f43397', weight: 1.5, opacity: 0.45, dashArray: '5 6' }} />
            )))}
            {p && top.slice(0, 10).map((c, i) => (
              <CircleMarker key={'c' + c.cityId} center={[c.lat, c.lng]} radius={6 + (c.forecast30 / topMax) * 14} pathOptions={{ color: '#9f2089', weight: 2, fillColor: '#f43397', fillOpacity: 0.25 }}>
                <Tooltip direction="top" permanent={i < 3}>{c.name}: {num(c.forecast30)}</Tooltip>
              </CircleMarker>
            ))}
            {layers.airhubs && network.airhubs.map((a) => (
              <Marker key={a.id} position={[a.lat, a.lng]} icon={airhubIcon}>
                <Tooltip>{a.name} → {a.sc.slice(3)} ({a.scKm} km)</Tooltip>
              </Marker>
            ))}
            {layers.sellers && sellers.map((s) => {
              const r = p ? 6 + ((supply[s.id] ?? 0) / maxSupply) * 12 : s.featured ? 7 : 5
              return (
                <CircleMarker key={s.id} center={[s.lat, s.lng]} radius={r} pathOptions={{ color: '#fff', weight: p ? 2 : 1, fillColor: p ? '#0ca678' : sellerColor(s), fillOpacity: 0.9 }}>
                  <Tooltip>
                    <b>{s.name}</b> · {s.city}<br />
                    {p ? `${num(supply[s.id] ?? 0)} orders of this product (90 days)` : `${s.products} products · ${num(s.orders90)} orders (90 days)`}<br />
                    {s.airhub ? `Picked up via Airhub ${s.airhub}` : 'No Valmo Airhub nearby — 3PL pickup'}
                  </Tooltip>
                </CircleMarker>
              )
            })}
            {layers.dcs && network.dcs.map((d) => (
              <Marker key={d.id} position={[d.lat, d.lng]} icon={dcIcon(d)}>
                <Tooltip>
                  <b>{d.name}</b><br />
                  {d.typeLabel} · sort fee ₹{d.sortFee}/parcel · serves Airhubs within {d.airhubKm} km<br />
                  Contracted line haul: {d.fleet?.t32 ?? 0} × 32 ft · {d.fleet?.t19 ?? 0} × 19 ft · {d.fleet?.t14 ?? 0} × 14 ft
                </Tooltip>
              </Marker>
            ))}
          </MapContainer>
          {p && <div className="product-banner">Product view: <b>{p.name}</b> · {sellers.length} suppliers · busiest demand in {top.slice(0, 3).map((c) => c.name).join(', ')}</div>}
          <div className="map-legend">
            <span><i className="lg dc-sort" /> Sort Centre</span>
            <span><i className="lg dc-hub" /> Valmo Base</span>
            <span><i className="lg ah" /> Airhub</span>
            {p ? <span><i className="lg dot" style={{ background: '#0ca678' }} /> Supplier (size = sales)</span> : Object.entries(CATEGORY_COLOR).map(([c, col]) => (
              <span key={c}><i className="lg dot" style={{ background: col }} /> {c}</span>
            ))}
            <span><i className="lg heat" /> Forecast demand</span>
          </div>
        </div>
      </div>
    </div>
  )
}
