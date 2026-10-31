import { useState } from 'react'
import { api } from '../api.js'
import { useApp } from '../store.jsx'
import { useFetch } from '../useFetch.js'
import { exportUserExcel } from '../tracking/exportExcel.js'

const pct = (x) => (x == null ? '—' : `${Math.round(x * 100)}%`)
const top = (o, n = 6) => Object.entries(o ?? {}).sort((a, b) => b[1] - a[1]).slice(0, n)

function Kpi({ label, value, sub }) {
  return (
    <div className="kpi">
      <small>{label}</small>
      <b>{value}</b>
      {sub && <small className="kpi-sub">{sub}</small>}
    </div>
  )
}

function Bars({ data }) {
  const max = Math.max(1, ...data.map(([, v]) => v))
  return (
    <ol className="top-cities">
      {data.map(([k, v]) => (
        <li key={k}><span className="tc-name">{k}</span><span className="tc-bar"><i style={{ width: `${(v / max) * 100}%` }} /></span><span className="tc-val">{v}</span></li>
      ))}
    </ol>
  )
}

/** Behaviour history + preferences of one user, with Excel export. Ops can browse every buyer. */
export default function MyData() {
  const { profile, profiles } = useApp()
  const isOps = profile.type === 'ops'
  const [userId, setUserId] = useState(isOps ? 'U1' : profile.id)
  const { data, reload } = useFetch(() => api.users.data(userId), [userId])
  const [busy, setBusy] = useState(null)

  if (!data) return <main className="page"><div className="loading">…</div></main>
  const { behaviour: b, preferences: pr, runs } = data
  const cur = pr.current
  const savedKey = (() => { try { return localStorage.getItem('meesho.gemini.key') ?? '' } catch { return '' } })()

  const exportOne = async () => {
    setBusy('export')
    await exportUserExcel(data)
    setBusy(null)
  }
  const exportAll = async () => {
    setBusy('all')
    for (const p of profiles.filter((x) => x.type === 'buyer')) await exportUserExcel(await api.users.data(p.id))
    setBusy(null)
  }
  const rerun = async () => {
    setBusy('rerun')
    await api.users.personalise(userId, savedKey)
    reload()
    setBusy(null)
  }
  const reset = async () => {
    if (!window.confirm(`Delete all tracked history and preferences for ${data.profile.name}?`)) return
    await api.users.reset(userId)
    reload()
  }

  return (
    <main className="page mydata">
      <div className="ops-head">
        <div>
          <h2>📊 {isOps ? 'User data' : 'My data'} — {data.profile.name}</h2>
          <small className="muted">Two databases per user: behaviour history (every session & event) and preferences (what the store shows you), with every past version. Updated live as you browse.</small>
        </div>
        <div className="row-gap">
          {isOps && (
            <select className="ops-select" value={userId} onChange={(e) => setUserId(e.target.value)}>
              {profiles.filter((p) => p.type === 'buyer').map((p) => <option key={p.id} value={p.id}>{p.name} · {p.segment}</option>)}
            </select>
          )}
          <button className="btn-primary" disabled={!!busy} onClick={exportOne}>{busy === 'export' ? 'Exporting…' : '⬇ Export to Excel'}</button>
          {isOps && <button className="btn-outline" disabled={!!busy} onClick={exportAll}>{busy === 'all' ? 'Exporting…' : '⬇ Export all users'}</button>}
        </div>
      </div>

      <div className="kpis">
        <Kpi label="Sessions" value={b.sessions} sub={`${b.totalMinutes} min in total`} />
        <Kpi label="Avg session" value={`${b.avgSessionMin.toFixed(1)} min`} sub={`scroll depth ${pct(b.avgScrollDepth)}`} />
        <Kpi label="Product views" value={b.totalProductViews} sub={`${b.repeatViews.length} viewed again`} />
        <Kpi label="Search → product" value={pct(b.searchToProductRate)} sub={`${b.searches.length} searches`} />
        <Kpi label="Cart adds" value={b.cartAdds} sub={`abandonment ${pct(b.abandonment.rate)}`} />
        <Kpi label="Orders" value={b.purchases.orders} sub={`AOV ₹${Math.round(b.purchases.aov)}`} />
        <Kpi label="Returns" value={b.returns.count} sub={`rate ${pct(b.returns.rate)}`} />
      </div>

      <div className="seller-grid">
        <div className="box">
          <b>Most viewed products</b>
          <table className="sku-table">
            <thead><tr><th>Product</th><th>Views</th><th>Sessions</th><th>Bought</th></tr></thead>
            <tbody>
              {b.productViews.slice(0, 10).map((p) => (
                <tr key={p.id}><td>{p.name}<small className="muted block">{p.subcategory} · ₹{p.price}</small></td><td>{p.views}</td><td>{p.sessions}</td><td>{p.purchased ? '✓' : ''}</td></tr>
              ))}
            </tbody>
          </table>
          {!b.productViews.length && <p className="muted">No product views yet — browse the store and they'll appear here.</p>}
        </div>
        <div className="box">
          <b>Category interest</b>
          <Bars data={top(b.categoryViews, 8)} />
          <b className="mt">Entry pages</b>
          <Bars data={top(b.firstPages, 4)} />
          <b className="mt">Exit pages</b>
          <Bars data={top(b.exitPages, 4)} />
        </div>
      </div>

      <div className="seller-grid">
        <div className="box">
          <b>Search → product journeys</b>
          <table className="sku-table">
            <thead><tr><th>Query</th><th>Results</th><th>Opened</th><th>Time</th><th>Cart</th><th>Bought</th></tr></thead>
            <tbody>
              {b.searches.slice(-10).reverse().map((s, i) => (
                <tr key={i}><td>“{s.query}”</td><td>{s.results ?? '—'}</td><td>{s.productId ?? '—'}</td><td>{s.secondsToClick != null ? `${s.secondsToClick}s` : '—'}</td><td>{s.addedToCart ? '✓' : ''}</td><td>{s.purchased ? '✓' : ''}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="box">
          <b>Cart abandonment & returns</b>
          <div className="fc-row"><span>Sessions with a cart</span><b>{b.abandonment.sessionsWithCart}</b></div>
          <div className="fc-row"><span>Abandoned sessions</span><b>{b.abandonment.abandonedSessions}</b></div>
          {b.abandonment.products.map((p) => <div key={p.id} className="fc-row"><span>🛒 {p.name}</span><b>{p.times}×</b></div>)}
          <b className="mt">Return reasons</b>
          {top(b.returns.byReason).map(([r, n]) => <div key={r} className="fc-row"><span>↩ {r}</span><b>{n}</b></div>)}
          {!b.returns.count && <small className="muted">No returns.</small>}
        </div>
      </div>

      <div className="box">
        <div className="box-head">
          <b>🎛 Current preferences — v{cur.version} · {cur.source}{cur.model ? ` · ${cur.model}` : ''}</b>
          <div className="row-gap">
            {data.profile.type === 'buyer' && <button className="btn-outline sm" disabled={!!busy} onClick={rerun}>{busy === 'rerun' ? 'Updating…' : savedKey ? '✨ Re-run with Gemini' : '⚙️ Re-run (rules)'}</button>}
            <button className="btn-outline sm" onClick={reset}>Reset data</button>
          </div>
        </div>
        <div className="pref-grid">
          <div><small className="muted">Category weights</small><Bars data={top(Object.fromEntries(Object.entries(cur.categoryWeights).map(([k, v]) => [k, Math.round(v * 100)])), 8)} /></div>
          <div>
            <small className="muted">Subcategory boosts</small>
            {Object.entries(cur.subcategoryBoost).map(([k, v]) => <div key={k} className="fc-row"><span>{k}</span><b className={v > 0 ? 'up' : 'down'}>{v > 0 ? '+' : ''}{v}</b></div>)}
            {!Object.keys(cur.subcategoryBoost).length && <small className="muted block">none</small>}
            <div className="fc-row mt"><span>Price band</span><b>₹{cur.priceBand[0]}–{cur.priceBand[1]}</b></div>
            <div className="fc-row"><span>Styles</span><b>{cur.styles.join(', ') || '—'}</b></div>
            <div className="fc-row"><span>Tags</span><b>{cur.preferredTags.join(', ') || '—'}</b></div>
          </div>
          <div>
            <div className="fc-row"><span>Personal offer</span><b>{cur.discount.pct ? `${cur.discount.pct}% · ${cur.discount.code}` : 'none'}</b></div>
            {cur.discount.reason && <small className="muted block">{cur.discount.reason}</small>}
            <div className="fc-row"><span>Bundle discount</span><b>{cur.bundle.discountPct}%</b></div>
            <div className="fc-row"><span>Bundle focus</span><b>{cur.bundle.focusSubcategories.join(', ') || '—'}</b></div>
            <div className="fc-row"><span>Re-engage products</span><b>{cur.reengage.length}</b></div>
            <div className="fc-row"><span>Avoid</span><b>{cur.avoid.subcategories.join(', ') || '—'}</b></div>
            <div className="fc-row"><span>Home order</span><b>{cur.layout.sectionOrder.join(' → ')}</b></div>
            <div className="fc-row"><span>Hero message</span><b>{cur.layout.heroMessage || '—'}</b></div>
          </div>
        </div>
        {cur.rationale && <p className="muted"><b>Why:</b> {cur.rationale}</p>}
        {cur.insights?.length > 0 && <ul className="model-notes">{cur.insights.map((x) => <li key={x}>{x}</li>)}</ul>}
      </div>

      <div className="seller-grid">
        <div className="box">
          <b>Preference versions</b>
          <table className="sku-table">
            <thead><tr><th>v</th><th>When</th><th>Source</th><th>Offer</th><th>Bundle</th><th>Top category</th></tr></thead>
            <tbody>
              {[cur, ...[...pr.versions].reverse()].slice(0, 12).map((v) => (
                <tr key={v.version + v.updatedAt}>
                  <td>{v.version}</td>
                  <td>{(v.updatedAt ?? '').replace('T', ' ').slice(5, 16)}</td>
                  <td>{v.source}{v.model ? ` · ${v.model}` : ''}</td>
                  <td>{v.discount?.pct ? `${v.discount.pct}%` : '—'}</td>
                  <td>{v.bundle?.discountPct}%</td>
                  <td>{top(v.categoryWeights, 1)[0]?.[0]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="box">
          <b>Sessions</b>
          <table className="sku-table">
            <thead><tr><th>Started</th><th>Min</th><th>First → exit page</th><th>Views</th><th>Cart</th><th>Bought</th></tr></thead>
            <tbody>
              {[...b.sessionRows].reverse().slice(0, 12).map((s) => (
                <tr key={s.id}>
                  <td>{s.start.replace('T', ' ').slice(5, 16)}</td>
                  <td>{(s.durationSec / 60).toFixed(1)}</td>
                  <td><small>{s.firstPage} → {s.exitPage}</small></td>
                  <td>{s.productViews}</td>
                  <td>{s.cartAdds}{s.abandoned ? ' ⚠' : ''}</td>
                  <td>{s.purchases}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {runs.length > 0 && (
        <div className="box">
          <b>🤖 Last personalisation run</b>
          <small className="muted">{runs.at(-1).at.replace('T', ' ').slice(0, 19)} · {runs.at(-1).source}{runs.at(-1).model ? ` · ${runs.at(-1).model}` : ''}{runs.at(-1).fallbackReason ? ` · ${runs.at(-1).fallbackReason}` : ''} · {runs.at(-1).ms} ms</small>
          <ul className="perso-changes">{runs.at(-1).changes.map((c) => <li key={c}>{c}</li>)}</ul>
          <details><summary>Prompt sent to the model</summary><pre className="prompt-box">{runs.at(-1).prompt}</pre></details>
          {runs.at(-1).raw && <details><summary>Raw model reply</summary><pre className="prompt-box">{runs.at(-1).raw}</pre></details>}
        </div>
      )}
    </main>
  )
}
