import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { PROFILES } from './data/personas.js'
import products from './data/products.json'
import { langByCode } from './data/languages.js'
import { CATEGORY_KEYS, EN, SELLER_TEXTS } from './i18n/strings.js'
import { fill, translateAll } from './i18n/translate.js'

const Ctx = createContext(null)
const EMPTY_MAP = {}
const EMPTY_CART = []

function usePersisted(key, initial) {
  const [v, setV] = useState(() => {
    try {
      const s = localStorage.getItem('meesho.' + key)
      return s ? JSON.parse(s) : initial
    } catch {
      return initial
    }
  })
  useEffect(() => {
    try {
      localStorage.setItem('meesho.' + key, JSON.stringify(v))
    } catch {
      /* ignore */
    }
  }, [key, v])
  return [v, setV]
}

// Everything the translator should know about, beyond UI strings.
const EXTRA_TEXTS = [
  ...CATEGORY_KEYS,
  ...new Set(products.map((p) => p.subcategory)),
  ...products.map((p) => p.name),
  ...PROFILES.flatMap((p) => [p.segment, p.blurb]),
  ...SELLER_TEXTS,
]
const ALL_TEXTS = [...new Set([...Object.values(EN), ...EXTRA_TEXTS])]

export function AppProvider({ children }) {
  const [profileId, setProfileId] = usePersisted('profile', 'U1')
  const [lang, setLangRaw] = usePersisted('lang', 'hi')
  const [nudges, setNudges] = usePersisted('nudges', true)
  const [carts, setCarts] = usePersisted('carts', {})
  const [tr, setTr] = useState({ lang: 'en', map: {}, source: null })
  const [translating, setTranslating] = useState(false)

  const profile = PROFILES.find((p) => p.id === profileId) ?? PROFILES[0]

  // Switching persona also switches to that persona's language.
  const switchProfile = useCallback(
    (id) => {
      const p = PROFILES.find((x) => x.id === id)
      setProfileId(id)
      if (p) setLangRaw(p.language)
    },
    [setProfileId, setLangRaw],
  )

  useEffect(() => {
    const l = langByCode(lang)
    document.documentElement.lang = lang
    document.documentElement.dir = l.rtl ? 'rtl' : 'ltr'
    if (lang === 'en') {
      setTr({ lang: 'en', map: {}, source: null })
      return
    }
    let cancelled = false
    setTranslating(true)
    translateAll(ALL_TEXTS, lang, { limited: l.limited }).then(({ map, source }) => {
      if (cancelled) return
      setTr({ lang, map, source })
      setTranslating(false)
    })
    return () => {
      cancelled = true
    }
  }, [lang])

  const map = tr.lang === lang ? tr.map : EMPTY_MAP
  const t = useCallback((key, vars) => {
    const en = EN[key] ?? key
    return fill(en, map[en], vars)
  }, [map])
  const tx = useCallback((text) => (text ? map[text] ?? text : text), [map])

  const cart = carts[profile.id] ?? EMPTY_CART
  const setCart = useCallback(
    (fn) => setCarts((all) => ({ ...all, [profile.id]: typeof fn === 'function' ? fn(all[profile.id] ?? []) : fn })),
    [profile.id, setCarts],
  )
  const addToCart = useCallback(
    (productId, qty = 1, bundleId) =>
      setCart((c) => {
        const i = c.findIndex((l) => l.productId === productId && (l.bundleId ?? null) === (bundleId ?? null))
        if (i >= 0) return c.map((l, j) => (j === i ? { ...l, qty: l.qty + qty } : l))
        return [...c, { productId, qty, ...(bundleId ? { bundleId } : {}) }]
      }),
    [setCart],
  )

  const value = useMemo(
    () => ({
      profile, profiles: PROFILES, switchProfile,
      lang, setLang: setLangRaw, translating, trSource: tr.source,
      nudges, setNudges,
      cart, setCart, addToCart,
      t, tx,
    }),
    [profile, switchProfile, lang, setLangRaw, translating, tr.source, nudges, setNudges, cart, setCart, addToCart, t, tx],
  )
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export const useApp = () => useContext(Ctx)

export const inr = (n) => '₹' + Math.round(n).toLocaleString('en-IN')
