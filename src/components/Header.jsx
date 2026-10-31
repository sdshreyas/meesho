import { useEffect, useState } from 'react'
import { Link, NavLink, useNavigate, useSearchParams } from 'react-router-dom'
import { useApp } from '../store.jsx'
import { LANGUAGES } from '../data/languages.js'
import { CATEGORY_KEYS } from '../i18n/strings.js'
import ThemeToggle from './ThemeToggle.jsx'
import { track } from '../tracking/tracker.js'

export default function Header() {
  const { profile, logout, lang, setLang, translating, trSource, nudges, setNudges, cart, t, tx } = useApp()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const [q, setQ] = useState(params.get('q') ?? '')
  useEffect(() => setQ(params.get('q') ?? ''), [params])
  const isSeller = profile.type === 'seller'
  const isOps = profile.type === 'ops'
  const isBuyer = profile.type === 'buyer'
  const count = cart.reduce((s, l) => s + l.qty, 0)

  return (
    <header className="header">
      <div className="header-row">
        <Link to={isOps ? '/ops' : isSeller ? '/seller' : '/'} className="logo" aria-label="meesho home">
          meesho
        </Link>
        {isBuyer && (
          <form
            className="search"
            onSubmit={(e) => {
              e.preventDefault()
              if (q) track('search', { query: q.trim().toLowerCase() })
              navigate(q ? `/?q=${encodeURIComponent(q)}` : '/')
            }}
          >
            <span className="search-icon" aria-hidden>⌕</span>
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('search')} />
          </form>
        )}
        {isSeller && <div className="seller-badge">{t('sellerHub')}</div>}
        {isOps && <div className="seller-badge ops">🚚 Valmo Control Tower</div>}

        <div className="header-controls">
          <ThemeToggle />
          <div className="account">
            <span className="avatar sm">{profile.name.split(' ').map((w) => w[0]).join('')}</span>
            <span className="account-info">
              <b>{isSeller || isOps ? profile.owner : profile.name}</b>
              <small>{isSeller ? profile.name : tx(profile.segment)}</small>
            </span>
            <button className="logout" onClick={logout} title={t('logout')}>⎋ {t('logout')}</button>
          </div>
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
          {isBuyer && (
            <button
              className={'nudge-toggle' + (nudges ? ' on' : '')}
              onClick={() => setNudges(!nudges)}
              title="Turn the AOV algorithm on/off to compare before vs after"
            >
              <span className="dot" /> {t('aiNudges')} {nudges ? t('on') : t('off')}
            </button>
          )}
          <NavLink to="/my-data" className="icon-link">
            <span aria-hidden>📊</span>
            <small>{t('myData')}</small>
          </NavLink>
          {isBuyer && (
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
      {isBuyer && (
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


