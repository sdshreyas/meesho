import { Link } from 'react-router-dom'
import { api } from '../api.js'
import { inr, useApp } from '../store.jsx'
import { useFetch } from '../useFetch.js'
import products from '../data/products.json'
import { img } from '../components/ProductCard.jsx'

const byId = Object.fromEntries(products.map((p) => [p.id, p]))
export const fmtDate = (ms) => new Date(ms).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })

export default function Orders() {
  const { profile, t } = useApp()
  const { data } = useFetch(() => api.orders(profile.id), [profile.id])
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
            <Link className="btn-outline" to={`/track/${o.id}`}>{t('trackOrder')}</Link>
          </div>
        ))}
      </div>
    </main>
  )
}
