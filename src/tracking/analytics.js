// Turns a user's raw session history into the behaviour parameters used by the
// personalisation step, the My Data page and the Excel export.
import products from '../data/products.json'

const byId = Object.fromEntries(products.map((p) => [p.id, p]))
const pct = (xs, p) => {
  if (!xs.length) return null
  const s = [...xs].sort((a, b) => a - b)
  return s[Math.min(s.length - 1, Math.floor(p * s.length))]
}
const inc = (o, k, n = 1) => (o[k] = (o[k] ?? 0) + n)

export function sessionStats(s) {
  const durationSec = Math.max(0, Math.round(((s.lastActive ?? s.start) - s.start) / 1000))
  const scrolls = (s.pages ?? []).map((p) => p.maxScroll ?? 0)
  const added = s.events.filter((e) => e.type === 'add_to_cart')
  const purchased = new Set(s.events.filter((e) => e.type === 'purchase').flatMap((e) => e.items?.map((i) => i.productId) ?? []))
  const abandoned = added.filter((e) => !purchased.has(e.productId))
  return {
    id: s.id,
    start: new Date(s.start).toISOString(),
    end: new Date(s.lastActive ?? s.start).toISOString(),
    durationSec,
    pages: s.pages?.length ?? 0,
    firstPage: s.firstPage ?? '',
    exitPage: s.exitPage ?? '',
    avgScroll: scrolls.length ? scrolls.reduce((a, b) => a + b, 0) / scrolls.length : 0,
    productViews: s.events.filter((e) => e.type === 'product_view').length,
    searches: s.events.filter((e) => e.type === 'search').length,
    cartAdds: added.length,
    purchases: s.events.filter((e) => e.type === 'purchase').length,
    returns: s.events.filter((e) => e.type === 'return').length,
    abandoned: added.length > 0 && abandoned.length > 0 && purchased.size === 0,
    abandonedProducts: [...new Set(abandoned.map((e) => e.productId))],
  }
}

/** Behaviour summary across all sessions (plus orders from the order database). */
export function computeBehaviour(history, orders = []) {
  const sessions = history.sessions ?? []
  const stats = sessions.map(sessionStats)
  const events = sessions.flatMap((s) => s.events.map((e) => ({ ...e, sessionId: s.id })))

  const productViews = {}
  const viewSessions = {}
  const categoryViews = {}
  const subcategoryViews = {}
  const viewedPrices = []
  for (const e of events) {
    if (e.type === 'product_view') {
      const p = byId[e.productId]
      if (!p) continue
      inc(productViews, p.id)
      ;(viewSessions[p.id] ??= new Set()).add(e.sessionId)
      inc(categoryViews, p.category)
      inc(subcategoryViews, p.subcategory)
      viewedPrices.push(p.price)
    }
    if (e.type === 'category_view') inc(categoryViews, e.category, 2) // browsing a whole category counts double
  }

  // search → product journeys: each search, then the first product opened from its results
  const searches = []
  for (const s of sessions) {
    let open = null
    for (const e of s.events) {
      if (e.type === 'search') {
        open = { query: e.query, at: new Date(e.t).toISOString(), results: null, productId: null, secondsToClick: null, addedToCart: false, purchased: false }
        searches.push(open)
      } else if (open && e.type === 'search_results' && e.query === open.query) open.results = e.count
      else if (open && e.type === 'product_view' && e.source === 'search' && !open.productId) {
        open.productId = e.productId
        open.secondsToClick = Math.round((e.t - new Date(open.at).getTime()) / 1000)
      } else if (open?.productId && e.type === 'add_to_cart' && e.productId === open.productId) open.addedToCart = true
      else if (open?.productId && e.type === 'purchase' && e.items?.some((i) => i.productId === open.productId)) open.purchased = true
    }
  }

  const cartAdds = events.filter((e) => e.type === 'add_to_cart')
  const cartByCategory = {}
  for (const e of cartAdds) if (byId[e.productId]) inc(cartByCategory, byId[e.productId].category, e.qty ?? 1)
  const bundleAdds = cartAdds.filter((e) => e.bundleId).length

  const myOrders = orders.filter((o) => o.personaId === history.profileId)
  const purchasedIds = new Set(myOrders.flatMap((o) => o.lines.map((l) => l.productId)))
  const purchaseByCategory = {}
  for (const o of myOrders) for (const l of o.lines) if (byId[l.productId]) inc(purchaseByCategory, byId[l.productId].category, l.qty)
  const revenue = myOrders.reduce((s, o) => s + o.total, 0)
  const returned = myOrders.filter((o) => o.returned)
  const returnsBySub = {}
  const returnsByReason = {}
  for (const o of returned) {
    inc(returnsByReason, o.returned.reason)
    for (const l of o.lines) if (byId[l.productId]) inc(returnsBySub, byId[l.productId].subcategory)
  }

  const abandonedProducts = {}
  for (const s of stats) for (const id of s.abandonedProducts) if (!purchasedIds.has(id)) inc(abandonedProducts, id)
  const sessionsWithCart = stats.filter((s) => s.cartAdds > 0).length
  const firstPages = {}
  const exitPages = {}
  for (const s of stats) {
    if (s.firstPage) inc(firstPages, s.firstPage)
    if (s.exitPage) inc(exitPages, s.exitPage)
  }
  const scrollByKind = {}
  for (const s of sessions) for (const p of s.pages ?? []) (scrollByKind[p.kind] ??= []).push(p.maxScroll ?? 0)

  const productRows = Object.entries(productViews)
    .map(([id, views]) => ({ id, name: byId[id].name, category: byId[id].category, subcategory: byId[id].subcategory, price: byId[id].price, views, sessions: viewSessions[id].size, purchased: purchasedIds.has(id) }))
    .sort((a, b) => b.views - a.views)

  return {
    profileId: history.profileId,
    sessions: stats.length,
    totalMinutes: Math.round(stats.reduce((s, x) => s + x.durationSec, 0) / 60),
    avgSessionMin: stats.length ? stats.reduce((s, x) => s + x.durationSec, 0) / stats.length / 60 : 0,
    avgScrollDepth: stats.length ? stats.reduce((s, x) => s + x.avgScroll, 0) / stats.length : 0,
    scrollByPage: Object.fromEntries(Object.entries(scrollByKind).map(([k, v]) => [k, v.reduce((a, b) => a + b, 0) / v.length])),
    firstPages, exitPages,
    productViews: productRows,
    totalProductViews: productRows.reduce((s, p) => s + p.views, 0),
    repeatViews: productRows.filter((p) => p.views > 1),
    categoryViews, subcategoryViews,
    viewedPrice: { p25: pct(viewedPrices, 0.25), median: pct(viewedPrices, 0.5), p75: pct(viewedPrices, 0.75) },
    searches,
    searchToProductRate: searches.length ? searches.filter((s) => s.productId).length / searches.length : null,
    cartAdds: cartAdds.length,
    bundleAdds,
    cartByCategory,
    purchases: { orders: myOrders.length, units: myOrders.reduce((s, o) => s + o.lines.reduce((a, l) => a + l.qty, 0), 0), revenue, aov: myOrders.length ? revenue / myOrders.length : 0, byCategory: purchaseByCategory, payments: myOrders.reduce((m, o) => (inc(m, o.plan ?? o.payment), m), {}) },
    cartToPurchaseRate: cartAdds.length ? Math.min(1, myOrders.reduce((s, o) => s + o.lines.length, 0) / cartAdds.length) : null,
    abandonment: { sessionsWithCart, abandonedSessions: stats.filter((s) => s.abandoned).length, rate: sessionsWithCart ? stats.filter((s) => s.abandoned).length / sessionsWithCart : 0, products: Object.entries(abandonedProducts).map(([id, n]) => ({ id, name: byId[id]?.name, category: byId[id]?.category, times: n })) },
    returns: { count: returned.length, rate: myOrders.length ? returned.length / myOrders.length : 0, byReason: returnsByReason, bySubcategory: returnsBySub },
    wishlistAdds: events.filter((e) => e.type === 'wishlist' && e.on).length,
    sessionRows: stats,
  }
}
