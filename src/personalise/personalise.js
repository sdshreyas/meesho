// Personalisation step run right after a buyer signs in:
//   behaviour history  →  prompt  →  Gemini  →  validated preferences  →  saved as a new version
// Without an API key (or if Gemini fails) a transparent rule-based updater is used instead.
import products from '../data/products.json'
import { SECTIONS } from '../mocks/userdb.js'

const byId = Object.fromEntries(products.map((p) => [p.id, p]))
const CATEGORIES = [...new Set(products.map((p) => p.category))]
const SUBCATEGORIES = [...new Set(products.map((p) => p.subcategory))]
const TAGS = [...new Set(products.flatMap((p) => p.tags))]
const STYLES = ['ethnic', 'western']
export const LIMITS = { maxDiscountPct: 15, minBundlePct: 8, maxBundlePct: 20, maxReengage: 8 }

const GEMINI = 'https://generativelanguage.googleapis.com/v1beta'
const MODEL_KEY = 'meesho.gemini.model'

// ---------------- prompt ----------------

const SYSTEM = `You are the personalisation engine of Meesho, an Indian value e-commerce marketplace (average order value ~₹270, price-sensitive tier-2/3 shoppers, COD heavy).
Your job: update ONE shopper's preference record from their behaviour history so the storefront shows more relevant products, better bundles and sensible offers.
Goals, in order: (1) increase this shopper's purchase probability and average order value, (2) protect profitability — discounts cost margin (~35% gross), so give one only when behaviour justifies it (cart abandonment, repeat views without purchase, a lapsed buyer, or loyalty), (3) reduce returns by down-weighting what this shopper returns.
Rules: use ONLY the category, subcategory, tag, style names and product ids provided. Personal discount pct is an integer 0-${LIMITS.maxDiscountPct}. Bundle discountPct is an integer ${LIMITS.minBundlePct}-${LIMITS.maxBundlePct}. At most ${LIMITS.maxReengage} reengage product ids, chosen from products this shopper viewed or abandoned. Weights: categoryWeights 0-1, subcategoryBoost -1 to 1.
Respond with ONLY a JSON object, no markdown.`

function compactBehaviour(b) {
  return {
    sessions: b.sessions,
    avgSessionMinutes: +b.avgSessionMin.toFixed(1),
    avgScrollDepthPct: Math.round(b.avgScrollDepth * 100),
    firstPages: b.firstPages,
    exitPages: b.exitPages,
    topViewedProducts: b.productViews.slice(0, 15).map((p) => ({ id: p.id, name: p.name, subcategory: p.subcategory, price: p.price, views: p.views, sessions: p.sessions, purchased: p.purchased })),
    repeatViewedNotPurchased: b.repeatViews.filter((p) => !p.purchased).map((p) => p.id),
    categoryViews: b.categoryViews,
    subcategoryViews: b.subcategoryViews,
    viewedPriceRange: b.viewedPrice,
    searches: b.searches.slice(-12).map((s) => ({ query: s.query, results: s.results, openedProduct: s.productId, secondsToClick: s.secondsToClick, addedToCart: s.addedToCart, purchased: s.purchased })),
    cartAdds: b.cartAdds,
    bundleAdds: b.bundleAdds,
    cartAddsByCategory: b.cartByCategory,
    purchases: b.purchases,
    cartAbandonment: b.abandonment,
    returns: b.returns,
    wishlistAdds: b.wishlistAdds,
  }
}

export function buildPrompt(profile, behaviour, current) {
  const input = {
    shopper: { id: profile.id, segment: profile.segment, city: profile.city, tier: profile.tier, gender: profile.gender, age: profile.age, usualPayment: profile.payment },
    behaviourHistory: compactBehaviour(behaviour),
    currentPreferences: current,
    allowed: { categories: CATEGORIES, subcategories: SUBCATEGORIES, tags: TAGS, styles: STYLES, sections: SECTIONS },
  }
  const schema = {
    categoryWeights: '{ <category>: 0..1 }',
    subcategoryBoost: '{ <subcategory>: -1..1 }',
    priceBand: '[minRupees, maxRupees]',
    preferredTags: '[tag]',
    styles: '[ethnic|western]',
    discount: `{ pct: 0..${LIMITS.maxDiscountPct}, categories: [category] (empty = all), code: 'UPPERCASE', reason: 'short shopper-facing line' }`,
    bundle: `{ discountPct: ${LIMITS.minBundlePct}..${LIMITS.maxBundlePct}, focusSubcategories: [subcategory] }`,
    reengage: '[productId] — shown as "Still thinking about these?"',
    avoid: '{ subcategories: [subcategory], productIds: [productId] }',
    nudges: '{ highlightBnpl: boolean, urgency: boolean }',
    layout: `{ heroMessage: 'max 100 chars, warm, shopper-facing', sectionOrder: [${SECTIONS.join(', ')}] }`,
    insights: '[max 4 short internal observations]',
    rationale: 'max 300 chars: why these changes',
  }
  return `${JSON.stringify(input)}\n\nReturn the UPDATED preference record with exactly these keys:\n${JSON.stringify(schema, null, 1)}`
}

// ---------------- Gemini ----------------

async function pickModel(apiKey) {
  try {
    const cached = localStorage.getItem(MODEL_KEY)
    if (cached) return cached
  } catch { /* ignore */ }
  let model = 'gemini-2.5-flash'
  try {
    const res = await fetch(`${GEMINI}/models?key=${encodeURIComponent(apiKey)}&pageSize=200`)
    if (res.ok) {
      const { models = [] } = await res.json()
      const flash = models
        .filter((m) => m.supportedGenerationMethods?.includes('generateContent'))
        .map((m) => m.name.replace('models/', ''))
        .filter((n) => /^gemini-\d+(\.\d+)?-flash$/.test(n))
        .sort((a, b) => parseFloat(b.split('-')[1]) - parseFloat(a.split('-')[1]))
      if (flash[0]) model = flash[0]
    }
  } catch { /* use default */ }
  try { localStorage.setItem(MODEL_KEY, model) } catch { /* ignore */ }
  return model
}

export async function callGemini(apiKey, prompt, { timeoutMs = 25000 } = {}) {
  const model = await pickModel(apiKey)
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    const res = await fetch(`${GEMINI}/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: ctrl.signal,
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM }] },
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: 'application/json', temperature: 0.4, maxOutputTokens: 4096 },
      }),
    })
    const json = await res.json().catch(() => ({}))
    if (!res.ok) {
      if (res.status === 404) try { localStorage.removeItem(MODEL_KEY) } catch { /* ignore */ }
      throw new Error(json.error?.message ?? `Gemini error ${res.status}`)
    }
    const text = (json.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? '').join('').trim()
    const clean = text.replace(/^```(?:json)?\s*|\s*```$/g, '')
    return { model, raw: text, data: JSON.parse(clean), usage: json.usageMetadata ?? null }
  } finally {
    clearTimeout(timer)
  }
}

// ---------------- validation (guardrails) ----------------

const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x))
const num = (x) => (typeof x === 'number' && Number.isFinite(x) ? x : null)
const pickKnown = (obj, allowed, lo, hi) =>
  Object.fromEntries(Object.entries(obj ?? {}).filter(([k, v]) => allowed.includes(k) && num(v) !== null).map(([k, v]) => [k, +clamp(v, lo, hi).toFixed(2)]))
const listOf = (arr, allowed, max = 20) => (Array.isArray(arr) ? [...new Set(arr.filter((x) => allowed.includes(x)))].slice(0, max) : null)
const text = (s, max) => (typeof s === 'string' ? s.trim().slice(0, max) : null)

/** Keep only known names, clamp numbers to business limits, fall back to previous values. */
export function sanitize(out, prev) {
  const ids = Object.keys(byId)
  const next = { ...prev }
  if (out.categoryWeights) next.categoryWeights = { ...prev.categoryWeights, ...pickKnown(out.categoryWeights, CATEGORIES, 0, 1) }
  if (out.subcategoryBoost) next.subcategoryBoost = pickKnown(out.subcategoryBoost, SUBCATEGORIES, -1, 1)
  if (Array.isArray(out.priceBand) && num(out.priceBand[0]) !== null && num(out.priceBand[1]) !== null) {
    const lo = clamp(Math.round(out.priceBand[0]), 50, 4000)
    const hi = clamp(Math.round(out.priceBand[1]), lo + 50, 6000)
    next.priceBand = [lo, hi]
  }
  next.preferredTags = listOf(out.preferredTags, TAGS, 6) ?? prev.preferredTags
  next.styles = listOf(out.styles, STYLES, 2) ?? prev.styles
  if (out.discount) {
    const pct = clamp(Math.round(num(out.discount.pct) ?? 0), 0, LIMITS.maxDiscountPct)
    next.discount = {
      pct,
      categories: listOf(out.discount.categories, CATEGORIES, 8) ?? [],
      code: pct ? (text(out.discount.code, 16) ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '') || `SAVE${pct}` : '',
      reason: pct ? text(out.discount.reason, 140) ?? '' : '',
    }
  }
  if (out.bundle) {
    next.bundle = {
      discountPct: clamp(Math.round(num(out.bundle.discountPct) ?? prev.bundle.discountPct), LIMITS.minBundlePct, LIMITS.maxBundlePct),
      focusSubcategories: listOf(out.bundle.focusSubcategories, SUBCATEGORIES, 4) ?? [],
    }
  }
  next.reengage = listOf(out.reengage, ids, LIMITS.maxReengage) ?? prev.reengage
  if (out.avoid) next.avoid = { subcategories: listOf(out.avoid.subcategories, SUBCATEGORIES, 6) ?? [], productIds: listOf(out.avoid.productIds, ids, 10) ?? [] }
  if (out.nudges) next.nudges = { highlightBnpl: !!out.nudges.highlightBnpl, urgency: !!out.nudges.urgency }
  if (out.layout) {
    const order = listOf(out.layout.sectionOrder, SECTIONS, SECTIONS.length) ?? []
    next.layout = { heroMessage: text(out.layout.heroMessage, 120) ?? prev.layout.heroMessage, sectionOrder: [...order, ...SECTIONS.filter((s) => !order.includes(s))] }
  }
  next.insights = Array.isArray(out.insights) ? out.insights.filter((x) => typeof x === 'string').map((x) => x.slice(0, 160)).slice(0, 4) : prev.insights
  next.rationale = text(out.rationale, 400) ?? ''
  return next
}

// ---------------- rule-based updater (no key / fallback) ----------------

export function rulesUpdate(prev, b, profile) {
  const next = structuredClone(prev)
  const engage = {}
  const add = (cat, w) => cat && (engage[cat] = (engage[cat] ?? 0) + w)
  for (const [c, n] of Object.entries(b.categoryViews)) add(c, n)
  for (const [c, n] of Object.entries(b.cartByCategory)) add(c, 3 * n)
  for (const [c, n] of Object.entries(b.purchases.byCategory)) add(c, 5 * n)
  const maxE = Math.max(1, ...Object.values(engage))
  for (const c of CATEGORIES) {
    const base = profile.affinity?.[c] ?? 0.05
    const e = (engage[c] ?? 0) / maxE
    next.categoryWeights[c] = +clamp(Object.keys(engage).length ? 0.5 * base + 0.5 * e : base, 0, 1).toFixed(2)
  }
  const subs = Object.entries(b.subcategoryViews).sort((x, y) => y[1] - x[1]).slice(0, 4)
  next.subcategoryBoost = Object.fromEntries(subs.map(([s], i) => [s, +(0.8 - i * 0.15).toFixed(2)]))
  for (const [s, n] of Object.entries(b.returns.bySubcategory)) next.subcategoryBoost[s] = -Math.min(1, 0.4 * n)
  if (b.viewedPrice.p25 != null && b.totalProductViews >= 5) next.priceBand = [Math.max(50, Math.round(b.viewedPrice.p25 * 0.85)), Math.round(b.viewedPrice.p75 * 1.15)]

  const abandonedCats = [...new Set(b.abandonment.products.map((p) => p.category).filter(Boolean))]
  if (b.abandonment.rate >= 0.5 && abandonedCats.length) next.discount = { pct: 10, categories: abandonedCats, code: 'COMEBACK10', reason: 'Still thinking it over? 10% off what you left in your cart' }
  else if (b.purchases.orders >= 3) next.discount = { pct: 5, categories: [], code: 'LOYAL5', reason: 'Thank you for shopping with us — 5% off your next order' }
  else if (b.sessions >= 2 && b.purchases.orders === 0 && subs.length) next.discount = { pct: 8, categories: [byId[b.productViews[0]?.id]?.category].filter(Boolean), code: 'FIRST8', reason: '8% off your first order in your favourite category' }
  else next.discount = { pct: 0, categories: [], code: '', reason: '' }

  next.bundle = { discountPct: b.bundleAdds > 0 ? 15 : 12, focusSubcategories: subs.slice(0, 2).map(([s]) => s) }
  next.reengage = [...new Set([...b.abandonment.products.map((p) => p.id), ...b.repeatViews.filter((p) => !p.purchased).map((p) => p.id)])].slice(0, LIMITS.maxReengage)
  next.avoid = { subcategories: Object.entries(b.returns.bySubcategory).filter(([, n]) => n >= 2).map(([s]) => s), productIds: [] }
  next.nudges = { highlightBnpl: b.cartAdds >= 3 && b.purchases.orders === 0, urgency: b.repeatViews.length >= 2 }
  const top = subs[0]?.[0]
  next.layout = {
    heroMessage: next.reengage.length ? 'Welcome back! Your saved picks are waiting for you' : top ? `Fresh ${top} picked for you today` : '',
    sectionOrder: next.reengage.length ? ['reengage', ...SECTIONS.filter((s) => s !== 'reengage')] : SECTIONS,
  }
  next.insights = [
    b.sessions ? `${b.sessions} sessions, ${b.totalProductViews} product views` : 'No history yet — using profile defaults',
    b.abandonment.sessionsWithCart ? `Cart abandonment ${Math.round(b.abandonment.rate * 100)}%` : null,
    b.returns.count ? `${b.returns.count} returns` : null,
  ].filter(Boolean)
  next.rationale = 'Rule-based update: weights blend profile affinity with views, cart adds and purchases; offers target abandonment, first purchase or loyalty; returned subcategories are down-weighted.'
  return next
}

/** Human-readable list of what changed between two preference versions. */
export function describeChanges(prev, next) {
  const out = []
  const top = (w) => Object.entries(w ?? {}).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k]) => k)
  const a = top(prev.categoryWeights).join(', ')
  const b = top(next.categoryWeights).join(', ')
  if (a !== b) out.push(`Top categories: ${b}`)
  const boosts = Object.entries(next.subcategoryBoost ?? {}).filter(([, v]) => v > 0.2).map(([k]) => k)
  if (boosts.length) out.push(`Boosting ${boosts.slice(0, 4).join(', ')}`)
  const drops = Object.entries(next.subcategoryBoost ?? {}).filter(([, v]) => v < -0.2).map(([k]) => k)
  if (drops.length) out.push(`Showing less ${drops.join(', ')}`)
  if (next.priceBand.join() !== prev.priceBand.join()) out.push(`Price range ₹${next.priceBand[0]}–${next.priceBand[1]}`)
  if (next.discount.pct !== prev.discount.pct || next.discount.code !== prev.discount.code) out.push(next.discount.pct ? `Personal offer ${next.discount.pct}% (${next.discount.code})${next.discount.categories.length ? ' on ' + next.discount.categories.join(', ') : ''}` : 'No personal discount')
  if (next.bundle.discountPct !== prev.bundle.discountPct) out.push(`Bundle discount ${next.bundle.discountPct}%`)
  if (next.reengage.length) out.push(`${next.reengage.length} products to re-engage`)
  return out.length ? out : ['No major changes']
}
