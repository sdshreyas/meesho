// Demand forecast per product x city for the next 30 days, from order history.
// 1. Product total: weighted moving average of the last 8 weeks + half the trend,
//    with a Diwali uplift for festive products.
// 2. City split: the product's own city mix, shrunk towards the overall city mix
//    (Bayesian smoothing) so cities with few past orders still get a fair share.
import { CITIES, ORDERS, SCALE, productById } from './data.js'
import { FESTIVAL } from '../engine/config.js'

const SHRINK = 25 // pseudo-orders of prior

function weeksBack(orders, weeks = 8) {
  const last = new Date(orders[orders.length - 1].day + 'T00:00:00Z').getTime()
  const w = new Array(weeks).fill(0)
  for (const o of orders) {
    const k = Math.floor((last - new Date(o.day + 'T00:00:00Z').getTime()) / (7 * 86400000))
    if (k < weeks) w[weeks - 1 - k] += o.qty
  }
  return w
}

let overallShare
function cityPrior() {
  if (overallShare) return overallShare
  const counts = {}
  let total = 0
  for (const o of ORDERS().slice(-15000)) {
    counts[o.cityId] = (counts[o.cityId] ?? 0) + 1
    total += 1
  }
  overallShare = Object.fromEntries(CITIES.map((c) => [c.id, (counts[c.id] ?? 0) / total]))
  return overallShare
}

export function forecast(productId = 'all') {
  const all = ORDERS()
  const lastDay = all[all.length - 1].day
  const since = new Date(new Date(lastDay + 'T00:00:00Z').getTime() - 89 * 86400000).toISOString().slice(0, 10)
  const mine = productId === 'all' ? all : all.filter((o) => o.productId === productId)
  const weekly = weeksBack(mine)
  const recent = weekly.slice(-4)
  const wma = (recent[0] + 2 * recent[1] + 3 * recent[2] + 4 * recent[3]) / 10
  const earlier = weekly.slice(0, 4).reduce((s, x) => s + x, 0) / 4 || 1
  const trend = Math.max(-0.5, Math.min(0.8, (recent.reduce((s, x) => s + x, 0) / 4 - earlier) / earlier))
  const p = productById[productId]
  // October already carries most of the festive surge; only the Diwali week itself adds more
  const festive = productId === 'all' ? 1.05 : p?.tags.includes('festive') ? 1 + (FESTIVAL.uplift - 1) / 2 : 1
  const total30 = wma * (1 + trend * 0.3) * festive * (30 / 7)

  const prior = cityPrior()
  const counts = {}
  let n = 0
  for (const o of mine) {
    if (o.day < since) continue
    counts[o.cityId] = (counts[o.cityId] ?? 0) + o.qty
    n += o.qty
  }
  const points = CITIES.map((c) => {
    const share = productId === 'all' ? (counts[c.id] ?? 0) / Math.max(1, n) : ((counts[c.id] ?? 0) + SHRINK * prior[c.id]) / (n + SHRINK)
    return {
      cityId: c.id, name: c.name, state: c.state, tier: c.tier, lat: c.lat, lng: c.lng,
      past90: Math.round((counts[c.id] ?? 0) * SCALE),
      forecast30: Math.round(total30 * share * SCALE),
    }
  }).sort((a, b) => b.forecast30 - a.forecast30)

  return {
    productId,
    total30: Math.round(total30 * SCALE),
    past90: Math.round(n * SCALE),
    trend,
    festiveUplift: Math.round((festive - 1) * 100),
    weekly: weekly.map((v, i) => ({ week: `W-${8 - i}`, orders: v * SCALE })),
    points,
  }
}
