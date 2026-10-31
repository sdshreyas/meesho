import { useState } from 'react'
import { Link } from 'react-router-dom'
import { track } from '../tracking/tracker.js'
import { EN } from '../i18n/strings.js'
import { api } from '../api.js'
import { inr, useApp } from '../store.jsx'
import { useFetch } from '../useFetch.js'
import products from '../data/products.json'
import { img } from '../components/ProductCard.jsx'

const byId = Object.fromEntries(products.map((p) => [p.id, p]))
export const fmtDate = (ms) => new Date(ms).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })

export default function Orders() {
  const { profile, t } = useApp()
  const { data, reload } = useFetch(() => api.orders(profile.id), [profile.id])
  const [returning, setReturning] = useState(null)
  const [reason, setReason] = useState('rr_size')
  const confirmReturn = async (o) => {
    await api.returnOrder(o.id, EN[reason]) // stored in English for analytics
    track('return', { orderId: o.id, reason: reason.replace('rr_', ''), items: o.lines.map((l) => l.productId), total: o.total })
    setReturning(null)
    reload()
  }
  if (!data) return <main className="page"><div className="loading">…</div></main>
  if (!data.length) {
    return (
      <main className="page empty">
        <div className="empty-icon">📦</div>
        <h2>{t('noOrders')}</h2>
        <Link to="/" className="btn-primary">{t('startShopping')}</Link>
      </main>
    )
  }
  return (
    <main className="page">
      <h3 className="section-title">{t('orders')}</h3>
      <div className="order-list">
        {data.map((o) => (
          <div key={o.id} className="order-row">
            <div className="thumbs">
              {o.lines.slice(0, 3).map((l) => <img key={l.productId} src={img(byId[l.productId].image)} alt="" />)}
            </div>
            <div className="order-info">
              <b>{t('orderId')}: {o.id}</b>
              <small>{t('placedOn', { date: fmtDate(o.placedAt) })} · {t('items', { n: o.lines.reduce((s, l) => s + l.qty, 0) })} · {inr(o.total)} · {o.plan ? t(o.plan) : o.payment}</small>
              <span className={'status-pill' + (o.tracking.delivered ? ' done' : '')}>{t(o.tracking.status)}</span>
            </div>
            <div className="order-actions">
              <Link className="btn-outline" to={`/track/${o.id}`}>{t('trackOrder')}</Link>
              {o.returned ? <span className="pill amber">{t('returned')}</span> : o.tracking.delivered && returning !== o.id && (
                <button className="btn-outline" onClick={() => setReturning(o.id)}>{t('returnOrder')}</button>
              )}
              {returning === o.id && (
                <div className="return-box">
                  <label>{t('returnReason')}
                    <select value={reason} onChange={(e) => setReason(e.target.value)}>
                      {['rr_size', 'rr_quality', 'rr_photo', 'rr_damaged', 'rr_mind'].map((r) => <option key={r} value={r}>{t(r)}</option>)}
                    </select>
                  </label>
                  <button className="btn-primary sm" onClick={() => confirmReturn(o)}>{t('confirmReturn')}</button>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </main>
  )
}
