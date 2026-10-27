import { useEffect, useState } from 'react'
import { Link, NavLink, useNavigate, useSearchParams } from 'react-router-dom'
import { useApp } from '../store.jsx'
import { LANGUAGES } from '../data/languages.js'
import { CATEGORY_KEYS } from '../i18n/strings.js'

export default function Header() {
  const { profile, profiles, switchProfile, lang, setLang, translating, trSource, nudges, setNudges, cart, t, tx } = useApp()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const [q, setQ] = useState(params.get('q') ?? '')
  useEffect(() => setQ(params.get('q') ?? ''), [params])
  const isSeller = profile.type === 'seller'
  const count = cart.reduce((s, l) => s + l.qty, 0)

  const onProfile = (id) => {
    switchProfile(id)
    const p = profiles.find((x) => x.id === id)
    navigate(p.type === 'seller' ? '/seller' : '/')
  }

  return (
    <header className="header">
      <div className="header-row">
        <Link to={isSeller ? '/seller' : '/'} className="logo" aria-label="meesho home">
          meesho
        </Link>
        {!isSeller && (
          <form
            className="search"
            onSubmit={(e) => {
              e.preventDefault()
              navigate(q ? `/?q=${encodeURIComponent(q)}` : '/')
            }}
          >
            <span className="search-icon" aria-hidden>⌕</span>
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('search')} />
          </form>
        )}
        {isSeller && <div className="seller-badge">{t('sellerHub')}</div>}

        <div className="header-controls">
          <label className="ctl">
            <span>{t('viewingAs')}</span>
            <select value={profile.id} onChange={(e) => onProfile(e.target.value)}>
              <optgroup label={t('buyers')}>
                {profiles.filter((p) => p.type === 'buyer').map((p) => (
                  <option key={p.id} value={p.id}>{p.name} · {p.segment}</option>
                ))}
              </optgroup>
              <optgroup label={t('sellers')}>
                {profiles.filter((p) => p.type === 'seller').map((p) => (
                  <option key={p.id} value={p.id}>{p.name} · {p.city}</option>
                ))}
              </optgroup>
            </select>
          </label>
          <label className="ctl">
            <span>
              {t('language')}
              {translating ? <em className="tr-status"> · {t('translating')}</em> : trSource === 'offline' ? <em className="tr-status"> · offline</em> : null}
            </span>
            <select value={lang} onChange={(e) => setLang(e.target.value)}>
              {LANGUAGES.map((l) => (
                <option key={l.code} value={l.code}>{l.native} · {l.name}</option>
              ))}
            </select>
          </label>
          {!isSeller && (
            <button
              className={'nudge-toggle' + (nudges ? ' on' : '')}
              onClick={() => setNudges(!nudges)}
              title="Turn the AOV algorithm on/off to compare before vs after"
            >
              <span className="dot" /> {t('aiNudges')} {nudges ? t('on') : t('off')}
            </button>
          )}
          {!isSeller && (
            <>
              <NavLink to="/orders" className="icon-link">
                <span aria-hidden>📦</span>
                <small>{t('orders')}</small>
              </NavLink>
              <NavLink to="/cart" className="icon-link">
                <span aria-hidden>🛒</span>
                {count > 0 && <b className="badge">{count}</b>}
                <small>{t('cart')}</small>
              </NavLink>
            </>
          )}
        </div>
      </div>
      {!isSeller && (
        <nav className="cat-nav">
          <NavLink to="/" end className={() => (!params.get('cat') ? 'active' : '')}>{t('allCategories')}</NavLink>
          {CATEGORY_KEYS.map((c) => (
            <Link key={c} to={`/?cat=${encodeURIComponent(c)}`} className={params.get('cat') === c ? 'active' : ''}>
              {tx(c)}
            </Link>
          ))}
        </nav>
      )}
    </header>
  )
}


