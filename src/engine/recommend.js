// Persona-aware recommendation engine. Every score is a sum of explainable
// signals, and the top signals become the "Why this?" reasons on each card.
import { BUNDLE_DISCOUNT_PCT, COMPLEMENTS } from './config.js'

const popularity = (p) => ((p.rating / 5) * Math.log10(p.ratingCount)) / 4

function genderOk(p, persona) {
  return p.gender === 'unisex' || !persona.gender || p.gender === persona.gender
}

export function scoreProduct(p, persona, ctx = {}, byId = {}) {
  const signals = []
  const add = (key, w) => w > 0 && signals.push({ key, w })

  const aff = persona.affinity[p.category] ?? 0.05
  let score = aff * 3
  if (aff >= 0.7) add('r_category', aff * 3)

  if (!genderOk(p, persona)) score -= 5

  const [lo, hi] = persona.priceBand
  const mid = (lo + hi) / 2
  const half = (hi - lo) / 2
  const priceFit = Math.exp(-(((p.price - mid) / half) ** 2) / 2)
  score += priceFit * 1.5
  if (priceFit > 0.8) add('r_price', priceFit * 1.5)

  const hits = p.tags.filter((t) => persona.preferredTags.includes(t))
  score += hits.length * 0.6
  if (hits.length) add('r_tag_' + hits[0], hits.length * 0.6 + 0.1)

  score += popularity(p)
  if (p.tags.includes('trending')) score += 0.2

  const histSubs = (persona.pastPurchases ?? []).map((id) => byId[id]?.subcategory)
  if (histSubs.includes(p.subcategory)) {
    score += 0.6
    add('r_history', 0.9)
  }

  if (ctx.cartSubs?.some((sc) => COMPLEMENTS[sc]?.includes(p.subcategory))) {
    score += 2
    add('r_cart', 2)
  }

  // AOV nudge: items that close the gap to the next threshold rank higher
  if (ctx.gap > 0 && p.price >= ctx.gap && p.price <= ctx.gap + 200) {
    score += 1.5
    add('r_gap', 2.5)
  }

  signals.sort((a, b) => b.w - a.w)
  return { score, reasons: signals.slice(0, 2).map((s) => s.key) }
}

// Greedy re-rank: each earlier pick from the same subcategory costs 0.9 points,
// so the feed mixes shirts, shoes, gadgets… instead of six shirts in a row.
function diversify(items) {
  const left = [...items]
  const seen = {}
  const out = []
  while (left.length) {
    let best = 0
    let bestScore = -Infinity
    left.forEach((p, i) => {
      const s = p.score - 0.9 * (seen[p.subcategory] ?? 0)
      if (s > bestScore) {
        bestScore = s
        best = i
      }
    })
    const [pick] = left.splice(best, 1)
    seen[pick.subcategory] = (seen[pick.subcategory] ?? 0) + 1
    out.push(pick)
  }
  return out
}

/**
 * Ranks products for a persona. With nudges off it falls back to a plain
 * popularity sort (the "before" baseline) and no reasons are shown.
 */
export function recommend(products, persona, { nudges = true, exclude = [], cartSubs, gap, limit } = {}) {
  const byId = Object.fromEntries(products.map((p) => [p.id, p]))
  const pool = products.filter((p) => !exclude.includes(p.id))
  let ranked
  if (!nudges || !persona) {
    ranked = pool.map((p) => ({ ...p, score: popularity(p), reasons: [] })).sort((a, b) => b.score - a.score)
  } else {
    ranked = pool
      .map((p) => ({ ...p, ...scoreProduct(p, persona, { cartSubs, gap }, byId) }))
      .filter((p) => genderOk(p, persona))
    ranked = diversify(ranked)
  }
  return limit ? ranked.slice(0, limit) : ranked
}

/** "Complete the look": the product plus the best match from 2 complementary subcategories. */
export function buildBundle(product, products, persona, avoid = []) {
  const subs = COMPLEMENTS[product.subcategory] ?? []
  const ranked = recommend(products, persona, { exclude: [product.id, ...avoid] })
  const picks = []
  for (const sub of subs) {
    const pick = ranked.find((p) => p.subcategory === sub && !picks.some((x) => x.id === p.id))
    if (pick) picks.push(pick)
    if (picks.length === 2) break
  }
  if (picks.length < 2) return null
  const items = [product, ...picks]
  const total = items.reduce((s, p) => s + p.price, 0)
  const price = Math.round(total * (1 - BUNDLE_DISCOUNT_PCT / 100))
  return { id: 'B-' + items.map((p) => p.id).join('-'), items, total, price, savings: total - price }
}

/** Bundles for the home feed: anchored on the persona's top-ranked products. */
export function bundlesForPersona(products, persona, n = 3) {
  const out = []
  const usedSubs = new Set()
  const usedIds = new Set()
  for (const p of recommend(products, persona)) {
    if (usedSubs.has(p.subcategory) || usedIds.has(p.id)) continue
    const b = buildBundle(p, products, persona, [...usedIds])
    if (b) {
      out.push(b)
      usedSubs.add(p.subcategory)
      b.items.forEach((x) => usedIds.add(x.id))
    }
    if (out.length === n) break
  }
  return out
}

export function frequentlyBought(product, products, persona, n = 4) {
  const subs = COMPLEMENTS[product.subcategory] ?? []
  return recommend(products, persona, { exclude: [product.id], cartSubs: [product.subcategory] })
    .filter((p) => subs.includes(p.subcategory))
    .slice(0, n)
}

export function similar(product, products, persona, n = 6) {
  return recommend(products, persona, { exclude: [product.id] })
    .filter((p) => p.subcategory === product.subcategory || p.category === product.category)
    .slice(0, n)
}
