import { useState } from 'react'
import { Navigate } from 'react-router-dom'
import { Area, Bar, CartesianGrid, ComposedChart, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { api } from '../api.js'
import { inr, useApp } from '../store.jsx'
import { useFetch } from '../useFetch.js'
import { img } from '../components/ProductCard.jsx'

const STATUS_CLS = { s_reorder: 'red', s_healthy: 'green', s_overstock: 'amber' }

function Kpi({ label, value, tone }) {
  return (
    <div className={'kpi ' + (tone ?? '')}>
      <small>{label}</small>
      <b>{value}</b>
    </div>
  )
}

export default function Seller() {
  const { profile, t, tx } = useApp()
  const { data: d, reload } = useFetch(() => (profile.type === 'seller' ? api.sellerDashboard(profile.id) : Promise.resolve(null)), [profile.id])
  const [busy, setBusy] = useState(null)
  if (profile.type !== 'seller') return <Navigate to="/" replace />
  if (!d) return <main className="page"><div className="loading">…</div></main>

  const k = d.kpis
  const insure = async (plan) => {
    setBusy(plan)
    await api.setInsurance(profile.id, plan, !d.enrolled[plan])
    reload()
    setBusy(null)
  }
  const apply = async (loan) => {
    setBusy(loan)
    await api.applyLoan(profile.id, loan)
    reload()
    setBusy(null)
  }
  const skus = [...d.skus].sort((a, b) => a.daysCover - b.daysCover)

  return (
    <main className="page seller">
      <div className="seller-head">
        <div>
          <h2>{t('sellerWelcome', { name: profile.owner })}</h2>
          <p className="muted">{profile.name} · {tx(profile.segment)} · {profile.city}</p>
        </div>
      </div>

      <div className="festive-alert">🪔 {t('festiveAlert', { days: d.daysToFestival, pct: d.festivalUplift })}</div>

      <div className="kpis">
        <Kpi label={t('gmv30')} value={inr(k.gmv30)} />
        <Kpi label={t('orders30')} value={k.orders30.toLocaleString('en-IN')} />
        <Kpi label={t('avgReturn')} value={k.avgReturn + '%'} tone={k.avgReturn > 15 ? 'red' : 'green'} />
        <Kpi label={t('qualityScore')} value={k.qualityScore + '/100'} tone={k.qualityScore < 70 ? 'amber' : 'green'} />
        <Kpi label={t('creditLimit')} value={inr(k.creditLimit)} tone="purple" />
      </div>

      <div className="seller-grid">
        <div className="box chart-box">
          <b>{t('salesTrend')}</b>
          <ResponsiveContainer width="100%" height={260}>
            <ComposedChart data={d.weekly} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#eee" />
              <XAxis dataKey="week" tick={{ fontSize: 12 }} />
              <YAxis tickFormatter={(v) => '₹' + Math.round(v / 1000) + 'k'} tick={{ fontSize: 12 }} width={48} />
              <Tooltip formatter={(v) => inr(v)} />
              <Legend />
              <Bar dataKey="actual" name={t('actual')} fill="#9F2089" radius={[4, 4, 0, 0]} />
              <Area dataKey="forecast" name={t('forecast')} stroke="#F43397" fill="#F4339722" strokeDasharray="5 4" type="monotone" />
            </ComposedChart>
          </ResponsiveContainer>
        </div>

        <div className="box">
          <b>⚠️ {t('returnsWatch')}</b>
          {d.returnAlerts.length === 0 && <p className="muted">{t('noReturnIssues')}</p>}
          <div className="alerts">
            {d.returnAlerts.map((s) => (
              <div key={s.id} className={'alert ' + (s.risk === 'high' ? 'red' : 'amber')}>
                <img src={img(s.image)} alt="" />
                <div>
                  <b>{tx(s.name)}</b>
                  <div className="alert-meta">
                    <span className="rr">{t('returnRate')} {s.returnRate}%</span>
                    <small>{t('benchmark', { pct: s.benchmark })}</small>
                  </div>
                  <small>{t('topReason', { reason: tx(s.reason) })}</small>
                  <small className="tip">💡 {t('qualityTip', { tip: tx(s.tip) })}</small>
                  {s.risk === 'high'
                    ? <small className="fee">{t('feeWarning', { amount: s.projectedFee })}</small>
                    : <small className="fee soft">{t('feeWatch', { fee: d.feeThresholdFee, pct: s.benchmark + 4 })}</small>}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="box">
        <b>📦 {t('stockPlanner')}</b>
        <div className="table-wrap">
          <table className="sku-table">
            <thead>
              <tr>
                <th>{t('sku')}</th>
                <th>{t('inStock')}</th>
                <th>{t('forecast2w')}</th>
                <th>{t('daysCover')}</th>
                <th>{t('reorderQty')}</th>
                <th>{t('returnRate')}</th>
                <th>{t('qualityScore')}</th>
                <th>{t('status')}</th>
              </tr>
            </thead>
            <tbody>
              {skus.map((s) => (
                <tr key={s.id}>
                  <td className="sku-cell">
                    <img src={img(s.image)} alt="" />
                    <div>
                      <b>{tx(s.name)}</b>
                      <small>{s.id} · {inr(s.price)} {s.festive && '· 🪔'}</small>
                    </div>
                  </td>
                  <td>{s.stock}</td>
                  <td>{s.forecast2w} <small className={s.trend >= 0 ? 'up' : 'down'}>{s.trend >= 0 ? '▲' : '▼'}{Math.abs(Math.round(s.trend * 100))}%</small></td>
                  <td>{s.daysCover}</td>
                  <td><b>{s.reorder > 0 ? '+' + s.reorder : '—'}</b></td>
                  <td className={s.risk === 'high' ? 'red-t' : s.risk === 'watch' ? 'amber-t' : ''}>{s.returnRate}%</td>
                  <td>{s.qualityScore}</td>
                  <td><span className={'pill ' + STATUS_CLS[s.status]}>{t(s.status)}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="seller-grid">
        <div className="box fin">
          <b>🏦 {t('creditTitle')}</b>
          <small className="muted">{t('creditSub')}</small>
          <div className="big-num">{inr(d.credit.limit)}</div>
          <ul className="factors">
            {d.credit.factors.map((f) => (
              <li key={f.key} className={f.good ? 'good' : 'bad'}>{f.good ? '✓' : '!'} {t(f.key, f.vars)}</li>
            ))}
          </ul>
          {[
            { id: 'loan_wc', vars: { amount: d.credit.limit.toLocaleString('en-IN'), rate: d.credit.rate } },
            { id: 'loan_inv', vars: { amount: d.credit.restockCost.toLocaleString('en-IN') } },
          ].map((l) => (
            <div key={l.id} className="fin-row">
              <div>
                <b>{t(l.id)}</b>
                <small>{t(l.id + '_d', l.vars)}</small>
              </div>
              <button className={d.loans[l.id] ? 'btn-done' : 'btn-primary'} disabled={!!d.loans[l.id] || busy === l.id} onClick={() => apply(l.id)}>
                {d.loans[l.id] ? t('applied') : t('apply')}
              </button>
            </div>
          ))}
        </div>

        <div className="box fin">
          <b>🛡 {t('insureTitle')}</b>
          <small className="muted">{t('insureSub', { amount: d.insurance.stockValue.toLocaleString('en-IN') })}</small>
          {d.insurance.plans.map((p) => (
            <div key={p.id} className="fin-row">
              <div>
                <b>{t(p.id)}</b>
                <small>{t(p.id + '_d')}</small>
                <em>{t(p.unit, { amount: p.amount.toLocaleString('en-IN') })}</em>
              </div>
              <button className={d.enrolled[p.id] ? 'btn-done' : 'btn-outline'} disabled={busy === p.id} onClick={() => insure(p.id)}>
                {d.enrolled[p.id] ? t('enrolled') : t('enrol')}
              </button>
            </div>
          ))}
        </div>
      </div>
    </main>
  )
}
