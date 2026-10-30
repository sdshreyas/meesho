// Logistics cost model + allocation optimizer for Valmo vs external partners.
//
// Every order can ship:
//   valmo   – Valmo first mile, line haul between DCs, Valmo last mile
//   hybrid  – Valmo first mile + line haul, partner last mile from the nearest DC
//   XP/YS/ZR – fully with an external partner
// Valmo costs fall as volume rises (fuller vans, trucks and rider routes), so the
// optimizer works on a whole day of orders at once, inside each DC's fleet capacity.
import { CITIES, DC_TYPES, PARTNERS, SCALE, cityById, km, sellerById, ORDERS } from './data.js'

export const COST = {
  vanTripBase: 300, vanPerKm: 12, vanCapacity: 150, // first-mile pickups per van trip
  handlingPerTouch: 3,
  truck: { kg: 5000, perKm: 40 }, lcv: { kg: 1200, perKm: 20 },
  riderDay: 750, dropsMin: 20, dropsMax: 45, // last-mile drops per rider per day
  lastMilePerKm: 0.12,
  valmoCod: 6,
  hybridHandover: 0.85, // partner last-mile discount for B2B handover at a Valmo DC
  hybridMaxKm: 400,
}
export const VEHICLE = {
  bike: { label: 'Bikes (last mile)', perDay: 30, unit: 'drops' },
  van: { label: 'Vans (first mile)', perDay: 120, unit: 'pickups' },
  truck: { label: 'Trucks (line haul)', perDay: 5000, unit: 'kg' },
}
export const MODE_LABEL = { valmo: 'Valmo end-to-end', hybrid: 'Valmo + partner last mile', XP: 'Partner X · Express', YS: 'Partner Y · Surface', ZR: 'Partner Z · Regional' }

const nearest = (pt, dcs, maxKey) => {
  let best = null
  for (const dc of dcs) {
    const d = km(pt, dc)
    if (maxKey && d > DC_TYPES[dc.type][maxKey]) continue
    if (!best || d < best.d) best = { dc, d }
  }
  return best
}

/** Precomputes coverage for a network (list of DCs). */
export function prepareNetwork(dcs) {
  const origin = {}
  for (const s of Object.values(sellerById)) origin[s.id] = nearest(s, dcs, 'firstMileKm')
  const dest = {}
  const anyDc = {}
  for (const c of CITIES) {
    dest[c.id] = nearest(c, dcs, 'lastMileKm')
    anyDc[c.id] = nearest(c, dcs)
  }
  const lane = {}
  const laneKm = (a, b) => (lane[a.id + b.id] ??= a.id === b.id ? 0 : km(a, b))
  return { dcs, origin, dest, anyDc, laneKm }
}

function zone(from, to) {
  if (to.special || from.special) return 'special'
  const d = km(from, to)
  if (d < 60) return 'local'
  if (d < 500 || from.state === to.state) return 'regional'
  if (to.metro && from.metro) return 'metro'
  return 'national'
}

export function partnerCost(partner, from, to, order) {
  const z = zone(from, to)
  const base = partner.rates[z]
  if (base == null) return null // partner does not serve this zone
  const extra = Math.max(0, Math.ceil(order.weight / 0.5) - 1) * partner.extra500
  const cod = order.cod ? Math.max(partner.codMin, (order.value * partner.codPct) / 100) : 0
  const eta = partner.etaBase + Math.ceil(km(from, to) / partner.kmPerDay)
  return { cost: base + extra + cod, eta, zone: z, parts: { base, weight: extra, cod } }
}

function lineHaulPerKg(laneKgSample, distKm) {
  if (!distKm) return 0
  const kg = Math.max(1, laneKgSample * SCALE)
  const truck = Math.ceil(kg / COST.truck.kg) * COST.truck.perKm * distKm
  const lcv = Math.ceil(kg / COST.lcv.kg) * COST.lcv.perKm * distKm
  return Math.min(truck, lcv) / kg
}

/**
 * All shipping options for one order, given today's Valmo volumes:
 * load = { seller: {id: orders}, lane: {key: kg}, city: {id: drops} } (sample units)
 */
export function options(order, net, load) {
  const seller = sellerById[order.sellerId]
  const city = cityById[order.cityId]
  const out = []
  const o = net.origin[seller.id]
  const shipKg = Math.max(order.weight, 0.5)
  if (o) {
    const pickups = Math.min(COST.vanCapacity, Math.max(15, (load.seller[seller.id] ?? 1) * SCALE))
    const fm = (COST.vanTripBase + 2 * o.d * COST.vanPerKm) / pickups
    const cod = order.cod ? COST.valmoCod : 0
    const d = net.dest[city.id]
    if (d) {
      const dist = net.laneKm(o.dc, d.dc)
      const lh = lineHaulPerKg(load.lane[o.dc.id + d.dc.id] ?? shipKg, dist) * shipKg
      const handling = COST.handlingPerTouch * (o.dc.id === d.dc.id ? 1 : 2)
      const vol = (load.city[city.id] ?? 1) * SCALE
      const drops = COST.dropsMin + (COST.dropsMax - COST.dropsMin) * Math.min(1, vol / 6000)
      const lm = COST.riderDay / drops + COST.lastMilePerKm * d.d
      out.push({
        mode: 'valmo', originDc: o.dc.id, destDc: d.dc.id, laneKm: Math.round(dist),
        cost: fm + handling + lh + lm + cod, eta: 1 + Math.ceil(dist / 600) + 1,
        parts: { firstMile: fm, handling, lineHaul: lh, lastMile: lm, cod },
      })
    }
    const h = net.anyDc[city.id]
    if (h && h.d <= COST.hybridMaxKm) {
      const dist = net.laneKm(o.dc, h.dc)
      const lh = lineHaulPerKg(load.lane[o.dc.id + h.dc.id] ?? shipKg, dist) * shipKg
      const handling = COST.handlingPerTouch * (o.dc.id === h.dc.id ? 1 : 2)
      const zr = partnerCost(PARTNERS[2], h.dc, city, { ...order, cod: false })
      if (zr) {
        const lm = zr.cost * COST.hybridHandover
        out.push({
          mode: 'hybrid', originDc: o.dc.id, destDc: h.dc.id, laneKm: Math.round(dist),
          cost: fm + handling + lh + lm + cod, eta: 1 + Math.ceil(dist / 600) + zr.eta,
          parts: { firstMile: fm, handling, lineHaul: lh, lastMile: lm, cod },
        })
      }
    }
  }
  for (const p of PARTNERS) {
    const c = partnerCost(p, seller, city, order)
    if (c) out.push({ mode: p.id, cost: c.cost, eta: c.eta, zone: c.zone, parts: { firstMile: 0, handling: 0, lineHaul: c.parts.base, lastMile: c.parts.weight, cod: c.parts.cod } })
  }
  return out.sort((a, b) => a.cost - b.cost)
}

const isValmo = (m) => m === 'valmo' || m === 'hybrid'

function tally(orders, choice) {
  const load = { seller: {}, lane: {}, city: {} }
  orders.forEach((o, i) => {
    const c = choice[i]
    if (!c || !isValmo(c.mode)) return
    load.seller[o.sellerId] = (load.seller[o.sellerId] ?? 0) + 1
    load.lane[c.originDc + c.destDc] = (load.lane[c.originDc + c.destDc] ?? 0) + Math.max(o.weight, 0.5)
    if (c.mode === 'valmo') load.city[o.cityId] = (load.city[o.cityId] ?? 0) + 1
  })
  return load
}

/** Capacity per DC per day in sample units, from a fleet { dcId: {bike, van, truck} }. */
function capacity(fleet, dcId) {
  const f = fleet?.[dcId]
  if (!f) return { drops: Infinity, pickups: Infinity, kg: Infinity }
  return {
    drops: (f.bike * VEHICLE.bike.perDay) / SCALE,
    pickups: (f.van * VEHICLE.van.perDay) / SCALE,
    kg: (f.truck * VEHICLE.truck.perDay) / SCALE,
  }
}

/**
 * Allocates one day of orders. policy:
 *  'optimized' – greedy by savings vs best external option, inside fleet capacity (2 passes
 *                so volume-dependent Valmo costs reflect the final allocation)
 *  'rule'      – today's simple rule: Valmo if both ends are covered, else Partner Y
 *  'external'  – cheapest external partner for everything
 */
export function allocateDay(orders, net, fleet, policy = 'optimized') {
  const ext = (opts) => opts.find((x) => !isValmo(x.mode))
  const firstGuess = { seller: {}, lane: {}, city: {} }
  // pass 1: assume every coverable order rides Valmo to estimate volumes
  let opts = orders.map((o) => options(o, net, firstGuess))
  let choice = opts.map((op) => (policy === 'external' ? ext(op) : op.find((x) => x.mode === 'valmo') ?? op.find((x) => x.mode === 'hybrid') ?? ext(op)))
  let load = tally(orders, choice)
  opts = orders.map((o) => options(o, net, load))

  const used = {}
  const usage = (dcId) => (used[dcId] ??= { drops: 0, pickups: 0, kg: 0 })
  const fits = (o, c) => {
    const a = usage(c.originDc)
    const capA = capacity(fleet, c.originDc)
    if (a.pickups + 1 > capA.pickups) return false
    if (c.originDc !== c.destDc && a.kg + Math.max(o.weight, 0.5) > capA.kg) return false
    if (c.mode === 'valmo') {
      const b = usage(c.destDc)
      if (b.drops + 1 > capacity(fleet, c.destDc).drops) return false
    }
    return true
  }
  const take = (o, c) => {
    const a = usage(c.originDc)
    a.pickups += 1
    if (c.originDc !== c.destDc) a.kg += Math.max(o.weight, 0.5)
    if (c.mode === 'valmo') usage(c.destDc).drops += 1
  }

  choice = new Array(orders.length)
  if (policy === 'external') {
    opts.forEach((op, i) => (choice[i] = ext(op)))
  } else if (policy === 'rule') {
    const ys = (op) => op.find((x) => x.mode === 'YS') ?? ext(op)
    orders.forEach((o, i) => {
      const v = opts[i].find((x) => x.mode === 'valmo')
      if (v && fits(o, v)) {
        take(o, v)
        choice[i] = v
      } else choice[i] = ys(opts[i])
    })
  } else {
    const ranked = orders
      .map((o, i) => {
        const valmoBest = opts[i].find((x) => isValmo(x.mode))
        const extBest = ext(opts[i])
        return { i, valmoBest, extBest, saving: valmoBest ? extBest.cost - valmoBest.cost : -Infinity }
      })
      .sort((a, b) => b.saving - a.saving)
    for (const r of ranked) {
      const o = orders[r.i]
      const candidates = opts[r.i].filter((x) => isValmo(x.mode) && x.cost < r.extBest.cost)
      const ok = candidates.find((c) => fits(o, c))
      if (ok) {
        take(o, ok)
        choice[r.i] = ok
      } else choice[r.i] = r.extBest
    }
  }
  // final costs at the volumes actually allocated
  load = tally(orders, choice)
  const final = orders.map((o, i) => {
    const c = choice[i]
    const again = options(o, net, load).find((x) => x.mode === c.mode && x.destDc === c.destDc)
    return again ?? c
  })
  return { choice: final, used }
}

/** Fleet that covers the average day of the last 30 days (peaks overflow to partners). */
export function defaultFleet(dcs, orders) {
  const net = prepareNetwork(dcs)
  const days = groupByDay(orders).slice(-30)
  const sum = {}
  for (const [, dayOrders] of days) {
    const { used } = allocateDay(dayOrders, net, null, 'optimized')
    for (const [id, u] of Object.entries(used)) {
      const s = (sum[id] ??= { drops: 0, pickups: 0, kg: 0 })
      s.drops += u.drops
      s.pickups += u.pickups
      s.kg += u.kg
    }
  }
  const fleet = {}
  for (const dc of dcs) {
    const s = sum[dc.id] ?? { drops: 0, pickups: 0, kg: 0 }
    const n = days.length || 1
    fleet[dc.id] = {
      bike: Math.max(5, Math.ceil(((s.drops / n) * SCALE) / VEHICLE.bike.perDay)),
      van: Math.max(2, Math.ceil(((s.pickups / n) * SCALE) / VEHICLE.van.perDay)),
      truck: Math.max(1, Math.ceil(((s.kg / n) * SCALE) / VEHICLE.truck.perDay)),
    }
  }
  return fleet
}

export function groupByDay(orders) {
  const m = new Map()
  for (const o of orders) {
    if (!m.has(o.day)) m.set(o.day, [])
    m.get(o.day).push(o)
  }
  return [...m.entries()]
}

export function ordersInPeriod(days) {
  const all = ORDERS()
  const last = all[all.length - 1].day
  const cutoff = new Date(new Date(last + 'T00:00:00Z').getTime() - (days - 1) * 86400000).toISOString().slice(0, 10)
  return all.filter((o) => o.day >= cutoff)
}

/** Runs a policy over a set of days; returns totals, monthly series and DC utilisation. */
export function simulate(orders, dcs, fleet, policy = 'optimized') {
  const net = prepareNetwork(dcs)
  const days = groupByDay(orders)
  const totals = { cost: 0, orders: 0, byMode: {}, costByMode: {} }
  const monthly = {}
  const dcUse = {}
  for (const [day, dayOrders] of days) {
    const { choice, used } = allocateDay(dayOrders, net, fleet, policy)
    const month = day.slice(0, 7)
    const m = (monthly[month] ??= { month, cost: 0, orders: 0 })
    choice.forEach((c) => {
      totals.cost += c.cost
      totals.orders += 1
      totals.byMode[c.mode] = (totals.byMode[c.mode] ?? 0) + 1
      totals.costByMode[c.mode] = (totals.costByMode[c.mode] ?? 0) + c.cost
      m.cost += c.cost
      m.orders += 1
    })
    for (const [id, u] of Object.entries(used)) {
      const d = (dcUse[id] ??= { drops: 0, pickups: 0, kg: 0, days: 0 })
      d.drops += u.drops
      d.pickups += u.pickups
      d.kg += u.kg
    }
  }
  const n = days.length || 1
  const utilisation = dcs.map((dc) => {
    const u = dcUse[dc.id] ?? { drops: 0, pickups: 0, kg: 0 }
    const cap = capacity(fleet, dc.id)
    return {
      id: dc.id,
      name: dc.name,
      orders: Math.round(((u.drops + u.pickups) / n) * SCALE),
      bike: cap.drops === Infinity ? null : u.drops / n / cap.drops,
      van: cap.pickups === Infinity ? null : u.pickups / n / cap.pickups,
      truck: cap.kg === Infinity ? null : u.kg / n / cap.kg,
    }
  })
  return {
    days: n,
    totals: {
      cost: totals.cost * SCALE,
      orders: totals.orders * SCALE,
      perOrder: totals.cost / Math.max(1, totals.orders),
      byMode: Object.fromEntries(Object.entries(totals.byMode).map(([k, v]) => [k, v * SCALE])),
      costByMode: Object.fromEntries(Object.entries(totals.costByMode).map(([k, v]) => [k, v * SCALE])),
    },
    monthly: Object.values(monthly).map((m) => ({ ...m, cost: m.cost * SCALE, orders: m.orders * SCALE })),
    utilisation,
  }
}

/** Network + auto-sized fleet for any new DCs (sized to their own average demand). */
export function withNewDcs(baseDcs, baseFleet, newDcs, orders) {
  const dcs = [...baseDcs, ...newDcs]
  if (!newDcs.length) return { dcs, fleet: baseFleet }
  const sized = defaultFleet(dcs, orders)
  const fleet = { ...baseFleet }
  for (const d of newDcs) fleet[d.id] = d.fleet ?? sized[d.id]
  return { dcs, fleet }
}
