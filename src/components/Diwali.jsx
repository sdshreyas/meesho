// Diwali festive skin: decorative banners for the buyer home and seller hub.
// Pure UI — shown only while the Diwali theme is on (data-festive="diwali").
import { Link } from 'react-router-dom'
import { useApp } from '../store.jsx'
import { daysToFestival } from '../engine/seller.js'

export function Diyas({ n = 5 }) {
  return (
    <div className="diyas" aria-hidden>
      {Array.from({ length: n }, (_, i) => (
        <span key={i} className="diya" style={{ animationDelay: `${i * 0.35}s` }}><i className="flame" /></span>
      ))}
    </div>
  )
}

function Lanterns() {
  return (
    <div className="lanterns" aria-hidden>
      {[0, 1, 2].map((i) => <span key={i} className={'lantern l' + i}><i /></span>)}
    </div>
  )
}

function Countdown() {
  const { t } = useApp()
  const days = daysToFestival()
  return <span className="diwali-count">{days > 0 ? t('diwaliDays', { days }) : t('diwaliToday')}</span>
}

/** Buyer home: festival hero with countdown and festive category shortcuts. */
export function DiwaliBanner() {
  const { festive, profile, t, tx } = useApp()
  if (!festive) return null
  const cats = profile.gender === 'men'
    ? [['🧥', 'Men Fashion'], ['⌚', 'Jewellery & Accessories'], ['🏮', 'Home & Kitchen']]
    : [['🪔', 'Women Fashion'], ['✨', 'Jewellery & Accessories'], ['🏮', 'Home & Kitchen']]
  return (
    <section className="diwali-banner">
      <Lanterns />
      <div className="db-text">
        <Countdown />
        <h2>{t('diwaliTitle')}</h2>
        <p>{t('diwaliSub')}</p>
        <div className="db-links">
          {cats.map(([i, c]) => <Link key={c} to={`/?cat=${encodeURIComponent(c)}`}>{i} {tx(c)}</Link>)}
        </div>
      </div>
      <div className="db-art" aria-hidden>
        <div className="rangoli" />
        <Diyas />
      </div>
    </section>
  )
}

/** Seller hub: festive greeting that replaces the plain festival alert. */
export function SellerDiwaliBanner({ name, alert }) {
  const { festive, t } = useApp()
  if (!festive) return null
  return (
    <section className="diwali-banner seller">
      <Lanterns />
      <div className="db-text">
        <Countdown />
        <h2>{t('sellerDiwali', { name })}</h2>
        <p>{t('sellerDiwaliSub')}</p>
        <div className="db-alert">🪔 {alert}</div>
      </div>
      <div className="db-art" aria-hidden>
        <div className="rangoli" />
        <Diyas n={4} />
      </div>
    </section>
  )
}
