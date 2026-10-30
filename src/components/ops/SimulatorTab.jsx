import { useState } from 'react'
import { Circle, MapContainer, Marker, TileLayer, Tooltip, useMapEvents } from 'react-leaflet'
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip as RTooltip, XAxis, YAxis } from 'recharts'
import { api } from '../../api.js'
import { INDIA_CENTER, Kpi, airhubIcon, dcIcon, money, num, pct } from './common.jsx'

const siteName = (type, city) => (type === 'sort' ? `Valmo Sort Centre, ${city}` : `Valmo Base, ${city}`)
const distance = (a, b) => Math.hypot(a.lat - b.lat, (a.lng - b.lng) * Math.cos((a.lat * Math.PI) / 180))

function ClickToAdd({ onAdd }) {
  useMapEvents({ click: (e) => onAdd(e.latlng) })
  return null
}

export default function SimulatorTab({ network }) {
  const [proposals, setProposals] = useState([])
  const [days, setDays] = useState(30)
  const [result, setResult] = useState(null)
  const [busy, setBusy] = useState(null)
  const [suggestions, setSuggestions] = useState(null)

  const nearestCity = (pt) => [...network.cities].sort((a, b) => distance(a, pt) - distance(b, pt))[0]
  const add = (pt, type = 'hub') => {
    const c = nearestCity(pt)
    setProposals((p) => [
      ...p,
      { id: 'NEW-' + Date.now(), city: c.name, name: siteName(type, c.name), type, lat: pt.lat, lng: pt.lng, fixedMonthly: network.dcTypes[type].fixedMonthly },
    ])
    setResult(null)
  }
  const update = (id, patch) => {
    setProposals((p) => p.map((x) => (x.id === id ? { ...x, ...patch } : x)))
    setResult(null)
  }
  const remove = (id) => {
    setProposals((p) => p.filter((x) => x.id !== id))
    setResult(null)
  }
  const run = async () => {
    setBusy('sim')
    setResult(await api.logistics.simulate({ newDcs: proposals, days }))
    setBusy(null)
  }
  const suggest = async () => {
    setBusy('suggest')
    setSuggestions(await api.logistics.suggest({ type: 'hub', days: 30 }))
    setBusy(null)
  }

  const good = result && result.net > 0
  return (
    <div className="ops-split">
      <aside className="ops-side">
        <div className="box">
          <b>🧪 New sort centre / Valmo Base scenario</b>
          <small className="muted">Click anywhere on the map to drop a new Valmo Base or Sort Centre. New Airhubs open in cities it can serve; then past orders are replayed through the 5-stage model to see whether total logistics cost goes up or down.</small>
          {proposals.length === 0 && <div className="empty-hint">No DCs added yet — click the map.</div>}
          {proposals.map((p) => (
            <div key={p.id} className="proposal">
              <div className="proposal-head">
                <b>📍 {p.city}</b>
                <button className="link" onClick={() => remove(p.id)}>Remove</button>
              </div>
              <div className="form-row tight">
                <label>Type
                  <select value={p.type} onChange={(e) => update(p.id, { type: e.target.value, fixedMonthly: network.dcTypes[e.target.value].fixedMonthly, name: siteName(e.target.value, p.city) })}>
                    {Object.entries(network.dcTypes).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                  </select>
                </label>
                <label>Fixed cost / month (₹ lakh)
                  <input type="number" min="0" value={p.fixedMonthly / 1e5} onChange={(e) => update(p.id, { fixedMonthly: Math.max(0, +e.target.value || 0) * 1e5 })} />
                </label>
              </div>
            </div>
          ))}
          <div className="seg wide">
            {[[30, 'Past 1 month'], [180, 'Past 6 months']].map(([d, l]) => (
              <button key={d} className={days === d ? 'sel' : ''} onClick={() => { setDays(d); setResult(null) }}>{l}</button>
            ))}
          </div>
          <button className="btn-primary wide" disabled={!proposals.length || busy} onClick={run}>{busy === 'sim' ? 'Replaying orders…' : 'Run simulation'}</button>
        </div>

        <div className="box">
          <b>💡 Where should the next Valmo Base go?</b>
          <small className="muted">Shortlists cities with uncovered demand or suppliers, replays the last 2 weeks with a Valmo Base there and ranks them by monthly saving after fixed cost.</small>
          <button className="btn-outline wide" disabled={!!busy} onClick={suggest}>{busy === 'suggest' ? 'Testing every city…' : 'Suggest best locations'}</button>
          {suggestions && (
            <ol className="suggest-list">
              {suggestions.results.map((s, i) => (
                <li key={s.cityId}>
                  <span className="rank">{i + 1}</span>
                  <span className="sg-name"><b>{s.name}</b><small>{s.state} · {num(s.ordersPerDay)} orders/day</small></span>
                  <span className={'sg-net ' + (s.net > 0 ? 'up' : 'down')}>{money(s.net)}<small>/ month net</small></span>
                  <button className="btn-mini" onClick={() => add({ lat: s.lat, lng: s.lng })}>+ Add</button>
                </li>
              ))}
            </ol>
          )}
        </div>
      </aside>

      <div className="ops-main">
        <div className="ops-map short">
          <MapContainer center={INDIA_CENTER} zoom={5} minZoom={4} style={{ height: '100%', width: '100%' }}>
            <TileLayer attribution="&copy; OpenStreetMap contributors" url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
            <ClickToAdd onAdd={add} />
            {network.dcs.map((d) => (
              <Marker key={d.id} position={[d.lat, d.lng]} icon={dcIcon(d)}><Tooltip>{d.name}</Tooltip></Marker>
            ))}
            {network.dcs.map((d) => (
              <Circle key={'r' + d.id} center={[d.lat, d.lng]} radius={(d.airhubKm / 1.25) * 1000} pathOptions={{ color: '#9f2089', weight: 1, fillOpacity: 0.04, dashArray: '4 4' }} />
            ))}
            {network.airhubs.map((a) => <Marker key={a.id} position={[a.lat, a.lng]} icon={airhubIcon}><Tooltip>{a.name}</Tooltip></Marker>)}
            {suggestions?.results.map((s, i) => (
              <Marker key={'s' + s.cityId} position={[s.lat, s.lng]} icon={dcIcon({ type: 'hub' }, 'cand', String(i + 1))}>
                <Tooltip>#{i + 1} {s.name}: {money(s.net)} / month net</Tooltip>
              </Marker>
            ))}
            {proposals.map((p) => [
              <Marker key={p.id} position={[p.lat, p.lng]} icon={dcIcon(p, 'new', '+')}><Tooltip permanent direction="top">New: {p.city}</Tooltip></Marker>,
              <Circle key={p.id + 'r'} center={[p.lat, p.lng]} radius={(network.dcTypes[p.type].airhubKm / 1.25) * 1000} pathOptions={{ color: '#f76707', weight: 2, fillOpacity: 0.08 }} />,
            ])}
          </MapContainer>
        </div>

        {result && (
          <div className="box">
            <div className={'verdict ' + (good ? 'good' : 'bad')}>
              {good ? '✅' : '⚠️'} Over the past {days === 30 ? 'month' : '6 months'}, {proposals.map((p) => p.city).join(' + ')} would have{' '}
              <b>{good ? 'reduced' : 'increased'} Meesho's logistics cost by {money(Math.abs(result.net))}</b> ({pct(Math.abs(result.netPct), 2)}) after fixed costs.
              {good ? ' Recommend building.' : ' Fixed cost outweighs the savings here.'}
            </div>
            <div className="kpis">
              <Kpi label="Current network cost" value={money(result.baseline.cost)} sub={`₹${result.baseline.perOrder.toFixed(1)} / order`} />
              <Kpi label="With new DC (variable)" value={money(result.scenario.cost)} sub={`₹${result.scenario.perOrder.toFixed(1)} / order`} />
              <Kpi label="New DC fixed cost" value={money(result.fixed)} sub={`${days / 30} month(s)`} />
              <Kpi label="Net impact" value={(good ? '' : '+') + money(-result.net)} sub={good ? 'saving' : 'extra cost'} tone={good ? 'green' : 'red'} />
              <Kpi label="Orders on Valmo network" value={pct(result.valmoShare.scenario)} sub={`was ${pct(result.valmoShare.baseline)} · +${result.newAirhubs.length} Airhubs`} tone="purple" />
            </div>
            <div className="sim-grid">
              <div>
                <b>Monthly logistics cost (incl. fixed)</b>
                <ResponsiveContainer width="100%" height={230}>
                  <BarChart data={result.monthly} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#eee" />
                    <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                    <YAxis tickFormatter={(v) => '₹' + Math.round(v / 1e7) + 'Cr'} tick={{ fontSize: 12 }} width={56} />
                    <RTooltip formatter={(v) => money(v)} />
                    <Legend />
                    <Bar dataKey="baseline" name="Current network" fill="#adb5bd" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="scenario" name="With new DC" fill={good ? '#0ca678' : '#e03131'} radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div>
                <b>New DC performance</b>
                <table className="sku-table">
                  <thead><tr><th>New site</th><th>Parcels/day</th><th>Contracted trucks (auto-sized)</th><th>Truck fill</th></tr></thead>
                  <tbody>
                    {result.newDcStats.map((u) => (
                      <tr key={u.id}>
                        <td>{u.name.replace('Valmo ', '')}</td>
                        <td>{num(u.orders)}</td>
                        <td>{u.fleet ? `${u.fleet.t32} × 32 ft · ${u.fleet.t19} × 19 ft · ${u.fleet.t14} × 14 ft` : '—'}</td>
                        <td>{u.fill == null ? '—' : <span className={'pill ' + (u.fill > 0.75 ? 'green' : u.fill > 0.5 ? 'amber' : 'red')}>{pct(u.fill)}</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <small className="muted">Same orders, same sellers, same customers — only the network changes. Each run re-optimises every day with the optimiser from the previous tab.</small>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
