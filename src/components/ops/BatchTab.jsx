import { useState } from 'react'
import { Bar, BarChart, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip as RTooltip, XAxis, YAxis } from 'recharts'
import { api } from '../../api.js'
import { Kpi, STAGE_COLOR, num, pct } from './common.jsx'
import { StageChart } from './OptimizerTab.jsx'

const BUCKET_COLOR = {
  toAirhub: STAGE_COLOR.toAirhub, toSc: STAGE_COLOR.toSc, waitSc: STAGE_COLOR.waitSc, lineHaul: STAGE_COLOR.lineHaul_t,
  toDestAirhub: STAGE_COLOR.toDestAirhub, waitAirhub: STAGE_COLOR.waitAirhub, outForDelivery: STAGE_COLOR.outForDelivery, partner: STAGE_COLOR.partner,
}
const h = (x) => (x == null ? '—' : x < 1 ? `${Math.round(x * 60)}m` : `${x.toFixed(1)}h`)
const MODE_LABEL = { valmo: 'Valmo', valmo_alt: 'Valmo (alt SC)', hybrid_lm: 'Valmo + 3PL LM', hybrid_fm: '3PL pickup + Valmo', XP: 'Partner X', YS: 'Partner Y', ZR: 'Partner Z' }

export default function BatchTab({ network }) {
  const { start, end } = network.history
  const [from, setFrom] = useState('2026-10-01')
  const [to, setTo] = useState(end)
  const [threshold, setThreshold] = useState(0.8)
  const [delayCost, setDelayCost] = useState(0.25)
  const [busy, setBusy] = useState(false)
  const [data, setData] = useState(null)
  const [err, setErr] = useState(null)
  const buckets = network.buckets

  const run = async () => {
    const span = (new Date(to) - new Date(from)) / 86400000
    if (span < 0) return setErr('"From" must be before "To".')
    if (span > 62) return setErr('Pick a range of up to 62 days.')
    setErr(null)
    setBusy(true)
    setData(await api.logistics.batch({ from, to, threshold, delayCostPerHour: delayCost }))
    setBusy(false)
  }

  const timeline = data ? [{ name: 'Average Valmo parcel', ...Object.fromEntries(buckets.map(([k]) => [k, +data.buckets[k].toFixed(2)])) }] : []
  const s = data?.summary

  return (
    <div className="ops-stack">
      <div className="box">
        <b>📅 Batch analysis — every order between two dates</b>
        <small className="muted">
          Re-runs the optimiser day by day on all orders from many suppliers to many cities, then replays each parcel hour by hour through Valmo's stages:
          pilot pickup rounds at {network.schedule.pickupSlots.map((x) => x + ':00').join(' & ')}, the nightly Airhub feeder at {network.schedule.airhubFeeder[0]}:00,
          {' '}{network.schedule.sortH} h sorting, line-haul trucks that wait at the sort centre until they are full enough (or {network.schedule.maxHoldH} h max),
          destination feeders at {network.schedule.destFeeder.map((x) => String(x).padStart(2, '0') + ':00').join(' & ')} and delivery waves from 9:30.
        </small>
        <div className="form-row batch-form">
          <label>From
            <input type="date" min={start} max={end} value={from} onChange={(e) => setFrom(e.target.value)} />
          </label>
          <label>To
            <input type="date" min={start} max={end} value={to} onChange={(e) => setTo(e.target.value)} />
          </label>
          <label>Dispatch a truck when it is
            <select value={threshold} onChange={(e) => setThreshold(+e.target.value)}>
              {[0.5, 0.65, 0.8, 0.9, 0.97].map((t) => <option key={t} value={t}>{Math.round(t * 100)}% full</option>)}
            </select>
          </label>
          <label>Cost of 1 h delay per parcel (₹)
            <input type="number" step="0.05" min="0" value={delayCost} onChange={(e) => setDelayCost(Math.max(0, +e.target.value))} />
          </label>
          <label>&nbsp;
            <button className="btn-primary" disabled={busy} onClick={run}>{busy ? 'Running…' : 'Run batch analysis'}</button>
          </label>
        </div>
        {err && <div className="login-error">{err}</div>}
        <small className="muted">History available {start} → {end}.</small>
      </div>

      {data && (
        <>
          <div className="box">
            <b>Summary · {data.from} → {data.to} ({s.days} days)</b>
            <div className="kpis">
              <Kpi label="Parcels" value={num(s.orders)} sub={`Valmo network ${pct(s.valmoShare)}`} />
              <Kpi label="Cost per parcel" value={`₹${s.costPerOrder.toFixed(1)}`} sub="optimised routes" tone="purple" />
              <Kpi label="Order → delivery" value={`${s.avgDays.toFixed(1)} days`} sub={`90% within ${s.p90Days.toFixed(1)} days`} />
              <Kpi label="Wait at sort centre for a truck" value={h(s.avgWaitSc)} sub={`90th pct ${h(s.p90WaitSc)}`} tone={s.avgWaitSc > 12 ? 'amber' : 'green'} />
              <Kpi label="Wait at Airhub for delivery" value={h(s.avgWaitAirhub)} sub="until the next pilot wave" />
              <Kpi label="Line-haul truck fill" value={pct(s.fill)} sub={`${num(s.trips)} truck trips`} tone={s.fill > 0.7 ? 'green' : 'amber'} />
            </div>

            <b className="mt">Where the time goes (average Valmo parcel, hours)</b>
            <ResponsiveContainer width="100%" height={120}>
              <BarChart data={timeline} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 0 }}>
                <XAxis type="number" tickFormatter={(v) => v + 'h'} tick={{ fontSize: 11 }} />
                <YAxis type="category" dataKey="name" width={150} tick={{ fontSize: 11 }} />
                <RTooltip formatter={(v, n) => [h(+v), n]} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                {buckets.filter(([k]) => k !== 'partner').map(([k, l]) => <Bar key={k} dataKey={k} name={l} stackId="t" fill={BUCKET_COLOR[k]} />)}
              </BarChart>
            </ResponsiveContainer>
            <div className="bucket-grid">
              {buckets.filter(([k]) => k !== 'partner').map(([k, l, d]) => (
                <div key={k} className="bucket"><i style={{ background: BUCKET_COLOR[k] }} /><b>{h(data.buckets[k])}</b><span>{l}</span><small>{d}</small></div>
              ))}
            </div>

            <b className="mt">Cost per parcel by supply-chain stage</b>
            <StageChart rows={[{ name: 'Average parcel', ...Object.fromEntries(Object.entries(s.stagesPerOrder).map(([k, v]) => [k, +v.toFixed(2)])) }]} height={110} />
          </div>

          <div className="box">
            <b>⚖️ Truck fill vs waiting — when should line-haul trucks leave?</b>
            <small className="muted">Same orders and routes; only the dispatch rule changes. Waiting longer fills trucks better (cheaper line haul) but parcels sit at the sort centre. With a delay cost of ₹{data.delayCostPerHour}/parcel-hour, the best rule is <b>dispatch at {Math.round(data.recommended * 100)}% full</b>.</small>
            <div className="sim-grid two">
              <ResponsiveContainer width="100%" height={230}>
                <ComposedChart data={data.compare.map((c) => ({ ...c, label: Math.round(c.threshold * 100) + '%', fillPct: c.fill * 100 }))} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#eee" />
                  <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                  <YAxis yAxisId="l" tickFormatter={(v) => '₹' + v} tick={{ fontSize: 11 }} width={44} />
                  <YAxis yAxisId="r" orientation="right" tickFormatter={(v) => v + 'h'} tick={{ fontSize: 11 }} width={40} />
                  <RTooltip formatter={(v, n) => (n === 'Avg wait at sort centre' ? h(+v) : `₹${(+v).toFixed(1)}`)} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar yAxisId="l" dataKey="lhCost" name="Line-haul ₹/parcel" fill="#1c7ed6" radius={[4, 4, 0, 0]} />
                  <Line yAxisId="r" dataKey="avgWait" name="Avg wait at sort centre" stroke="#e03131" strokeWidth={2} />
                </ComposedChart>
              </ResponsiveContainer>
              <table className="sku-table">
                <thead><tr><th>Dispatch at</th><th>Avg wait</th><th>90th pct</th><th>Line haul ₹/parcel</th><th>Fill</th><th>Trips</th><th>Total ₹*</th></tr></thead>
                <tbody>
                  {data.compare.map((c) => (
                    <tr key={c.threshold} className={c.threshold === data.recommended ? 'best' : c.threshold === data.threshold ? 'sel' : ''}>
                      <td><b>{Math.round(c.threshold * 100)}%</b> {c.threshold === data.recommended && <span className="pill green">Best</span>}</td>
                      <td>{h(c.avgWait)}</td>
                      <td>{h(c.p90Wait)}</td>
                      <td>₹{c.lhCost.toFixed(1)}</td>
                      <td>{pct(c.fill)}</td>
                      <td>{num(c.trips)}</td>
                      <td>₹{c.total.toFixed(1)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <small className="muted">* Total = line-haul cost + average wait × delay cost.</small>
          </div>

          <div className="box">
            <b>📦 Time by product (Valmo-routed parcels, hours)</b>
            <div className="table-wrap">
              <table className="sku-table batch-table">
                <thead>
                  <tr>
                    <th>Product</th><th>Parcels</th><th>Valmo</th>
                    <th>Supplier → Airhub</th><th>Airhub → SC</th><th>Wait at SC</th><th>Line haul</th><th>SC → Airhub</th><th>Wait at Airhub</th><th>Delivery</th>
                    <th>Total</th><th>₹/parcel</th>
                  </tr>
                </thead>
                <tbody>
                  {data.products.map((p) => (
                    <tr key={p.productId}>
                      <td><b>{p.name}</b><small className="muted block">{p.category}</small></td>
                      <td>{num(p.orders)}</td>
                      <td>{pct(p.valmoShare)}</td>
                      {['toAirhub', 'toSc', 'waitSc', 'lineHaul', 'toDestAirhub', 'waitAirhub', 'outForDelivery'].map((k) => <td key={k}>{h(p.buckets[k])}</td>)}
                      <td><b>{p.days.toFixed(1)} d</b></td>
                      <td>₹{p.cost.toFixed(1)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="sim-grid two">
            <div className="box">
              <b>🛣️ Line-haul lanes</b>
              <div className="table-wrap">
                <table className="sku-table">
                  <thead><tr><th>Lane</th><th>Km</th><th>Vehicle</th><th>Trips</th><th>Fill</th><th>Avg wait</th><th>₹/parcel</th></tr></thead>
                  <tbody>
                    {data.lanes.map((l) => (
                      <tr key={l.key}>
                        <td>{l.from.slice(3)} → {l.to.slice(3)}</td>
                        <td>{num(l.km)}</td>
                        <td>{l.vehicle}</td>
                        <td>{num(l.trips)}</td>
                        <td><span className={'pill ' + (l.fill > 0.75 ? 'green' : l.fill > 0.5 ? 'amber' : 'red')}>{pct(l.fill)}</span></td>
                        <td>{h(l.avgWait)}</td>
                        <td>₹{l.costPerParcel.toFixed(1)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            <div className="box">
              <b>⏱️ Order to delivery</b>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={data.histogram} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#eee" />
                  <XAxis dataKey="days" tick={{ fontSize: 12 }} label={{ value: 'days', position: 'insideBottomRight', offset: -2, fontSize: 11 }} />
                  <YAxis tickFormatter={(v) => (v / 1e5).toFixed(0) + 'L'} tick={{ fontSize: 11 }} width={40} />
                  <RTooltip formatter={(v) => num(v) + ' parcels'} />
                  <Bar dataKey="orders" fill="#9f2089" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
              <div className="mode-legend">
                {Object.entries(s.byMode).map(([k, v]) => <span key={k}>{MODE_LABEL[k]}: <b>{pct(v / s.orders)}</b></span>)}
              </div>
            </div>
          </div>

          <div className="box">
            <b>🔎 Sample parcels</b>
            <div className="table-wrap">
              <table className="sku-table batch-table">
                <thead>
                  <tr><th>Order</th><th>Product</th><th>From → to</th><th>Route</th><th>Supplier → Airhub</th><th>Airhub → SC</th><th>Wait at SC</th><th>Line haul</th><th>SC → Airhub</th><th>Wait at Airhub</th><th>Delivery</th><th>3PL</th><th>Total</th><th>₹</th></tr>
                </thead>
                <tbody>
                  {data.samples.map((r) => (
                    <tr key={r.id}>
                      <td>{r.day.slice(5)} {String(Math.floor(r.hour)).padStart(2, '0')}:{String(Math.round((r.hour % 1) * 60)).padStart(2, '0')}</td>
                      <td>{r.product}</td>
                      <td>{r.seller} → {r.city}</td>
                      <td>{MODE_LABEL[r.mode]}</td>
                      {['toAirhub', 'toSc', 'waitSc', 'lineHaul', 'toDestAirhub', 'waitAirhub', 'outForDelivery', 'partner'].map((k) => <td key={k}>{r.buckets[k] != null ? h(r.buckets[k]) : '—'}</td>)}
                      <td><b>{(r.totalH / 24).toFixed(1)} d</b></td>
                      <td>₹{r.cost.toFixed(0)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
