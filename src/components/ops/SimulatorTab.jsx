import { useEffect, useState } from 'react'
import { Circle, MapContainer, Marker, TileLayer, Tooltip, useMapEvents } from 'react-leaflet'
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip as RTooltip, XAxis, YAxis } from 'recharts'
import { api } from '../../api.js'
import { INDIA_CENTER, Kpi, airhubIcon, dcIcon, money, num, pct, utilTone } from './common.jsx'

const siteName = (type, city) => (type === 'sort' ? `Valmo Sort Centre, ${city}` : `Valmo Base, ${city}`)
const distance = (a, b) => Math.hypot(a.lat - b.lat, (a.lng - b.lng) * Math.cos((a.lat * Math.PI) / 180))
const short = (name) => name.replace('Valmo ', '')

function ClickToAdd({ onAdd }) {
  useMapEvents({ click: (e) => onAdd(e.latlng) })
  return null
}

/** Number box you can type into freely; the value is clamped to [min, max] when you leave it or press Enter. */
function NumInput({ value, onCommit, min, max = Infinity, step, className }) {
  const [raw, setRaw] = useState(String(value))
  useEffect(() => setRaw(String(value)), [value])
  const commit = () => {
    const v = Math.min(max, Math.max(min, Math.round(+raw || 0)))
    setRaw(String(v))
    if (v !== value) onCommit(v)
  }
  return (
    <input className={className} type="number" min={min} max={max === Infinity ? undefined : max} step={step} value={raw}
      onChange={(e) => setRaw(e.target.value)} onBlur={commit} onKeyDown={(e) => e.key === 'Enter' && commit()} />
  )
}

/** Delivery-radius slider + number box, kept within the practical range. */
function RadiusInput({ value, onChange, min, max }) {
  return (
    <span className="radius-input">
      <input type="range" min={min} max={max} step="1" value={value} onChange={(e) => onChange(+e.target.value)} />
      <NumInput value={value} min={min} max={max} onCommit={onChange} />
      <small>km</small>
    </span>
  )
}

export default function SimulatorTab({ network }) {
  const [dcs, setDcs] = useState(network.dcs) // saved network (refreshed after "save")
  const [proposals, setProposals] = useState([])
  const [edits, setEdits] = useState({})
  const [days, setDays] = useState(30)
  const [result, setResult] = useState(null)
  const [busy, setBusy] = useState(null)
  const [suggestions, setSuggestions] = useState(null)
  const [saved, setSaved] = useState(false)
  const { min, max } = network.model.radius
  const rate = network.model.cost.capacityCostPerItemMonth

  const val = (d, k) => edits[d.id]?.[k] ?? d[k]
  const edited = (d) => val(d, 'capacity') !== d.capacity || val(d, 'radiusKm') !== d.radiusKm
  const editCount = dcs.filter(edited).length
  const before = Object.fromEntries((result?.sites ?? []).map((s) => [s.id, s.before]))

  const nearestCity = (pt) => [...network.cities].sort((a, b) => distance(a, pt) - distance(b, pt))[0]
  const add = (pt, type = 'hub') => {
    const c = nearestCity(pt)
    const t = network.dcTypes[type]
    setProposals((p) => [
      ...p,
      { id: 'NEW-' + Date.now(), city: c.name, name: siteName(type, c.name), type, lat: pt.lat, lng: pt.lng, fixedMonthly: t.fixedMonthly, capacity: t.capacity, radiusKm: t.radiusKm },
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
  const editSite = (id, patch) => {
    setEdits((e) => ({ ...e, [id]: { ...e[id], ...patch } }))
    setResult(null)
    setSaved(false)
  }
  const resetSite = (id) => {
    setEdits((e) => {
      const { [id]: _drop, ...rest } = e // eslint-disable-line no-unused-vars
      return rest
    })
    setResult(null)
  }
  const changes = () => Object.fromEntries(dcs.filter(edited).map((d) => [d.id, { capacity: val(d, 'capacity'), radiusKm: val(d, 'radiusKm') }]))
  const run = async () => {
    setBusy('sim')
    setResult(await api.logistics.simulate({ newDcs: proposals, edits: changes(), days }))
    setBusy(null)
  }
  const saveSites = async () => {
    setBusy('save')
    const r = await api.logistics.sites({ edits: changes() })
    setDcs(r.dcs)
    setEdits({})
    setResult(null)
    setSaved(true)
    setBusy(null)
  }
  const suggest = async () => {
    setBusy('suggest')
    setSuggestions(await api.logistics.suggest({ type: 'hub', days: 30 }))
    setBusy(null)
  }

  const good = result && result.net > 0
  const what = [
    ...proposals.map((p) => `a new ${network.dcTypes[p.type].label} at ${p.city}`),
    ...(editCount ? [`changes to ${editCount} existing site${editCount > 1 ? 's' : ''}`] : []),
  ].join(' + ')
  return (
    <div className="ops-split">
      <aside className="ops-side">
        <div className="box">
          <b>🧪 Network scenario</b>
          <small className="muted">Add new sites by clicking the map, and/or change the storage capacity or delivery radius of existing ones below. Past orders are then replayed through the 5-stage model to see whether total logistics cost goes up or down.</small>
          {proposals.length === 0 && <div className="empty-hint">No new sites — click the map to add one.</div>}
          {proposals.map((p) => (
            <div key={p.id} className="proposal">
              <div className="proposal-head">
                <b>📍 New: {p.city}</b>
                <button className="link" onClick={() => remove(p.id)}>Remove</button>
              </div>
              <div className="form-row tight">
                <label>Type
                  <select value={p.type} onChange={(e) => { const t = network.dcTypes[e.target.value]; update(p.id, { type: e.target.value, fixedMonthly: t.fixedMonthly, capacity: t.capacity, radiusKm: t.radiusKm, name: siteName(e.target.value, p.city) }) }}>
                    {Object.entries(network.dcTypes).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                  </select>
                </label>
                <label>Fixed cost / month (₹ lakh)
                  <input type="number" min="0" value={p.fixedMonthly / 1e5} onChange={(e) => update(p.id, { fixedMonthly: Math.max(0, +e.target.value || 0) * 1e5 })} />
                </label>
                <label>Storage capacity (items)
                  <NumInput value={p.capacity} min={1000} step={5000} onCommit={(v) => update(p.id, { capacity: v })} />
                </label>
                <label>Delivery radius
                  <RadiusInput value={p.radiusKm} min={min} max={max} onChange={(v) => update(p.id, { radiusKm: v })} />
                </label>
              </div>
            </div>
          ))}
          <div className="seg wide">
            {[[30, 'Past 1 month'], [180, 'Past 6 months']].map(([d, l]) => (
              <button key={d} className={days === d ? 'sel' : ''} onClick={() => { setDays(d); setResult(null) }}>{l}</button>
            ))}
          </div>
          <button className="btn-primary wide" disabled={(!proposals.length && !editCount) || !!busy} onClick={run}>{busy === 'sim' ? 'Replaying orders…' : 'Run simulation'}</button>
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
            {dcs.map((d) => (
              <Circle key={'a' + d.id} center={[d.lat, d.lng]} radius={(d.airhubKm / 1.25) * 1000} pathOptions={{ color: '#9f2089', weight: 1, opacity: 0.35, fillOpacity: 0.02, dashArray: '4 4' }} />
            ))}
            {dcs.map((d) => (
              <Circle key={'r' + d.id + val(d, 'radiusKm')} center={[d.lat, d.lng]} radius={val(d, 'radiusKm') * 1000} pathOptions={{ color: edited(d) ? '#f76707' : '#0ca678', weight: 2, fillOpacity: 0.25 }}>
                <Tooltip>{short(d.name)} · direct delivery {val(d, 'radiusKm')} km</Tooltip>
              </Circle>
            ))}
            {dcs.map((d) => (
              <Marker key={d.id} position={[d.lat, d.lng]} icon={dcIcon(d)}>
                <Tooltip>{d.name} · {num(val(d, 'capacity'))} items · {val(d, 'radiusKm')} km radius</Tooltip>
              </Marker>
            ))}
            {network.airhubs.map((a) => <Marker key={a.id} position={[a.lat, a.lng]} icon={airhubIcon}><Tooltip>{a.name}</Tooltip></Marker>)}
            {suggestions?.results.map((s, i) => (
              <Marker key={'s' + s.cityId} position={[s.lat, s.lng]} icon={dcIcon({ type: 'hub' }, 'cand', String(i + 1))}>
                <Tooltip>#{i + 1} {s.name}: {money(s.net)} / month net</Tooltip>
              </Marker>
            ))}
            {proposals.map((p) => [
              <Marker key={p.id} position={[p.lat, p.lng]} icon={dcIcon(p, 'new', '+')}><Tooltip permanent direction="top">New: {p.city}</Tooltip></Marker>,
              <Circle key={p.id + 'a'} center={[p.lat, p.lng]} radius={(network.dcTypes[p.type].airhubKm / 1.25) * 1000} pathOptions={{ color: '#f76707', weight: 1, dashArray: '4 4', fillOpacity: 0.04 }} />,
              <Circle key={p.id + 'r' + p.radiusKm} center={[p.lat, p.lng]} radius={p.radiusKm * 1000} pathOptions={{ color: '#f76707', weight: 2, fillOpacity: 0.3 }} />,
            ])}
          </MapContainer>
        </div>
        <small className="muted map-legend">Solid circle = direct-delivery radius ({min}–{max} km, edit below; orange = changed). Dashed ring = Airhubs the site feeds.</small>

        <div className="box">
          <div className="box-head">
            <b>🏭 Existing sites: storage capacity & delivery radius</b>
            <div className="row-gap">
              {editCount > 0 && <button className="btn-outline sm" disabled={!!busy} onClick={() => { setEdits({}); setResult(null) }}>Undo all</button>}
              <button className="btn-primary sm" disabled={!editCount || !!busy} onClick={saveSites}>{busy === 'save' ? 'Saving…' : 'Save as current network'}</button>
            </div>
          </div>
          <small className="muted">
            Capacity = items the site can hold on its floor at the nightly peak (the night feeder brings a day's parcels in together). Above it, every parcel through the site pays up to ₹{network.model.cost.overflowFee} congestion (overtime, temporary space, double handling) and the optimiser routes around it. Extra space costs ₹{rate} per item per month. Customers inside the delivery radius get parcels straight from the site, with no Airhub hop, but riders cover longer routes.
            {saved && <b className="green"> Saved — the optimiser and batch analysis now use these settings.</b>}
          </small>
          <div className="table-wrap">
            <table className="sku-table site-table">
              <thead><tr><th>Site</th><th>Storage capacity (items)</th><th>Peak use{result ? ' (now → scenario)' : ''}</th><th>Direct-delivery radius</th><th /></tr></thead>
              <tbody>
                {dcs.map((d) => {
                  const after = result?.sites.find((s) => s.id === d.id)?.after
                  const b = before[d.id]
                  const delta = val(d, 'capacity') - d.capacity
                  return (
                    <tr key={d.id} className={edited(d) ? 'edited' : ''}>
                      <td><b>{short(d.name)}</b><small className="muted block">{d.typeLabel}</small></td>
                      <td>
                        <NumInput className="fleet-input wide" value={val(d, 'capacity')} min={1000} step={5000} onCommit={(v) => editSite(d.id, { capacity: v })} />
                        {delta !== 0 && <small className={'block ' + (delta > 0 ? 'down' : 'green')}>{delta > 0 ? '+' : ''}{num(delta)} · {delta > 0 ? '+' : '−'}{money(Math.abs(delta) * rate)}/mo</small>}
                      </td>
                      <td>
                        {b ? (
                          <>
                            <span className={'pill ' + utilTone(b.capUse)}>{pct(b.capUse)}</span>
                            {after && <> → <span className={'pill ' + utilTone(after.capUse)}>{pct(after.capUse)}</span></>}
                            <small className="muted block">{num(after?.itemsHeld ?? b.itemsHeld)} items at peak</small>
                          </>
                        ) : <small className="muted">run to see</small>}
                      </td>
                      <td><RadiusInput value={val(d, 'radiusKm')} min={min} max={max} onChange={(v) => editSite(d.id, { radiusKm: v })} /></td>
                      <td>{edited(d) && <button className="link" onClick={() => resetSite(d.id)}>Undo</button>}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>

        {result && (
          <div className="box">
            <div className={'verdict ' + (good ? 'good' : 'bad')}>
              {good ? '✅' : '⚠️'} Over the past {days === 30 ? 'month' : '6 months'}, {what} would have{' '}
              <b>{good ? 'reduced' : 'increased'} Meesho's logistics cost by {money(Math.abs(result.net))}</b> ({pct(Math.abs(result.netPct), 2)}) after fixed costs.
              {good ? ' Recommend the move.' : ' The extra fixed cost outweighs the savings here.'}
            </div>
            <div className="kpis">
              <Kpi label="Current network cost" value={money(result.baseline.cost)} sub={`₹${result.baseline.perOrder.toFixed(1)} / order`} />
              <Kpi label="After the change (variable)" value={money(result.scenario.cost)} sub={`₹${result.scenario.perOrder.toFixed(1)} / order`} />
              <Kpi label="Fixed cost" value={money(result.fixed)} sub={[result.newFixed ? `new sites ${money(result.newFixed)}` : null, result.capacityCost ? `capacity ${money(result.capacityCost)}` : null].filter(Boolean).join(' · ') || `${days / 30} month(s)`} />
              <Kpi label="Net impact" value={(good ? '' : '+') + money(-result.net)} sub={good ? 'saving' : 'extra cost'} tone={good ? 'green' : 'red'} />
              <Kpi label="Congestion cost" value={money(result.scenario.congestion)} sub={`was ${money(result.baseline.congestion)}`} tone={result.scenario.congestion < result.baseline.congestion ? 'green' : ''} />
              <Kpi label="Orders on Valmo network" value={pct(result.valmoShare.scenario)} sub={`was ${pct(result.valmoShare.baseline)}${result.newAirhubs.length ? ` · +${result.newAirhubs.length} Airhubs` : ''}`} tone="purple" />
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
                    <Bar dataKey="scenario" name="After the change" fill={good ? '#0ca678' : '#e03131'} radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div>
                {result.newDcStats.length > 0 && (
                  <>
                    <b>New site performance</b>
                    <table className="sku-table">
                      <thead><tr><th>New site</th><th>Parcels/day</th><th>Peak storage use</th><th>Contracted trucks (auto-sized)</th><th>Truck fill</th></tr></thead>
                      <tbody>
                        {result.newDcStats.map((u) => (
                          <tr key={u.id}>
                            <td>{short(u.name)}</td>
                            <td>{num(u.orders)}</td>
                            <td><span className={'pill ' + utilTone(u.capUse)}>{pct(u.capUse)}</span><small className="muted block">{num(u.itemsHeld)} / {num(u.capacity)}</small></td>
                            <td>{u.fleet ? `${u.fleet.t32} × 32 ft · ${u.fleet.t19} × 19 ft · ${u.fleet.t14} × 14 ft` : '—'}</td>
                            <td>{u.fill == null ? '—' : <span className={'pill ' + (u.fill > 0.75 ? 'green' : u.fill > 0.5 ? 'amber' : 'red')}>{pct(u.fill)}</span>}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </>
                )}
                {result.siteChanges.length > 0 && (
                  <>
                    <b className="mt">Changed sites: before → after</b>
                    <table className="sku-table">
                      <thead><tr><th>Site</th><th>Capacity</th><th>Peak use</th><th>Congestion / day</th><th>Radius</th><th>Direct deliveries / day</th></tr></thead>
                      <tbody>
                        {result.siteChanges.map(({ before: b, after: a }) => (
                          <tr key={a.id}>
                            <td>{short(a.name)}</td>
                            <td>{num(b.capacity)} → <b>{num(a.capacity)}</b></td>
                            <td><span className={'pill ' + utilTone(b.capUse)}>{pct(b.capUse)}</span> → <span className={'pill ' + utilTone(a.capUse)}>{pct(a.capUse)}</span></td>
                            <td>{money(b.congestionPerDay)} → <b>{money(a.congestionPerDay)}</b></td>
                            <td>{b.radiusKm} → <b>{a.radiusKm} km</b></td>
                            <td>{num(b.directPerDay)} → <b>{num(a.directPerDay)}</b></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </>
                )}
                <small className="muted">Same orders, same sellers, same customers — only the network changes. Each run re-optimises every day with the optimiser from the Logistics optimiser tab, including your contracted fleet.</small>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
