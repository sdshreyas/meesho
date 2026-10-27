import { useSearchParams } from 'react-router-dom'
import { api } from '../api.js'
import { useApp } from '../store.jsx'
import { useFetch } from '../useFetch.js'
import { langByCode } from '../data/languages.js'
import ProductCard from '../components/ProductCard.jsx'
import BundleCard from '../components/BundleCard.jsx'

export default function Home() {
  const { profile, nudges, t, tx, lang } = useApp()
  const [params] = useSearchParams()
  const cat = params.get('cat') ?? ''
  const q = params.get('q') ?? ''
  const nf = nudges ? 1 : 0
  const feed = useFetch(() => api.products({ persona: profile.id, category: cat, q, nudges: nf }), [profile.id, cat, q, nf])
  const bundles = useFetch(() => api.bundles({ persona: profile.id, nudges: nf }), [profile.id, nf])

  const list = feed.data ?? []
  const top = nudges && !cat && !q ? list.slice(0, 6) : []
  const rest = nudges && !cat && !q ? list.slice(6) : list
  const initials = profile.name.split(' ').map((s) => s[0]).join('')

  return (
    <main className="page">
      <section className="persona-hero">
        <div className="avatar">{initials}</div>
        <div className="persona-text">
          <h2>{t('hello', { name: profile.name.split(' ')[0] })} 👋</h2>
          <p>{t('feedExplain', { segment: tx(profile.segment), city: profile.city })}</p>
          <div className="persona-chips">
            <span>{tx(profile.segment)}</span>
            <span>📍 {profile.city}, {profile.tier}</span>
            <span>🗣 {langByCode(lang).native}</span>
            <span>₹{profile.priceBand[0]}–{profile.priceBand[1]}</span>
            <span>{profile.payment}</span>
          </div>
        </div>
        <div className={'algo-state' + (nudges ? ' on' : '')}>
          {nudges ? t('algoOn') : t('algoOff')}
        </div>
      </section>

      {top.length > 0 && (
        <section>
          <h3 className="section-title">{t('recommendedForYou')}</h3>
          <div className="grid grid-6">
            {top.map((p) => <ProductCard key={p.id} p={p} />)}
          </div>
        </section>
      )}

      {!cat && !q && bundles.data?.length > 0 && (
        <section>
          <h3 className="section-title">{t('bundlesForYou')}</h3>
          <div className="bundle-row">
            {bundles.data.map((b) => <BundleCard key={b.id} bundle={b} />)}
          </div>
        </section>
      )}

      <section>
        <h3 className="section-title">{cat ? tx(cat) : nudges ? t('productsForYou') : t('popularProducts')}</h3>
        {feed.loading && !feed.data ? (
          <div className="loading">…</div>
        ) : (
          <div className="grid">
            {rest.map((p) => <ProductCard key={p.id} p={p} />)}
          </div>
        )}
      </section>
    </main>
  )
}
