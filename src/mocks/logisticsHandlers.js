// Valmo Control Tower API: network, demand forecast, route quotes, network optimisation,
// batch timing analysis and new-sort-centre scenarios. Served in-browser by Mock Service Worker.
import { http, HttpResponse, delay } from 'msw'
import {
  BASE_DCS, CITIES, DC_TYPES, HISTORY_DAYS, HISTORY_END, ORDERS, PARTNERS, SCALE, SELLERS, cityById, dimsOf, km,
  productById, sellerById, sellersByProduct, volKgOf, volumeOf, weightOf,
} from '../logistics/data.js'
import {
  COST, FAIL_RATE, LINE_HAUL, RTO_RATE, STAGES, VEHICLES, allocateDay, defaultFleet, groupByDay, isValmo,
  options, ordersInPeriod, prepareNetwork, simulate, withNewDcs,
} from '../logistics/optimizer.js'
import { BUCKETS, SCHEDULE, batchAnalysis } from '../logistics/batch.js'
import { forecast } from '../logistics/forecast.js'

const FLEET_KEY = 'meesho.valmo.fleet.v2'
let baseFleet
const fleet = () => {
  if (baseFleet) return baseFleet
  baseFleet = defaultFleet(BASE_DCS, ORDERS())
  try {
    Object.assign(baseFleet, JSON.parse(localStorage.getItem(FLEET_KEY)) ?? {})
  } catch {
    /* defaults */
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

let baseNet
const network = () => (baseNet ??= prepareNetwork(BASE_DCS))
const latestDay = () => groupByDay(ORDERS()).at(-1)

// Consolidated volumes of the latest day (used to price a single new order realistically)
let typical
const typicalLoad = () => (typical ??= allocateDay(latestDay()[1], network(), fleet()).load)

const valmoShare = (t) => Object.entries(t.byMode).filter(([m]) => isValmo(m)).reduce((s, [, v]) => s + v, 0) / t.orders
const dcPublic = (dc, f) => ({ ...dc, typeLabel: DC_TYPES[dc.type].label, fleet: f?.[dc.id], ...DC_TYPES[dc.type] })

export const logisticsHandlers = [
  http.get('*/api/logistics/network', async () => {
    await delay(150)
    const f = fleet()
    const net = network()
    const sellerOrders = {}
    for (const o of ORDERS().slice(-15000)) sellerOrders[o.sellerId] = (sellerOrders[o.sellerId] ?? 0) + 1
    return HttpResponse.json({
      scale: SCALE,
      history: { end: HISTORY_END, days: HISTORY_DAYS, start: ORDERS()[0].day },
      dcs: BASE_DCS.map((d) => dcPublic(d, f)),
      airhubs: Object.values(net.airhubs).map((a) => ({ id: a.id, cityId: a.cityId, name: a.name, lat: a.lat, lng: a.lng, sc: a.sc.id, scKm: Math.round(a.scKm) })),
      sellers: SELLERS.map((s) => ({ ...s, products: s.products.length, productIds: s.products, orders90: (sellerOrders[s.id] ?? 0) * SCALE, airhub: net.sellerAh[s.id]?.ah.cityId ?? null })),
      cities: CITIES,
      partners: PARTNERS.map((p) => ({ id: p.id, name: p.name, rates: p.rates, extra500: p.extra500 })),
      dcTypes: DC_TYPES,
      vehicles: VEHICLES,
      stages: STAGES,
      buckets: BUCKETS,
      schedule: SCHEDULE,
      model: { cost: COST, failRate: FAIL_RATE, rtoRate: RTO_RATE },
      historyOrders: ORDERS().length * SCALE,
    })
  }),

  // Demand forecast heat map + the sellers who supply the product. ?product=P001 | all
  http.get('*/api/logistics/forecast', async ({ request }) => {
    await delay(120)
    const product = new URL(request.url).searchParams.get('product') || 'all'
    const fc = forecast(product)
    const net = network()
    const covered = fc.points.reduce((s, p) => s + (net.airhubs[p.cityId] ? p.forecast30 : 0), 0)
    const sellers = product === 'all' ? SELLERS : sellersByProduct[product] ?? []
    // product's own sales by seller (last 90 days) to size supplier markers
    const supply = {}
    if (product !== 'all') for (const o of ORDERS().slice(-15000)) if (o.productId === product) supply[o.sellerId] = (supply[o.sellerId] ?? 0) + SCALE
    return HttpResponse.json({ ...fc, coveredShare: covered / Math.max(1, fc.total30), sellerIds: sellers.map((s) => s.id), supply })
  }),

  // Price one order on every route, stage by stage
  http.post('*/api/logistics/quote', async ({ request }) => {
    await delay(150)
    const { productId, sellerId, cityId, qty = 1, cod = true, hour = 14 } = await request.json()
    const p = productById[productId]
    const seller = sellerById[sellerId]
    const city = cityById[cityId]
    if (!p || !seller || !city) return HttpResponse.json({ error: 'invalid' }, { status: 400 })
    const order = {
      id: 'Q', productId, sellerId, cityId, qty, cod, hour,
      weight: weightOf(p) * qty, volume: volumeOf(p) * qty, chargeKg: Math.max(weightOf(p), volKgOf(p)) * qty, value: p.price * qty,
    }
    const opts = options(order, network(), typicalLoad())
    return HttpResponse.json({
      order: { ...order, dims: dimsOf(p), volKg: volKgOf(p) * qty },
      distanceKm: Math.round(km(seller, city)),
      sellerAirhub: network().sellerAh[sellerId]?.ah.name ?? null,
      customerAirhub: network().airhubs[cityId]?.name ?? null,
      options: opts,
      best: opts[0]?.mode,
    })
  }),

  // Network optimisation for the latest day / 7 / 30 days: all-3PL vs today's rule vs optimiser
  http.post('*/api/logistics/optimize', async ({ request }) => {
    await delay(200)
    const body = await request.json().catch(() => ({}))
    if (body.reset) {
      baseFleet = null
      try { localStorage.removeItem(FLEET_KEY) } catch { /* ignore */ }
    }
    const f = fleet()
    if (body.fleet) {
      for (const [id, v] of Object.entries(body.fleet)) f[id] = { ...f[id], ...v }
      saveFleet()
    }
    typical = null
    const days = body.days ?? 1
    const orders = days === 1 ? latestDay()[1] : ordersInPeriod(days)
    const runs = Object.fromEntries(['external', 'rule', 'optimized'].map((p) => [p, simulate(orders, BASE_DCS, f, p)]))
    // busiest lanes of the optimised plan, with the vehicle mix chosen
    const lanes = {}
    for (const [, dayOrders] of groupByDay(orders)) {
      const { plans } = allocateDay(dayOrders, network(), f)
      for (const pl of Object.values(plans)) {
        const l = (lanes[pl.key] ??= { key: pl.key, from: pl.from, to: pl.to, km: Math.round(pl.km), vol: 0, cap: 0, cost: 0, mix: {} })
        l.vol += pl.vol * SCALE
        l.cost += pl.plan.cost
        for (const v of pl.plan.vehicles) {
          l.cap += v.count * VEHICLES[v.type].volM3
          l.mix[v.type] = (l.mix[v.type] ?? 0) + v.count
        }
      }
    }
    return HttpResponse.json({
      day: latestDay()[0],
      days,
      runs: Object.fromEntries(Object.entries(runs).map(([k, r]) => [k, { ...r, valmoShare: valmoShare(r.totals) }])),
      fleet: f,
      dcs: BASE_DCS.map((d) => dcPublic(d, f)),
      lanes: Object.values(lanes).sort((a, b) => b.vol - a.vol).slice(0, 12).map((l) => ({ ...l, fill: l.vol / l.cap, perDay: Object.fromEntries(Object.entries(l.mix).map(([t, n]) => [t, n / days])) })),
      vehicles: VEHICLES,
      lineHaulTypes: LINE_HAUL,
    })
  }),

  // Batch timing analysis between two dates
  http.post('*/api/logistics/batch', async ({ request }) => {
    await delay(150)
    const { from, to, threshold = 0.8, delayCostPerHour = 0.25 } = await request.json()
    return HttpResponse.json(batchAnalysis(from, to, { dcs: BASE_DCS, fleet: fleet(), threshold, delayCostPerHour }))
  }),

  // What-if: add sort centres / Valmo Bases and replay 1 or 6 months of orders
  http.post('*/api/logistics/simulate', async ({ request }) => {
    await delay(200)
    const { newDcs = [], days = 30 } = await request.json()
    const orders = ordersInPeriod(days)
    const proposed = newDcs.map((d, i) => ({ id: d.id ?? 'NEW-' + i, name: d.name, city: d.city, type: d.type, lat: d.lat, lng: d.lng }))
    const base = simulate(orders, BASE_DCS, fleet())
    const sc = withNewDcs(BASE_DCS, fleet(), proposed, orders)
    const scenario = simulate(orders, sc.dcs, sc.fleet)
    const fixed = newDcs.reduce((s, d) => s + (d.fixedMonthly ?? DC_TYPES[d.type].fixedMonthly), 0) * (days / 30)
    const variableSaving = base.totals.cost - scenario.totals.cost
    const net = variableSaving - fixed
    const newNet = prepareNetwork(sc.dcs)
    return HttpResponse.json({
      days,
      baseline: base.totals,
      scenario: scenario.totals,
      fixed,
      variableSaving,
      net,
      netPct: -net / base.totals.cost,
      valmoShare: { baseline: valmoShare(base.totals), scenario: valmoShare(scenario.totals) },
      newAirhubs: Object.keys(newNet.airhubs).filter((c) => !network().airhubs[c]),
      monthly: base.monthly.map((m, i) => ({ month: m.month, baseline: m.cost, scenario: (scenario.monthly[i]?.cost ?? 0) + fixed / Math.max(1, base.monthly.length) })),
      newDcStats: scenario.utilisation.filter((u) => proposed.some((p) => p.id === u.id)).map((u) => ({ ...u, fleet: sc.fleet[u.id] })),
    })
  }),

  // Rank candidate cities for a new Valmo Base by net monthly saving (last 14 days, scaled to a month)
  http.post('*/api/logistics/suggest', async ({ request }) => {
    await delay(100)
    const { type = 'hub', days = 14 } = await request.json().catch(() => ({}))
    const orders = ordersInPeriod(days)
    const base = simulate(orders, BASE_DCS, fleet()).totals.cost
    const net = network()
    // shortlist: cities far from today's sort centres that have uncovered demand or uncovered sellers nearby
    const shortlist = CITIES.filter((c) => !BASE_DCS.some((d) => km(d, c) < 90))
      .map((c) => {
        const demand = CITIES.filter((x) => !net.airhubs[x.id] && km(x, c) < DC_TYPES[type].airhubKm).reduce((s, x) => s + x.weight, 0)
        const supply = SELLERS.filter((s) => km(s, c) < 120 && km(s, net.sellerDcs[s.id][0].dc) > 120).length
        const lane = net.cityDcs[c.id][0].d
        return { c, score: demand * 3 + supply + lane / 200 }
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, 22)
    const fixed = DC_TYPES[type].fixedMonthly
    const results = shortlist.map(({ c }) => {
      const dc = { id: 'CAND-' + c.id, name: `${type === 'sort' ? 'Valmo Sort Centre' : 'Valmo Base'}, ${c.name}`, city: c.name, type, lat: c.lat, lng: c.lng }
      const r = simulate(orders, [...BASE_DCS, dc], { ...fleet(), [dc.id]: null })
      const util = r.utilisation.find((u) => u.id === dc.id)
      const saving = ((base - r.totals.cost) * 30) / days
      return { cityId: c.id, name: c.name, state: c.state, lat: c.lat, lng: c.lng, saving, net: saving - fixed, ordersPerDay: util?.orders ?? 0 }
    })
    return HttpResponse.json({ type, days, fixed, results: results.sort((a, b) => b.net - a.net).slice(0, 8) })
  }),
]

