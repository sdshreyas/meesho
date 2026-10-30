// Valmo 5-stage cost model + route optimiser.
//
// Valmo flow (valmo.in/about):
//   1 First mile   Seller → local Valmo Airhub        (Valmo Pilots, Captain manifests)
//   2 Source sort  Airhub → Sort Centre / Valmo Base   (feeder vehicle, Valmo Handlers batch by region)
//   3 Line haul    Source → destination sort centre    (partnered trucks, consolidated)
//   4 Dest sort    Sort centre → destination Airhub     (re-sort into local routes, feeder)
//   5 Last mile    Airhub → customer                    (micro-entrepreneur Pilots, paid per drop)
//
// Every route is priced stage by stage. Shared vehicles (pickup, feeder, line haul) are costed for
// the whole day's volume on that leg, choosing the vehicle mix with the lowest cost (= highest
// useful fill), and each parcel pays its volume share. All money is real ₹ per parcel.
import { CITIES, DC_TYPES, PARTNERS, SCALE, cityById, km, sellerById, ORDERS } from './data.js'

export const VEHICLES = {
  bike: { label: 'Pilot 2-wheeler', volM3: 0.15, kg: 30, perKm: 2.5, driverDay: 0, fixedDay: 0, tollPerKm: 0, use: 'Pickup & last mile (paid per piece)' },
  e3w: { label: 'Electric 3-wheeler', volM3: 1.6, kg: 450, perKm: 1.2, driverDay: 650, fixedDay: 250, tollPerKm: 0, use: 'First-mile pickup' },
  ace: { label: 'Tata Ace · 8 ft', volM3: 4.2, kg: 750, perKm: 9, driverDay: 800, fixedDay: 300, tollPerKm: 0.6, use: 'Feeder Airhub ↔ sort centre' },
  t14: { label: '14 ft truck', volM3: 17, kg: 3500, perKm: 18, driverDay: 1000, fixedDay: 700, tollPerKm: 1.6, use: 'Feeder / short line haul' },
  t19: { label: '19 ft truck', volM3: 28, kg: 6000, perKm: 24, driverDay: 1100, fixedDay: 900, tollPerKm: 2.2, use: 'Line haul' },
  t32: { label: '32 ft MXL container', volM3: 62, kg: 9000, perKm: 38, driverDay: 1600, fixedDay: 1400, tollPerKm: 3.2, use: 'Line haul' },
}
export const LINE_HAUL = ['t14', 't19', 't32']
const FEEDER = ['ace', 't14']
const PICKUP = ['bike', 'e3w', 'ace']

export const COST = {
  fill: 0.9, // usable share of a vehicle's volume after stacking
  truckKmPerDay: 450,
  emptyReturn: 0.15, // share of line-haul km paid for the return leg
  spotPremium: 0.25, // extra cost of a market truck when contracted fleet is full
  pickupPayout: 3, // pilot payout per pickup
  captainManifest: 1.5, // airhub fee per parcel manifested (first mile)
  airhubHandling: 1, // airhub fee per parcel dispatched / received
  captainDelivery: 2.5, // airhub fee per parcel delivered (route sort, cash reconciliation)
  pilotDayEarning: 650, // target pilot income per day → payout per drop = earning / drops
  dropsPerDay: { 1: 60, 2: 48, 3: 36 }, // drops a pilot can attempt per day by city tier
  routeKm: { 1: 12, 2: 9, 3: 16 }, // one-way spread of a delivery route
  reattemptShare: 0.6, // a re-attempt costs 60% of a first attempt
  codFixed: 1.5,
  codPct: 0.2, // % of COD value for cash handling & remittance
  rtoReverseShare: 0.8, // return trip costs ~80% of the forward journey
  handoverDiscount: 0.85, // 3PL last-mile rate when Valmo hands over bulk at a sort centre
  injectionDiscount: 0.7, // 3PL pickup rate when it drops bulk into a Valmo sort centre
  hybridMaxKm: 400,
}
// Failed first attempts and return-to-origin, by payment type and tier (industry ranges for COD-heavy tier 2/3)
export const FAIL_RATE = { prepaid: 0.07, cod: { 1: 0.15, 2: 0.22, 3: 0.28 } }
export const RTO_RATE = { prepaid: 0.03, cod: { 1: 0.1, 2: 0.15, 3: 0.2 } }

export const STAGES = [
  ['firstMile', '1 · First mile', 'Seller → Airhub'],
  ['sourceSort', '2 · Source sort', 'Airhub → sort centre + sorting'],
  ['lineHaul', '3 · Line haul', 'Sort centre → sort centre'],
  ['destSort', '4 · Destination sort', 'Re-sort + feeder to Airhub'],
  ['lastMile', '5 · Last mile', 'Airhub → customer'],
  ['rto', 'Failed delivery & RTO', 'Expected cost of returns'],
]
export const MODE_LABEL = {
  valmo: 'Valmo end-to-end',
  valmo_alt: 'Valmo via alternate sort centre',
  hybrid_lm: 'Valmo + 3PL last mile',
  hybrid_fm: '3PL pickup + Valmo',
  XP: 'Partner X · Express', YS: 'Partner Y · Surface', ZR: 'Partner Z · Regional',
}
export const isValmo = (m) => m === 'valmo' || m === 'valmo_alt' || m === 'hybrid_lm' || m === 'hybrid_fm'

// ---------- vehicles & fleet planning ----------

export function lineHaulTrip(type, distKm) {
  const v = VEHICLES[type]
  const days = Math.max(1, Math.ceil(distKm / COST.truckKmPerDay))
  return distKm * (v.perKm + v.tollPerKm) * (1 + COST.emptyReturn) + days * (v.driverDay + v.fixedDay)
}
export function shortTrip(type, distKm, tripsPerDay) {
  const v = VEHICLES[type]
  return 2 * distKm * (v.perKm + v.tollPerKm) + (v.driverDay + v.fixedDay) / tripsPerDay
}

/**
 * Cheapest vehicle mix to move `volM3` / `kg` (real, per day). Tries each single type and
 * "n big + 1 small for the remainder". Lowest cost ≈ highest useful fill.
 */
export function planFleet(volM3, kg, types, tripCost) {
  const cap = (t) => VEHICLES[t].volM3 * COST.fill
  const plans = []
  for (const t of types) {
    const n = Math.max(1, Math.ceil(volM3 / cap(t)), Math.ceil(kg / VEHICLES[t].kg))
    plans.push({ vehicles: [{ type: t, count: n }], cost: n * tripCost(t) })
  }
  for (const big of types) {
    const full = Math.floor(volM3 / cap(big))
    const rem = volM3 - full * cap(big)
    if (full < 1 || rem <= 0) continue
    for (const small of types) {
      if (VEHICLES[small].volM3 >= VEHICLES[big].volM3 || cap(small) < rem) continue
      plans.push({ vehicles: [{ type: big, count: full }, { type: small, count: 1 }], cost: full * tripCost(big) + tripCost(small) })
    }
  }
  for (const p of plans) {
    const capacity = p.vehicles.reduce((s, v) => s + v.count * VEHICLES[v.type].volM3, 0)
    p.util = volM3 / capacity
    p.label = p.vehicles.map((v) => `${v.count} × ${VEHICLES[v.type].label}`).join(' + ')
  }
  plans.sort((a, b) => a.cost - b.cost)
  return { ...plans[0], alternatives: plans.slice(0, 5) }
}

// ---------- network ----------

/** Airhubs, coverage and distances for a set of sort centres / bases. */
export function prepareNetwork(dcs) {
  const byDist = (pt) => dcs.map((dc) => ({ dc, d: km(pt, dc) })).sort((a, b) => a.d - b.d)
  const airhubs = {}
  const cityDcs = {}
  for (const c of CITIES) {
    const list = byDist(c)
    cityDcs[c.id] = list
    const n = list[0]
    if (n && n.d <= DC_TYPES[n.dc.type].airhubKm) airhubs[c.id] = { id: 'AH-' + c.id, cityId: c.id, name: `Valmo Airhub, ${c.name}`, lat: c.lat, lng: c.lng, sc: n.dc, scKm: n.d }
  }
  const sellerAh = {}
  const sellerDcs = {}
  for (const s of Object.values(sellerById)) {
    let best = null
    for (const ah of Object.values(airhubs)) {
      const d = km(s, ah)
      if (d <= 60 && (!best || d < best.d)) best = { ah, d: Math.max(3, d) }
    }
    sellerAh[s.id] = best
    sellerDcs[s.id] = byDist(s)
  }
  const laneKm = {}
  return {
    dcs, airhubs, sellerAh, sellerDcs, cityDcs,
    laneKm: (a, b) => (laneKm[a.id + b.id] ??= a.id === b.id ? 0 : km(a, b)),
  }
}

// ---------- stage costs ----------

const emptyLoad = () => ({ seller: {}, ahOut: {}, ahIn: {}, lane: {}, premium: {} })
const real = (x) => x * SCALE

function firstMile(order, ahLink, load) {
  const s = load.seller[order.sellerId] ?? { n: 1, vol: order.volume }
  const n = real(Math.max(1, s.n))
  const vol = real(Math.max(order.volume, s.vol))
  const d = ahLink.d
  const choices = PICKUP.map((t) => {
    const trips = Math.max(1, Math.ceil(vol / (VEHICLES[t].volM3 * COST.fill)))
    const cost = t === 'bike' ? n * COST.pickupPayout + trips * 2 * d * VEHICLES.bike.perKm : trips * shortTrip(t, d, 4)
    return { type: t, trips, cost, util: vol / (trips * VEHICLES[t].volM3) }
  }).sort((a, b) => a.cost - b.cost)
  const best = choices[0]
  return { cost: (best.cost * order.volume) / vol + COST.captainManifest, vehicle: best, km: d }
}

function feeder(order, distKm, volSample) {
  const vol = real(Math.max(order.volume, volSample ?? order.volume))
  if (distKm < 15) return { cost: 0.4, plan: null, km: distKm }
  const tripsPerDay = distKm < 60 ? 3 : distKm < 150 ? 2 : 1
  const plan = planFleet(vol, vol * 120, FEEDER, (t) => shortTrip(t, distKm, tripsPerDay))
  return { cost: (plan.cost * order.volume) / vol, plan, km: distKm }
}

function lineHaul(order, from, to, net, load) {
  const dist = net.laneKm(from, to)
  if (!dist) return { cost: 0, plan: null, km: 0 }
  const key = from.id + '>' + to.id
  const l = load.lane[key] ?? { vol: order.volume, kg: order.weight }
  const vol = real(Math.max(order.volume, l.vol))
  const kg = real(Math.max(order.weight, l.kg))
  const plan = planFleet(vol, kg, LINE_HAUL, (t) => lineHaulTrip(t, dist))
  const premium = load.premium[key] ?? 0
  return { cost: ((plan.cost * order.volume) / vol) * (1 + premium), plan, km: dist, premium, key }
}

function lastMile(order, city, load) {
  const tier = city.tier
  const inbound = real(load.ahIn[city.id]?.n ?? 1)
  const drops = COST.dropsPerDay[tier] * (0.85 + 0.3 * Math.min(1, inbound / 6000))
  const perAttempt = COST.pilotDayEarning / drops + (2 * COST.routeKm[tier] * VEHICLES.bike.perKm) / drops
  const f = order.cod ? FAIL_RATE.cod[tier] : FAIL_RATE.prepaid
  const extraAttempts = f + f * f // up to 3 attempts
  const pilot = perAttempt * (1 + extraAttempts * COST.reattemptShare)
  const cod = order.cod ? COST.codFixed + (order.value * COST.codPct) / 100 : 0
  return { cost: pilot + COST.captainDelivery + COST.airhubHandling + cod, perAttempt, drops, attempts: 1 + extraAttempts, failRate: f, cod }
}

const rtoRate = (order, city) => (order.cod ? RTO_RATE.cod[city.tier] : RTO_RATE.prepaid)

function zone(from, to) {
  if (to.special || from.special) return 'special'
  const d = km(from, to)
  if (d < 60) return 'local'
  if (d < 500 || (from.state && from.state === to.state)) return 'regional'
  if (to.metro && from.metro) return 'metro'
  return 'national'
}

/** 3PL rate card on chargeable weight (max of actual and volumetric). */
export function partnerQuote(partner, from, to, order) {
  const z = zone(from, to)
  const base = partner.rates[z]
  if (base == null) return null
  const extra = Math.max(0, Math.ceil(order.chargeKg / 0.5) - 1) * partner.extra500
  const cod = order.cod ? Math.max(partner.codMin, (order.value * partner.codPct) / 100) : 0
  const eta = partner.etaBase + Math.ceil(km(from, to) / partner.kmPerDay)
  return { base, extra, cod, zone: z, eta, forward: base + extra + cod }
}

// rate-card split across stages (industry-typical shares) so 3PL routes compare stage by stage
const RATE_SPLIT = { local: [0.25, 0.12, 0.05, 0.12], regional: [0.2, 0.1, 0.22, 0.1], metro: [0.17, 0.09, 0.3, 0.09], national: [0.15, 0.08, 0.36, 0.08], special: [0.13, 0.08, 0.4, 0.08] }

const node = (kind, x, name) => ({ kind, lat: x.lat, lng: x.lng, name: name ?? x.name })

function partnerRoute(p, seller, city, order) {
  const q = partnerQuote(p, seller, city, order)
  if (!q) return null
  const [fm, ss, lh, ds] = RATE_SPLIT[q.zone]
  const freight = q.base + q.extra
  const stages = {
    firstMile: freight * fm, sourceSort: freight * ss, lineHaul: freight * lh, destSort: freight * ds,
    lastMile: freight * (1 - fm - ss - lh - ds) + q.cod,
    rto: rtoRate(order, city) * q.base * p.rtoShare,
  }
  return {
    mode: p.id, stages, zone: q.zone, etaH: q.eta * 24, fleet: {},
    path: [node('seller', seller), node('customer', city)],
    notes: [`${q.zone} zone rate card · chargeable ${order.chargeKg.toFixed(2)} kg → ₹${q.base} + ₹${q.extra} extra weight${q.cod ? ` + ₹${q.cod.toFixed(0)} COD fee` : ''}; RTO charged at the forward rate. Stage split is the typical share of a 3PL rate.`],
  }
}

/** Valmo (or hybrid) route through given sort centres. */
function valmoRoute(mode, order, net, load, { scO, scD, fm3pl, lm3pl }) {
  const seller = sellerById[order.sellerId]
  const city = cityById[order.cityId]
  const ahO = net.sellerAh[seller.id]
  const ahD = net.airhubs[city.id]
  const stages = {}
  const fleet = {}
  const notes = []
  const path = [node('seller', seller)]

  if (fm3pl) {
    const q = partnerQuote(PARTNERS[2], seller, scO, { ...order, cod: false })
    if (!q) return null
    stages.firstMile = q.forward * COST.injectionDiscount
    stages.sourceSort = DC_TYPES[scO.type].sortFee
    fleet.firstMile = { label: 'Partner Z pickup → injected at sort centre' }
    notes.push(`Partner Z picks up and injects into ${scO.name} (${q.zone} rate × ${COST.injectionDiscount})`)
  } else {
    const fm = firstMile(order, ahO, load)
    stages.firstMile = fm.cost
    fleet.firstMile = { label: VEHICLES[fm.vehicle.type].label, util: fm.vehicle.util, km: fm.km }
    path.push(node('airhub', ahO.ah))
    const fd = feeder(order, km(ahO.ah, scO), load.ahOut[ahO.ah.cityId])
    stages.sourceSort = fd.cost + COST.airhubHandling + DC_TYPES[scO.type].sortFee
    fleet.feederOut = fd.plan ? { label: fd.plan.label, util: fd.plan.util, km: fd.km } : { label: 'Airhub inside sort-centre yard', km: fd.km }
  }
  path.push(node(scO.type, scO))

  const lh = lineHaul(order, scO, scD, net, load)
  stages.lineHaul = lh.cost
  if (lh.plan) {
    fleet.lineHaul = { label: lh.plan.label, util: lh.plan.util, km: lh.km, premium: lh.premium, alternatives: lh.plan.alternatives.map((a) => ({ label: a.label, util: a.util, cost: a.cost })) }
    path.push(node(scD.type, scD))
  }

  let lmCost
  if (lm3pl) {
    const q = partnerQuote(PARTNERS[2], scD, city, order)
    if (!q) return null
    stages.destSort = DC_TYPES[scD.type].sortFee
    lmCost = (q.base + q.extra) * COST.handoverDiscount + q.cod
    stages.lastMile = lmCost
    fleet.lastMile = { label: 'Partner Z last mile' }
    notes.push(`Handed to Partner Z at ${scD.name} (${q.zone} rate × ${COST.handoverDiscount})`)
  } else {
    const fd = feeder(order, km(scD, ahD), load.ahIn[city.id]?.vol)
    stages.destSort = DC_TYPES[scD.type].sortFee + fd.cost
    fleet.feederIn = fd.plan ? { label: fd.plan.label, util: fd.plan.util, km: fd.km } : { label: 'Airhub inside sort-centre yard', km: fd.km }
    path.push(node('airhub', ahD))
    const lm = lastMile(order, city, load)
    stages.lastMile = lm.cost
    lmCost = lm.cost
    fleet.lastMile = { label: `Pilot 2-wheeler · ${Math.round(lm.drops)} drops/day` }
    notes.push(`Last mile: ₹${lm.perAttempt.toFixed(1)} per attempt × ${lm.attempts.toFixed(2)} expected attempts (${Math.round(lm.failRate * 100)}% first-attempt failure) + Airhub fees${lm.cod ? ` + ₹${lm.cod.toFixed(1)} COD handling` : ''}`)
  }
  path.push(node('customer', city))
  const forwardToHub = stages.firstMile + stages.sourceSort + stages.lineHaul + stages.destSort
  stages.rto = rtoRate(order, city) * COST.rtoReverseShare * (forwardToHub + lmCost * 0.5)
  return {
    mode, stages, fleet, notes, path,
    originSc: scO.id, destSc: scD.id, originAh: fm3pl ? null : ahO.ah.cityId, destAh: lm3pl ? null : city.id,
    laneKey: lh.key, laneKm: Math.round(lh.km),
    etaH: estimateHours(order, lh.km, { fm3pl, lm3pl }),
  }
}

function estimateHours(order, lhKm, { fm3pl, lm3pl }) {
  const pickup = 6 + (order.hour > 15 ? 14 : 2)
  const toSc = fm3pl ? 30 : pickup + 8
  const lh = lhKm ? 10 + (lhKm / 40) * 1.15 : 0
  const last = lm3pl ? 34 : 19
  return Math.round(toSc + lh + last)
}

/** Every route for one order (at the day's volumes in `load`), cheapest first. */
export function options(order, net, load = emptyLoad()) {
  const seller = sellerById[order.sellerId]
  const city = cityById[order.cityId]
  const ahO = net.sellerAh[seller.id]
  const ahD = net.airhubs[city.id]
  const out = []
  const destScs = net.cityDcs[city.id]
  if (ahO) {
    const scO = ahO.ah.sc
    if (ahD) {
      out.push(valmoRoute('valmo', order, net, load, { scO, scD: ahD.sc }))
      const alt = destScs.find((x) => x.dc.id !== ahD.sc.id && x.d < 500)
      if (alt) out.push(valmoRoute('valmo_alt', order, net, load, { scO, scD: alt.dc }))
    }
    const near = destScs[0]
    if (near && near.d <= COST.hybridMaxKm) out.push(valmoRoute('hybrid_lm', order, net, load, { scO, scD: near.dc, lm3pl: true }))
  }
  if (ahD) {
    const injectAt = net.sellerDcs[seller.id][0]
    if (injectAt.d <= COST.hybridMaxKm && (!ahO || injectAt.dc.id !== ahO.ah.sc.id)) {
      out.push(valmoRoute('hybrid_fm', order, net, load, { scO: injectAt.dc, scD: ahD.sc, fm3pl: true }))
    }
  }
  for (const p of PARTNERS) out.push(partnerRoute(p, seller, city, order))
  return out
    .filter(Boolean)
    .map((o) => ({ ...o, label: MODE_LABEL[o.mode], cost: Object.values(o.stages).reduce((s, x) => s + x, 0) }))
    .sort((a, b) => a.cost - b.cost)
}

// ---------- day allocation ----------

function tally(orders, choice) {
  const load = emptyLoad()
  orders.forEach((o, i) => {
    const c = choice[i]
    if (!c || !isValmo(c.mode)) return
    if (c.originAh) {
      const s = (load.seller[o.sellerId] ??= { n: 0, vol: 0 })
      s.n += 1
      s.vol += o.volume
      load.ahOut[c.originAh] = (load.ahOut[c.originAh] ?? 0) + o.volume
    }
    if (c.laneKey) {
      const l = (load.lane[c.laneKey] ??= { vol: 0, kg: 0, km: c.laneKm, from: c.originSc, to: c.destSc })
      l.vol += o.volume
      l.kg += o.weight
    }
    if (c.destAh) {
      const a = (load.ahIn[c.destAh] ??= { n: 0, vol: 0 })
      a.n += 1
      a.vol += o.volume
    }
  })
  return load
}

/** Line-haul plans per lane and the contracted vehicle-days they need at each origin sort centre. */
export function lanePlans(load) {
  const plans = {}
  const need = {}
  for (const [key, l] of Object.entries(load.lane)) {
    const plan = planFleet(real(l.vol), real(l.kg), LINE_HAUL, (t) => lineHaulTrip(t, l.km))
    const turn = 2 * Math.max(1, Math.ceil(l.km / COST.truckKmPerDay)) // vehicle-days per round trip
    plans[key] = { ...l, key, plan, turn }
    const n = (need[l.from] ??= {})
    for (const v of plan.vehicles) n[v.type] = (n[v.type] ?? 0) + v.count * turn
  }
  return { plans, need }
}

/**
 * Allocates one day of orders.
 *  'optimized' – cheapest route per order at the day's consolidated volumes; sort centres whose
 *                lanes need more trucks than contracted pay a spot premium and orders are re-priced
 *  'rule'      – Valmo end-to-end when both ends are covered, else Partner Y
 *  'external'  – cheapest 3PL for everything
 */
export function allocateDay(orders, net, fleet, policy = 'optimized') {
  const pick = (opts) => {
    if (policy === 'external') return opts.find((x) => !isValmo(x.mode))
    if (policy === 'rule') return opts.find((x) => x.mode === 'valmo') ?? opts.find((x) => x.mode === 'YS') ?? opts.find((x) => !isValmo(x.mode))
    return opts[0]
  }
  // pass 1: everything that can ride Valmo does, to estimate consolidated volumes
  let choice = orders.map((o) => {
    const op = options(o, net)
    return policy === 'external' ? pick(op) : op.find((x) => x.mode === 'valmo') ?? op.find((x) => isValmo(x.mode)) ?? op[0]
  })
  let load = tally(orders, choice)
  // pass 2: price at those volumes and choose
  choice = orders.map((o) => pick(options(o, net, load)))
  load = tally(orders, choice)
  // pass 3: contracted fleet check → spot premium where trucks run short, re-price
  if (fleet && policy !== 'external') {
    const { need } = lanePlans(load)
    for (const [sc, types] of Object.entries(need)) {
      if (!fleet[sc]) continue // unplanned site (scenario candidate): no contracted-fleet limit
      const want = Object.entries(types).reduce((s, [t, n]) => s + n * VEHICLES[t].volM3, 0)
      const have = Object.entries(types).reduce((s, [t, n]) => s + Math.min(n, fleet[sc]?.[t] ?? 0) * VEHICLES[t].volM3, 0)
      if (have >= want) continue
      for (const key of Object.keys(load.lane)) if (load.lane[key].from === sc) load.premium[key] = COST.spotPremium * (1 - have / want)
    }
    choice = orders.map((o) => pick(options(o, net, load)))
    const premium = load.premium
    load = tally(orders, choice)
    load.premium = premium
  }
  const final = orders.map((o, i) => {
    const c = choice[i]
    if (!isValmo(c.mode)) return c
    return options(o, net, load).find((x) => x.mode === c.mode) ?? c
  })
  return { choice: final, load, ...lanePlans(load) }
}

// ---------- fleet, periods, simulation ----------

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

export const ordersBetween = (from, to) => ORDERS().filter((o) => o.day >= from && o.day <= to)

/** Contracted line-haul fleet per sort centre = average daily need over the last 30 days. */
export function defaultFleet(dcs, orders) {
  const net = prepareNetwork(dcs)
  const days = groupByDay(orders).slice(-30)
  const sum = {}
  for (const [, dayOrders] of days) {
    const { need } = allocateDay(dayOrders, net, null)
    for (const [sc, types] of Object.entries(need)) {
      for (const [t, n] of Object.entries(types)) {
        sum[sc] ??= {}
        sum[sc][t] = (sum[sc][t] ?? 0) + n
      }
    }
  }
  const fleet = {}
  for (const dc of dcs) {
    const s = sum[dc.id] ?? {}
    fleet[dc.id] = Object.fromEntries(LINE_HAUL.map((t) => [t, Math.ceil((s[t] ?? 0) / Math.max(1, days.length))]))
  }
  return fleet
}

const zeroStages = () => Object.fromEntries(STAGES.map(([k]) => [k, 0]))

/** Runs a policy over a set of days: totals, stage split, monthly series and sort-centre utilisation. */
export function simulate(orders, dcs, fleet, policy = 'optimized') {
  const net = prepareNetwork(dcs)
  const days = groupByDay(orders)
  const totals = { cost: 0, orders: 0, byMode: {}, costByMode: {}, stages: zeroStages() }
  const monthly = {}
  const sc = {}
  const scOf = (id) => (sc[id] ??= { parcels: 0, vol: 0, cap: 0, need: {} })
  for (const [day, dayOrders] of days) {
    const { choice, plans, need } = allocateDay(dayOrders, net, fleet, policy)
    const m = (monthly[day.slice(0, 7)] ??= { month: day.slice(0, 7), cost: 0, orders: 0 })
    for (const c of choice) {
      totals.cost += c.cost
      totals.orders += 1
      totals.byMode[c.mode] = (totals.byMode[c.mode] ?? 0) + 1
      totals.costByMode[c.mode] = (totals.costByMode[c.mode] ?? 0) + c.cost
      for (const [k, v] of Object.entries(c.stages)) totals.stages[k] += v
      m.cost += c.cost
      m.orders += 1
      if (c.originSc) scOf(c.originSc).parcels += 1
      if (c.destSc && c.destSc !== c.originSc) scOf(c.destSc).parcels += 1
    }
    for (const p of Object.values(plans)) {
      const s = scOf(p.from)
      s.vol += real(p.vol)
      s.cap += p.plan.vehicles.reduce((a, v) => a + v.count * VEHICLES[v.type].volM3, 0)
    }
    for (const [id, types] of Object.entries(need)) {
      for (const [t, n] of Object.entries(types)) scOf(id).need[t] = (scOf(id).need[t] ?? 0) + n
    }
  }
  const n = days.length || 1
  const utilisation = dcs.map((dc) => {
    const s = sc[dc.id] ?? { parcels: 0, vol: 0, cap: 0, need: {} }
    const needVol = LINE_HAUL.reduce((a, t) => a + ((s.need[t] ?? 0) / n) * VEHICLES[t].volM3, 0)
    const haveVol = LINE_HAUL.reduce((a, t) => a + (fleet?.[dc.id]?.[t] ?? 0) * VEHICLES[t].volM3, 0)
    return {
      id: dc.id, name: dc.name, type: dc.type,
      orders: Math.round((s.parcels / n) * SCALE),
      fill: s.cap ? s.vol / s.cap : null,
      fleetUse: haveVol ? needVol / haveVol : needVol ? 9.99 : null,
      usage: Object.fromEntries(LINE_HAUL.map((t) => {
        const needT = (s.need[t] ?? 0) / n
        const have = fleet?.[dc.id]?.[t]
        return [t, { need: needT, have, util: have ? needT / have : needT ? 9.99 : null }]
      })),
    }
  })
  const scaleObj = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, v * SCALE]))
  return {
    days: n,
    totals: {
      cost: totals.cost * SCALE,
      orders: totals.orders * SCALE,
      perOrder: totals.cost / Math.max(1, totals.orders),
      byMode: scaleObj(totals.byMode),
      costByMode: scaleObj(totals.costByMode),
      stagesPerOrder: Object.fromEntries(Object.entries(totals.stages).map(([k, v]) => [k, v / Math.max(1, totals.orders)])),
    },
    monthly: Object.values(monthly).map((m) => ({ ...m, cost: m.cost * SCALE, orders: m.orders * SCALE })),
    utilisation,
  }
}

/** Network + auto-sized contracted fleet for new sort centres / bases. */
export function withNewDcs(baseDcs, baseFleet, newDcs, orders) {
  const dcs = [...baseDcs, ...newDcs]
  if (!newDcs.length) return { dcs, fleet: baseFleet }
  const sized = defaultFleet(dcs, orders)
  const fleet = { ...baseFleet }
  for (const d of newDcs) fleet[d.id] = d.fleet ?? sized[d.id]
  return { dcs, fleet }
}
