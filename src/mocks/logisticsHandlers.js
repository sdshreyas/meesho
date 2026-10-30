// Valmo Control Tower API: network, demand forecast, routing, optimisation and
// new-DC scenario simulation. Served in-browser by Mock Service Worker.
import { http, HttpResponse, delay } from 'msw'
import {
  BASE_DCS, CITIES, DC_TYPES, ORDERS, PARTNERS, SCALE, SELLERS, cityById, km, productById, sellerById, sellersByProduct, weightOf,
} from '../logistics/data.js'
import {
  COST, MODE_LABEL, VEHICLE, allocateDay, defaultFleet, groupByDay, options, ordersInPeriod, prepareNetwork, simulate, withNewDcs,
} from '../logistics/optimizer.js'
import { forecast } from '../logistics/forecast.js'

const FLEET_KEY = 'meesho.valmo.fleet.v1'
let baseFleet
const fleet = () => {
  if (baseFleet) return baseFleet
  baseFleet = defaultFleet(BASE_DCS, ORDERS())
  try {
    Object.assign(baseFleet, JSON.parse(localStorage.getItem(FLEET_KEY)) ?? {})
  } catch {
    /* use defaults */
  }
  return baseFleet
}
const saveFleet = () => {
  try {
    localStorage.setItem(FLEET_KEY, JSON.stringify(baseFleet))
  } catch {
    /* in-memory only */
  }
}

const latestDay = () => groupByDay(ORDERS()).at(-1)

// Typical Valmo volumes (from the latest day's optimised plan) used to price a single new order
let typicalLoad
function loadFromLatest() {
  if (typicalLoad) return typicalLoad
  const [, orders] = latestDay()
  const net = prepareNetwork(BASE_DCS)
  const { choice } = allocateDay(orders, net, fleet())
  typicalLoad = { seller: {}, lane: {}, city: {} }
  orders.forEach((o, i) => {
    const c = choice[i]
    if (c.mode !== 'valmo' && c.mode !== 'hybrid') return
    typicalLoad.seller[o.sellerId] = (typicalLoad.seller[o.sellerId] ?? 0) + 1
    typicalLoad.lane[c.originDc + c.destDc] = (typicalLoad.lane[c.originDc + c.destDc] ?? 0) + Math.max(o.weight, 0.5)
    if (c.mode === 'valmo') typicalLoad.city[o.cityId] = (typicalLoad.city[o.cityId] ?? 0) + 1
  })
  return typicalLoad
}

const dcPublic = (dc, f) => ({ ...dc, typeLabel: DC_TYPES[dc.type].label, fleet: f?.[dc.id], ...DC_TYPES[dc.type] })

export const logisticsHandlers = [
  http.get('*/api/logistics/network', async () => {
    await delay(150)
    const f = fleet()
    const ninety = ORDERS().slice(-15000)
    const sellerOrders = {}
    for (const o of ninety) sellerOrders[o.sellerId] = (sellerOrders[o.sellerId] ?? 0) + 1
    return HttpResponse.json({
      scale: SCALE,
      dcs: BASE_DCS.map((d) => dcPublic(d, f)),
      sellers: SELLERS.map((s) => ({ ...s, products: s.products.length, productIds: s.products, orders90: (sellerOrders[s.id] ?? 0) * SCALE })),
      cities: CITIES,
      partners: PARTNERS.map((p) => ({ id: p.id, name: p.name })),
      dcTypes: DC_TYPES,
      vehicles: VEHICLE,
      historyOrders: ORDERS().length * SCALE,
    })
  }),

  // Demand forecast heat map. ?product=P001 | all
  http.get('*/api/logistics/forecast', async ({ request }) => {
    await delay(120)
    const product = new URL(request.url).searchParams.get('product') || 'all'
    const fc = forecast(product)
    // share of forecast demand inside Valmo's last-mile reach
    const net = prepareNetwork(BASE_DCS)
    const covered = fc.points.reduce((s, p) => s + (net.dest[p.cityId] ? p.forecast30 : 0), 0)
    const sellers = product === 'all' ? SELLERS : sellersByProduct[product] ?? []
    return HttpResponse.json({ ...fc, coveredShare: covered / Math.max(1, fc.total30), sellerIds: sellers.map((s) => s.id) })
  }),

  // Price one new order across Valmo, hybrid and partners
  http.post('*/api/logistics/quote', async ({ request }) => {
    await delay(150)
    const { productId, sellerId, cityId, qty = 1, cod = true } = await request.json()
    const p = productById[productId]
    const seller = sellerById[sellerId]
    const city = cityById[cityId]
    if (!p || !seller || !city) return HttpResponse.json({ error: 'invalid' }, { status: 400 })
    const order = { productId, sellerId, cityId, qty, cod, weight: weightOf(p) * qty, value: p.price * qty }
    const net = prepareNetwork(BASE_DCS)
    const opts = options(order, net, loadFromLatest()).map((o) => {
      const dcO = BASE_DCS.find((d) => d.id === o.originDc)
      const dcD = BASE_DCS.find((d) => d.id === o.destDc)
      const route = o.mode === 'valmo' || o.mode === 'hybrid'
        ? [seller, dcO, dcD, city].filter(Boolean).map((x) => ({ lat: x.lat, lng: x.lng, name: x.name }))
        : [seller, city].map((x) => ({ lat: x.lat, lng: x.lng, name: x.name }))
      return { ...o, label: MODE_LABEL[o.mode], route, originName: dcO?.name, destName: dcD?.name }
    })
    return HttpResponse.json({ order, distanceKm: Math.round(km(seller, city)), options: opts, best: opts[0]?.mode })
  }),

  // Optimise the latest day: all-external vs today's rule vs optimiser
  http.post('*/api/logistics/optimize', async ({ request }) => {
    await delay(200)
    const body = await request.json().catch(() => ({}))
    const f = fleet()
    if (body.fleet) {
      for (const [id, v] of Object.entries(body.fleet)) f[id] = { ...f[id], ...v }
      saveFleet()
      typicalLoad = null
    }
    if (body.reset) {
      baseFleet = null
      try { localStorage.removeItem(FLEET_KEY) } catch { /* ignore */ }
      typicalLoad = null
    }
    const days = body.days ?? 1
    const orders = days === 1 ? latestDay()[1] : ordersInPeriod(days)
    const runs = Object.fromEntries(['external', 'rule', 'optimized'].map((p) => [p, simulate(orders, BASE_DCS, fleet(), p)]))
    // top lanes in the optimised plan
    const net = prepareNetwork(BASE_DCS)
    const lanes = {}
    for (const [, dayOrders] of groupByDay(orders)) {
      const { choice } = allocateDay(dayOrders, net, fleet())
      dayOrders.forEach((o, i) => {
        const c = choice[i]
        if (!c.originDc || c.originDc === c.destDc) return
        const k = c.originDc + '>' + c.destDc
        const l = (lanes[k] ??= { from: c.originDc, to: c.destDc, orders: 0, kg: 0, km: c.laneKm })
        l.orders += SCALE
        l.kg += Math.max(o.weight, 0.5) * SCALE
      })
    }
    return HttpResponse.json({
      day: latestDay()[0],
      days,
      runs,
      fleet: fleet(),
      dcs: BASE_DCS.map((d) => dcPublic(d, fleet())),
      lanes: Object.values(lanes).sort((a, b) => b.kg - a.kg).slice(0, 12),
      vehicles: VEHICLE,
      cost: COST,
    })
  }),

  // What-if: add DCs and replay 1 or 6 months of orders
  http.post('*/api/logistics/simulate', async ({ request }) => {
    await delay(200)
    const { newDcs = [], days = 30 } = await request.json()
    const orders = ordersInPeriod(days)
    const proposed = newDcs.map((d, i) => ({ id: d.id ?? 'NEW-' + i, name: d.name, city: d.city, type: d.type, lat: d.lat, lng: d.lng }))
    const base = simulate(orders, BASE_DCS, fleet())
    const sc = withNewDcs(BASE_DCS, fleet(), proposed, orders)
    const scenario = simulate(orders, sc.dcs, sc.fleet)
    const months = days / 30
    const fixed = newDcs.reduce((s, d) => s + (d.fixedMonthly ?? DC_TYPES[d.type].fixedMonthly), 0) * months
    const variableSaving = base.totals.cost - scenario.totals.cost
    const net = variableSaving - fixed
    const monthly = base.monthly.map((m, i) => ({
      month: m.month,
      baseline: m.cost,
      scenario: (scenario.monthly[i]?.cost ?? 0) + fixed / Math.max(1, base.monthly.length),
    }))
    const valmoShare = (r) => ((r.totals.byMode.valmo ?? 0) + (r.totals.byMode.hybrid ?? 0)) / r.totals.orders
    return HttpResponse.json({
      days,
      baseline: base.totals,
      scenario: scenario.totals,
      fixed,
      variableSaving,
      net,
      netPct: -net / base.totals.cost,
      valmoShare: { baseline: valmoShare(base), scenario: valmoShare(scenario) },
      monthly,
      newDcStats: scenario.utilisation.filter((u) => proposed.some((p) => p.id === u.id)).map((u) => ({ ...u, fleet: sc.fleet[u.id] })),
    })
  }),

  // Rank candidate cities for a new hub by net monthly saving (last 30 days)
  http.post('*/api/logistics/suggest', async ({ request }) => {
    await delay(100)
    const { type = 'hub', days = 30, exclude = [] } = await request.json().catch(() => ({}))
    const orders = ordersInPeriod(days)
    const base = simulate(orders, BASE_DCS, fleet()).totals.cost
    const candidates = CITIES.filter((c) => !BASE_DCS.some((d) => km(d, c) < 90) && !exclude.includes(c.id))
    const fixed = DC_TYPES[type].fixedMonthly * (days / 30)
    const results = candidates.map((c) => {
      const dc = { id: 'CAND-' + c.id, name: `Valmo ${DC_TYPES[type].label}, ${c.name}`, city: c.name, type, lat: c.lat, lng: c.lng }
      const sc = withNewDcs(BASE_DCS, fleet(), [dc], orders)
      const r = simulate(orders, sc.dcs, sc.fleet)
      const util = r.utilisation.find((u) => u.id === dc.id)
      return { cityId: c.id, name: c.name, state: c.state, lat: c.lat, lng: c.lng, saving: base - r.totals.cost, net: base - r.totals.cost - fixed, ordersPerDay: util?.orders ?? 0 }
    })
    return HttpResponse.json({ type, days, fixed, results: results.sort((a, b) => b.net - a.net).slice(0, 8) })
  }),
]
