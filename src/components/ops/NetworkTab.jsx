import { useMemo, useState } from 'react'
import { Circle, CircleMarker, MapContainer, Marker, TileLayer, Tooltip } from 'react-leaflet'
import { Bar, BarChart, ResponsiveContainer, Tooltip as RTooltip, XAxis } from 'recharts'
import 'leaflet/dist/leaflet.css'
import { api } from '../../api.js'
import { useFetch } from '../../useFetch.js'
import products from '../../data/products.json'
import { CATEGORY_KEYS } from '../../i18n/strings.js'
import HeatLayer from './HeatLayer.jsx'
import { CATEGORY_COLOR, INDIA_CENTER, dcIcon, num, pct } from './common.jsx'

const productById = Object.fromEntries(products.map((p) => [p.id, p]))
const DEMAND_GRADIENT = { 0.2: '#fde2f0', 0.45: '#f783ac', 0.7: '#e64980', 1: '#9f2089' }
const SELLER_GRADIENT = { 0.3: '#c5f6fa', 0.6: '#3bc9db', 1: '#0b7285' }

export default function NetworkTab({ network }) {
  const [product, setProduct] = useState('all')
  const [layers, setLayers] = useState({ dcs: true, reach: false, sellers: true, sellerHeat: false, demand: true })
  const fc = useFetch(() => api.logistics.forecast(product), [product])
  const toggle = (k) => setLayers((l) => ({ ...l, [k]: !l[k] }))

  const sellerIds = useMemo(() => new Set(fc.data?.sellerIds ?? []), [fc.data])
  const sellers = useMemo(
    () => network.sellers.filter((s) => product === 'all' || sellerIds.has(s.id)),
    [network, product, sellerIds],
  )
  const demandPts = useMemo(() => {
    const pts = fc.data?.points ?? []
    const max = Math.max(1, ...pts.map((p) => p.forecast30))
    return pts.filter((p) => p.forecast30 > 0).map((p) => [p.lat, p.lng, Math.max(0.08, p.forecast30 / max)])
  }, [fc.data])
  const sellerPts = useMemo(() => sellers.map((s) => [s.lat, s.lng, 0.5]), [sellers])
  const sellerColor = (s) => CATEGORY_COLOR[productById[s.productIds[0]]?.category] ?? '#555'
  const p = productById[product]
  const top = fc.data?.points.slice(0, 8) ?? []
  const topMax = Math.max(1, ...top.map((x) => x.forecast30))

  return (
    <div className="ops-split">
      <aside className="ops-side">
        <div className="box">
          <b>Product</b>
          <select className="ops-select" value={product} onChange={(e) => setProduct(e.target.value)}>
            <option value="all">All products</option>
            {CATEGORY_KEYS.map((c) => (
              <optgroup key={c} label={c}>
                {products.filter((x) => x.category === c).map((x) => (
                  <option key={x.id} value={x.id}>{x.name} ({x.id})</option>
                ))}
              </optgroup>
            ))}
          </select>
          {p && <small className="muted">{p.category} · ₹{p.price} · {p.tags.join(', ') || 'regular'}</small>}
        </div>

        <div className="box">
          <b>Map layers</b>
          {[
            ['dcs', `Valmo distribution centres (${network.dcs.length})`],
            ['reach', 'Valmo last-mile reach'],
            ['sellers', `Seller locations (${sellers.length})`],
            ['sellerHeat', 'Seller density heat map'],
            ['demand', 'Demand forecast heat map (next 30 days)'],
          ].map(([k, label]) => (
            <label key={k} className="layer-toggle">
              <input type="checkbox" checked={layers[k]} onChange={() => toggle(k)} /> {label}
            </label>
          ))}
        </div>

        {fc.data && (
          <div className="box">
            <b>Demand forecast · next 30 days</b>
            <div className="fc-big">{num(fc.data.total30)} <small>orders</small></div>
            <div className="fc-row">
              <span>Last 90 days</span><b>{num(fc.data.past90)}</b>
            </div>
            <div className="fc-row">
              <span>Trend (last 4 vs prior 4 weeks)</span>
              <b className={fc.data.trend >= 0 ? 'up' : 'down'}>{fc.data.trend >= 0 ? '▲' : '▼'} {pct(Math.abs(fc.data.trend))}</b>
            </div>
            <div className="fc-row"><span>Diwali / season uplift</span><b>+{fc.data.festiveUplift}%</b></div>
            <div className="fc-row"><span>Sellers stocking it</span><b>{fc.data.sellerIds.length}</b></div>
            <div className="fc-row">
              <span>Demand inside Valmo last-mile reach</span>
              <b className={fc.data.coveredShare > 0.6 ? 'up' : 'down'}>{pct(fc.data.coveredShare)}</b>
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
              {top.map((c) => (
                <li key={c.cityId}>
                  <span className="tc-name">{c.name} <small>T{c.tier}</small></span>
                  <span className="tc-bar"><i style={{ width: `${(c.forecast30 / topMax) * 100}%` }} /></span>
                  <span className="tc-val">{num(c.forecast30)}</span>
                </li>
              ))}
            </ol>
            <small className="muted">Forecast = weighted moving average of 8 weeks + trend + festive uplift; city split smoothed toward the overall city mix.</small>
          </div>
        )}
      </aside>

      <div className="ops-map">
        <MapContainer center={INDIA_CENTER} zoom={5} minZoom={4} style={{ height: '100%', width: '100%' }}>
          <TileLayer attribution="&copy; OpenStreetMap contributors" url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
          {layers.demand && <HeatLayer points={demandPts} radius={24} blur={18} gradient={DEMAND_GRADIENT} />}
          {layers.sellerHeat && <HeatLayer points={sellerPts} radius={26} blur={20} gradient={SELLER_GRADIENT} />}
          {layers.reach && network.dcs.map((d) => (
            <Circle key={'r' + d.id} center={[d.lat, d.lng]} radius={(d.lastMileKm / 1.25) * 1000} pathOptions={{ color: '#9f2089', weight: 1, fillOpacity: 0.06, dashArray: '4 4' }} />
          ))}
          {layers.sellers && sellers.map((s) => (
            <CircleMarker key={s.id} center={[s.lat, s.lng]} radius={s.featured ? 7 : 5} pathOptions={{ color: '#fff', weight: 1, fillColor: sellerColor(s), fillOpacity: 0.9 }}>
              <Tooltip>
                <b>{s.name}</b> · {s.city}<br />
                {s.products} products · rating {s.rating}<br />
                {num(s.orders90)} orders (90 days)
              </Tooltip>
            </CircleMarker>
          ))}
          {layers.dcs && network.dcs.map((d) => (
            <Marker key={d.id} position={[d.lat, d.lng]} icon={dcIcon(d)}>
              <Tooltip>
                <b>{d.name}</b><br />
                {d.typeLabel} · reach {d.lastMileKm} km<br />
                Fleet: {d.fleet?.bike} bikes · {d.fleet?.van} vans · {d.fleet?.truck} trucks
              </Tooltip>
            </Marker>
          ))}
        </MapContainer>
        <div className="map-legend">
          <span><i className="lg dc-sort" /> Sort centre</span>
          <span><i className="lg dc-hub" /> Hub</span>
          {Object.entries(CATEGORY_COLOR).map(([c, col]) => (
            <span key={c}><i className="lg dot" style={{ background: col }} /> {c}</span>
          ))}
          <span><i className="lg heat" /> Forecast demand</span>
        </div>
      </div>
    </div>
  )
}
