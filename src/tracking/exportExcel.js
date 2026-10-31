// Excel dump of one user's two databases (behaviour history + preferences).
// SheetJS is loaded only when an export is requested.
import products from '../data/products.json'

const byId = Object.fromEntries(products.map((p) => [p.id, p]))
const iso = (t) => (t ? new Date(t).toISOString().replace('T', ' ').slice(0, 19) : '')
const flat = (obj, prefix = '') =>
  Object.entries(obj ?? {}).flatMap(([k, v]) =>
    v && typeof v === 'object' && !Array.isArray(v) ? flat(v, `${prefix}${k}.`) : [[`${prefix}${k}`, Array.isArray(v) ? v.join(', ') : v]],
  )

export async function exportUserExcel(data) {
  const XLSX = await import('xlsx')
  const { profile, behaviour: b, history, preferences, runs, orders } = data
  const wb = XLSX.utils.book_new()
  const sheet = (name, rows) => XLSX.utils.book_append_sheet(wb, rows.length ? XLSX.utils.json_to_sheet(rows) : XLSX.utils.aoa_to_sheet([['(no data yet)']]), name)
  const kv = (name, pairs) => XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['Field', 'Value'], ...pairs]), name)

  kv('Summary', [
    ['User', `${profile.name} (${profile.id})`], ['Segment', profile.segment], ['City', profile.city], ['Exported at', iso(Date.now())],
    ['Sessions', b.sessions], ['Total minutes', b.totalMinutes], ['Avg session (min)', +b.avgSessionMin.toFixed(2)],
    ['Avg scroll depth', +(b.avgScrollDepth * 100).toFixed(1) + '%'], ['Product views', b.totalProductViews],
    ['Products viewed more than once', b.repeatViews.length], ['Searches', b.searches.length],
    ['Search → product rate', b.searchToProductRate == null ? '' : +(b.searchToProductRate * 100).toFixed(1) + '%'],
    ['Cart additions', b.cartAdds], ['Bundle additions', b.bundleAdds], ['Orders', b.purchases.orders], ['Revenue (₹)', b.purchases.revenue],
    ['AOV (₹)', Math.round(b.purchases.aov)], ['Cart abandonment rate', +(b.abandonment.rate * 100).toFixed(1) + '%'],
    ['Returns', b.returns.count], ['Return rate', +(b.returns.rate * 100).toFixed(1) + '%'], ['Wishlist adds', b.wishlistAdds],
    ['Preferences version', preferences.current.version], ['Preferences source', preferences.current.source],
  ])
  sheet('Sessions', b.sessionRows.map((s) => ({
    Session: s.id, Start: s.start.replace('T', ' ').slice(0, 19), End: s.end.replace('T', ' ').slice(0, 19), 'Duration (s)': s.durationSec,
    Pages: s.pages, 'First page': s.firstPage, 'Exit page': s.exitPage, 'Avg scroll %': Math.round(s.avgScroll * 100),
    'Product views': s.productViews, Searches: s.searches, 'Cart adds': s.cartAdds, Purchases: s.purchases, Returns: s.returns,
    'Cart abandoned': s.abandoned ? 'yes' : 'no', 'Abandoned products': s.abandonedProducts.join(', '),
  })))
  sheet('Page views', history.sessions.flatMap((s) => (s.pages ?? []).map((p) => ({
    Session: s.id, Page: p.path, Type: p.kind, Entered: iso(p.enter), Left: iso(p.leave), 'Seconds': p.leave ? Math.round((p.leave - p.enter) / 1000) : '', 'Scroll %': Math.round((p.maxScroll ?? 0) * 100),
  }))))
  sheet('Events', history.sessions.flatMap((s) => s.events.map((e) => {
    const { t, type, page, ...rest } = e
    return { Session: s.id, Time: iso(t), Event: type, Page: page ?? '', Product: rest.productId ? `${rest.productId} ${byId[rest.productId]?.name ?? ''}` : '', Details: JSON.stringify(rest) }
  })))
  sheet('Product views', b.productViews.map((p) => ({ Product: p.id, Name: p.name, Category: p.category, Subcategory: p.subcategory, Price: p.price, Views: p.views, Sessions: p.sessions, 'Repeat view': p.views > 1 ? 'yes' : 'no', Purchased: p.purchased ? 'yes' : 'no' })))
  sheet('Category views', Object.entries(b.categoryViews).map(([c, n]) => ({ Category: c, Views: n, 'Cart adds': b.cartByCategory[c] ?? 0, 'Units bought': b.purchases.byCategory[c] ?? 0 })))
  sheet('Search journeys', b.searches.map((s) => ({ Time: s.at.replace('T', ' ').slice(0, 19), Query: s.query, Results: s.results ?? '', 'Opened product': s.productId ? `${s.productId} ${byId[s.productId]?.name ?? ''}` : '', 'Seconds to click': s.secondsToClick ?? '', 'Added to cart': s.addedToCart ? 'yes' : 'no', Purchased: s.purchased ? 'yes' : 'no' })))
  sheet('Cart', history.sessions.flatMap((s) => s.events.filter((e) => /cart/.test(e.type)).map((e) => ({ Session: s.id, Time: iso(e.t), Action: e.type, Product: `${e.productId} ${byId[e.productId]?.name ?? ''}`, Qty: e.qty ?? 1, Price: e.price ?? '', Bundle: e.bundleId ?? '' }))))
  sheet('Abandoned', b.abandonment.products.map((p) => ({ Product: p.id, Name: p.name, Category: p.category, 'Times abandoned': p.times })))
  sheet('Orders', orders.map((o) => ({
    Order: o.id, Placed: iso(o.placedAt), Items: o.lines.map((l) => `${l.qty}× ${byId[l.productId]?.name}`).join('; '), 'Total (₹)': o.total,
    Payment: o.plan ?? o.payment, 'Personal discount (₹)': o.quote?.personalDiscount ?? 0, Returned: o.returned ? 'yes' : 'no', 'Return reason': o.returned?.reason ?? '',
  })))
  sheet('Returns', orders.filter((o) => o.returned).map((o) => ({ Order: o.id, 'Returned at': iso(o.returned.at), Reason: o.returned.reason, Items: o.lines.map((l) => byId[l.productId]?.name).join('; '), 'Value (₹)': o.total })))
  kv('Preferences (current)', flat(preferences.current))
  sheet('Preference history', [...preferences.versions, preferences.current].map((v) => ({
    Version: v.version, 'Updated at': (v.updatedAt ?? '').replace('T', ' ').slice(0, 19), Source: v.source, Model: v.model ?? '',
    'Top categories': Object.entries(v.categoryWeights ?? {}).sort((a, c) => c[1] - a[1]).slice(0, 3).map(([k, w]) => `${k} ${w}`).join(', '),
    'Boosted subcategories': Object.entries(v.subcategoryBoost ?? {}).map(([k, w]) => `${k} ${w}`).join(', '),
    'Price band': (v.priceBand ?? []).join('–'), 'Discount %': v.discount?.pct ?? 0, Code: v.discount?.code ?? '', 'Bundle %': v.bundle?.discountPct ?? '',
    Reengage: (v.reengage ?? []).join(', '), Avoid: (v.avoid?.subcategories ?? []).join(', '), 'Hero message': v.layout?.heroMessage ?? '', Rationale: v.rationale ?? '',
  })))
  sheet('Gemini runs', runs.map((r) => ({ At: r.at.replace('T', ' ').slice(0, 19), Source: r.source, Model: r.model ?? '', 'Fallback reason': r.fallbackReason ?? '', 'Time (ms)': r.ms, Sessions: r.sessions, Changes: (r.changes ?? []).join(' | '), Prompt: (r.prompt ?? '').slice(0, 32000), Reply: (r.raw ?? '').slice(0, 32000) })))

  const date = new Date().toISOString().slice(0, 10)
  XLSX.writeFile(wb, `meesho_${profile.id}_${profile.name.replace(/\W+/g, '_')}_${date}.xlsx`)
}
