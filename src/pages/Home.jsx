import { useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { api } from '../api.js'
import { useApp } from '../store.jsx'
import { useFetch } from '../useFetch.js'
import { langByCode } from '../data/languages.js'
import { track } from '../tracking/tracker.js'
import ProductCard from '../components/ProductCard.jsx'
import BundleCard from '../components/BundleCard.jsx'

const DEFAULT_ORDER = ['reengage', 'recommended', 'edits', 'bundles', 'grid']

export default function Home() {
  const { profile, nudges, t, tx, lang } = useApp()
  const [params] = useSearchParams()
  const cat = params.get('cat') ?? ''
  const q = params.get('q') ?? ''
  const nf = nudges ? 1 : 0
  const feed = useFetch(() => api.products({ persona: profile.id, category: cat, q, nudges: nf }), [profile.id, cat, q, nf])
  const bundles = useFetch(() => api.bundles({ persona: profile.id, nudges: nf }), [profile.id, nf])
  const prefs = useFetch(() => api.users.preferences(profile.id), [profile.id])

  useEffect(() => {
    if (cat) track('category_view', { category: cat })
  }, [cat])
  useEffect(() => {
    if (q && feed.data) track('search_results', { query: q.trim().toLowerCase(), count: feed.data.length })
  }, [q, feed.data])

  const list = feed.data ?? []
  const home = !cat && !q
  const p = prefs.data
  const band = p?.priceBand ?? profile.priceBand
  // curated edits from the personalised feed, by persona gender & style
  const women = profile.gender === 'women'
  const styles = p?.styles?.length ? p.styles : profile.styles ?? []
  const edits = !nudges || !home ? [] : women
    ? [
        { key: 'ethnic', title: t('ethnicEdit'), sub: t('ethnicEditSub'), items: list.filter((x) => x.style === 'ethnic' && x.gender !== 'men').slice(0, 10) },
        ...(styles.includes('western') ? [{ key: 'western', title: t('westernEdit'), sub: '', items: list.filter((x) => x.style === 'western' && x.gender === 'women').slice(0, 10) }] : []),
      ]
    : [{ key: 'mens', title: t('mensEdit'), sub: t('mensEditSub'), items: list.filter((x) => x.gender === 'men').slice(0, 10) }]
  const top = nudges && home ? list.slice(0, 6) : []
  const rest = nudges && home ? list.slice(6) : list
  const initials = profile.name.split(' ').map((s) => s[0]).join('')
  const from = q ? 'search' : cat ? 'category' : 'feed'

  const blocks = {
    reengage: home && p?.reengageProducts?.length > 0 && (
      <section key="reengage" className="edit reengage">
        <div className="edit-head"><h3>👀 {t('reengageTitle')}</h3></div>
        <div className="edit-strip">
          {p.reengageProducts.map((x) => <ProductCard key={x.id} p={{ ...x, reasons: ['r_reengage'] }} from="reengage" />)}
        </div>
      </section>
    ),
    recommended: top.length > 0 && (
      <section key="recommended">
        <h3 className="section-title">{t('recommendedForYou')}</h3>
        <div className="grid grid-6">{top.map((x) => <ProductCard key={x.id} p={x} from="recommended" />)}</div>
      </section>
    ),
    edits: edits.filter((e) => e.items.length >= 4).map((e) => (
      <section key={e.key} className={'edit ' + e.key}>
        <div className="edit-head">
          <h3>{e.key === 'ethnic' ? '🪷 ' : e.key === 'mens' ? '🧔 ' : '👗 '}{e.title}</h3>
          {e.sub && <small>{e.sub}</small>}
        </div>
        <div className="edit-strip">{e.items.map((x) => <ProductCard key={x.id} p={x} from={'edit-' + e.key} />)}</div>
      </section>
    )),
    bundles: home && bundles.data?.length > 0 && (
      <section key="bundles">
        <h3 className="section-title">{t('bundlesForYou')}</h3>
        <div className="bundle-row">{bundles.data.map((b) => <BundleCard key={b.id} bundle={b} />)}</div>
      </section>
    ),
    grid: (
      <section key="grid">
        <h3 className="section-title">{cat ? tx(cat) : q ? `“${q}”` : nudges ? t('productsForYou') : t('popularProducts')}</h3>
        {feed.loading && !feed.data ? (
          <div className="loading">…</div>
        ) : (
          <div className="grid">{rest.map((x) => <ProductCard key={x.id} p={x} from={from} query={q || undefined} />)}</div>
        )}
      </section>
    ),
  }
  const order = p?.layout?.sectionOrder?.length ? p.layout.sectionOrder : DEFAULT_ORDER

  return (
    <main className="page">
      <section className="persona-hero">
        <div className="avatar">{initials}</div>
        <div className="persona-text">
          <h2>{t('hello', { name: profile.name.split(' ')[0] })} 👋</h2>
          <p>{p?.layout?.heroMessage ? tx(p.layout.heroMessage) : t('feedExplain', { segment: tx(profile.segment), city: profile.city })}</p>
          <div className="persona-chips">
            <span>{tx(profile.segment)}</span>
            <span>📍 {profile.city}, {profile.tier}</span>
            <span>🗣 {langByCode(lang).native}</span>
            <span>₹{band[0]}–{band[1]}</span>
            <span>{profile.payment}</span>
            {p && p.source !== 'default' && <span className="ai-chip">✨ {p.source === 'gemini' ? 'Gemini' : 'Rules'} · v{p.version}</span>}
          </div>
        </div>
        <div className={'algo-state' + (nudges ? ' on' : '')}>
          {nudges ? t('algoOn') : t('algoOff')}
        </div>
      </section>

      {home && p?.discount?.pct > 0 && (
        <div className="offer-banner">
          <b>{t('offerBanner', { pct: p.discount.pct, code: p.discount.code })}</b>
          {p.discount.reason && <span>{tx(p.discount.reason)}</span>}
          {p.discount.categories?.length > 0 && <small>{p.discount.categories.map((c) => tx(c)).join(' · ')}</small>}
        </div>
      )}

      {order.map((k) => blocks[k])}
    </main>
  )
}
