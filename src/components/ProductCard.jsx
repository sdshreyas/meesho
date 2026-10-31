import { Link } from 'react-router-dom'
import { inr, useApp } from '../store.jsx'
import { FREE_DELIVERY_THRESHOLD } from '../engine/config.js'

export const img = (path) => import.meta.env.BASE_URL + path

export function Rating({ p }) {
  const { t } = useApp()
  return (
    <div className="rating-row">
      <span className={'rating' + (p.rating < 4 ? ' mid' : '')}>{p.rating} ★</span>
      <small>{t('reviews', { count: p.ratingCount.toLocaleString('en-IN') })}</small>
    </div>
  )
}

export function Reasons({ reasons }) {
  const { t, profile } = useApp()
  if (!reasons?.length) return null
  return (
    <div className="reasons" title={t('whyThis')}>
      {reasons.map((r) => (
        <span key={r} className={'reason' + (r === 'r_gap' || r === 'r_cart' ? ' hot' : '')}>✦ {t(r, { city: profile.city })}</span>
      ))}
    </div>
  )
}

export default function ProductCard({ p, onAdd, compact }) {
  const { t, tx, wishlist, toggleWish } = useApp()
  const off = Math.round((1 - p.price / p.mrp) * 100)
  const wished = wishlist.includes(p.id)
  return (
    <div className={'card' + (compact ? ' compact' : '')}>
      <button className={'heart' + (wished ? ' on' : '')} onClick={() => toggleWish(p.id)} aria-label={t('wishlist')} title={t('wishlist')}>
        {wished ? '♥' : '♡'}
      </button>
      <Link to={`/product/${p.id}`} className="card-link">
        <div className="card-img">
          <img src={img(p.image)} alt={p.name} loading="lazy" />
        </div>
        <div className="card-body">
          <div className="card-name">{tx(p.name)}</div>
          <div className="price-row">
            <b>{inr(p.price)}</b>
            <s>{inr(p.mrp)}</s>
            <span className="off">{t('off_pct', { pct: off })}</span>
          </div>
          {p.price >= FREE_DELIVERY_THRESHOLD && <span className="chip-free">{t('freeDelivery')}</span>}
          <Rating p={p} />
          {!compact && <Reasons reasons={p.reasons} />}
        </div>
      </Link>
      {compact && <Reasons reasons={p.reasons} />}
      {onAdd && (
        <button className="btn-mini" onClick={() => onAdd(p)}>
          + {t('addToCart')}
        </button>
      )}
    </div>
  )
}
