// Batch analysis: replays every order between two dates through Valmo's 5 stages hour by hour.
// Costs come from the day-by-day optimiser; timing comes from the network's fixed schedules plus
// line-haul trucks that wait at the source sort centre until they are full enough to dispatch.
import { SCALE, cityById, km, productById, sellerById } from './data.js'
import { COST, FAIL_RATE, STAGES, VEHICLES, allocateDay, groupByDay, isValmo, lineHaulTrip, ordersBetween, prepareNetwork } from './optimizer.js'

export const SCHEDULE = {
  sellerPackH: 3, // seller packs & manifests after the order
  pickupSlots: [11, 17], // pilot pickup rounds
  pickupSpeed: 22, // km/h
  airhubFeeder: [21], // nightly feeder Airhub → sort centre (cut-off 1 h before)
  feederSpeed: 35,
  sortH: 2, // Valmo Handlers sort & batch at a sort centre
  lineHaulSpeed: 38, // km/h average including rest stops
  maxHoldH: 30, // a parcel never waits longer than this for a truck to fill
  destFeeder: [4, 13], // sort centre → Airhub feeder departures
  waves: { 1: [9.5, 14], 2: [9.5], 3: [9.5] }, // last-mile waves by city tier
  waveLengthH: 7,
  hybridLastMileH: 30, // 3PL handover + delivery
  injectionH: 30, // 3PL pickup + injection into a sort centre
}

export const BUCKETS = [
  ['toAirhub', 'Supplier → Airhub', 'Packing, waiting for a pilot pickup round, ride to the Airhub'],
  ['toSc', 'Airhub → source sort centre', 'Waiting for the night feeder, feeder ride, sorting'],
  ['waitSc', 'Waiting at sort centre for a truck', 'Line-haul truck waits until it is full enough to dispatch'],
  ['lineHaul', 'Line haul', 'Sort centre to sort centre'],
  ['toDestAirhub', 'Destination sort centre → Airhub', 'Re-sort, waiting for a feeder, feeder ride'],
  ['waitAirhub', 'Waiting at Airhub for a delivery wave', 'Parcels go out with the next pilot wave'],
  ['outForDelivery', 'Out for delivery', 'Pilot route incl. failed attempts'],
  ['partner', '3PL handled', 'Time inside a partner network'],
]

const nextSlot = (t, hours) => {
  const day = Math.floor(t / 24)
  for (let k = 0; k < 4; k++) for (const h of hours) if ((day + k) * 24 + h >= t) return (day + k) * 24 + h
  return t
}
// deterministic pseudo-random in [0,1) from an order id
const hash = (s, salt = 0) => {
  let h = 2166136261 ^ salt
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619)
  return ((h >>> 0) % 10000) / 10000
}
const dayIndex = (day, from) => Math.round((new Date(day + 'T00:00:00Z') - new Date(from + 'T00:00:00Z')) / 86400000)
const avg = (xs) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0)
const pct = (xs, p) => {
  if (!xs.length) return 0
  const s = [...xs].sort((a, b) => a - b)
  return s[Math.min(s.length - 1, Math.floor(p * s.length))]
}

/**
 * Dispatch a lane's queue of ~1 m³ chunks. Trucks leave when the waiting volume reaches
 * threshold × usable capacity (only trucks that will be at least that full go), or when the
 * oldest chunk hits the max hold time (then everything waiting goes).
 */
function dispatchLane(items, type, distKm, threshold) {
  const cap = VEHICLES[type].volM3 * COST.fill
  const trips = []
  const queue = []
  let vol = 0
  const leave = (t, n) => {
    let room = n * cap
    let carried = 0
    while (queue.length && queue[0].vol <= room + 1e-9) {
      const it = queue.shift()
      room -= it.vol
      carried += it.vol
      it.depart = t
    }
    trips.push({ depart: t, vehicles: n, vol: carried, cap: n * VEHICLES[type].volM3, cost: n * lineHaulTrip(type, distKm) })
    vol -= carried
  }
  for (const it of items) {
    while (queue.length && queue[0].ready + SCHEDULE.maxHoldH <= it.ready) leave(queue[0].ready + SCHEDULE.maxHoldH, Math.max(1, Math.ceil(vol / cap)))
    queue.push(it)
    vol += it.vol
    while (vol >= threshold * cap - 1e-9) {
      const n = Math.max(1, Math.floor(vol / cap) + (vol % cap >= threshold * cap ? 1 : 0))
      leave(it.ready, n)
    }
  }
  while (queue.length) leave(queue[0].ready + SCHEDULE.maxHoldH, Math.max(1, Math.ceil(vol / cap)))
  return trips
}

function runDispatch(lanes, threshold) {
  const allTrips = []
  for (const lane of Object.values(lanes)) {
    lane.items.sort((a, b) => a.ready - b.ready)
    lane.trips = dispatchLane(lane.items, lane.type, lane.km, threshold)
    allTrips.push(...lane.trips)
  }
  return allTrips
}

export function batchAnalysis(from, to, { dcs, fleet, threshold = 0.8, delayCostPerHour = 0.25 }) {
  const orders = ordersBetween(from, to)
  const net = prepareNetwork(dcs)
  const rows = []
  const lanes = {}
  const stageSum = Object.fromEntries(STAGES.map(([k]) => [k, 0]))
  let cost = 0
  const byMode = {}

  for (const [day, dayOrders] of groupByDay(orders)) {
    const { choice, plans } = allocateDay(dayOrders, net, fleet)
    const d0 = dayIndex(day, from)
    dayOrders.forEach((o, i) => {
      const c = choice[i]
      cost += c.cost
      byMode[c.mode] = (byMode[c.mode] ?? 0) + 1
      for (const [k, v] of Object.entries(c.stages)) stageSum[k] += v
      const city = cityById[o.cityId]
      const placed = d0 * 24 + o.hour
      const row = { o, c, city, placed, b: {} }
      rows.push(row)
      if (!isValmo(c.mode)) {
        row.b.partner = c.etaH * (0.85 + 0.3 * hash(o.id))
        row.delivered = placed + row.b.partner
        return
      }
      // stages 1-2: to the source sort centre
      let arriveSc
      if (c.mode === 'hybrid_fm') {
        arriveSc = placed + SCHEDULE.injectionH
        row.b.toAirhub = SCHEDULE.injectionH
        row.b.toSc = 0
      } else {
        const seller = sellerById[o.sellerId]
        const ah = net.airhubs[c.originAh]
        const pickup = nextSlot(placed + SCHEDULE.sellerPackH, SCHEDULE.pickupSlots)
        const arriveAh = pickup + km(seller, ah) / SCHEDULE.pickupSpeed + 0.5
        const sc = net.dcs.find((x) => x.id === c.originSc)
        const feederDep = nextSlot(arriveAh + 1, SCHEDULE.airhubFeeder)
        arriveSc = feederDep + km(ah, sc) / SCHEDULE.feederSpeed + 0.5
        row.b.toAirhub = arriveAh - placed
        row.b.toSc = arriveSc + SCHEDULE.sortH - arriveAh
      }
      row.readyLh = arriveSc + SCHEDULE.sortH
      // stage 3: queue on the lane (resolved after all days are loaded)
      if (c.laneKey) {
        const plan = plans[c.laneKey]?.plan
        const biggest = plan?.vehicles.map((v) => v.type).sort((a, b) => VEHICLES[b].volM3 - VEHICLES[a].volM3)[0] ?? 't14'
        const lane = (lanes[c.laneKey] ??= { key: c.laneKey, from: c.originSc, to: c.destSc, km: c.laneKm, items: [], types: {} })
        lane.types[biggest] = (lane.types[biggest] ?? 0) + 1
        lane.orders = (lane.orders ?? 0) + 1
        const total = o.volume * SCALE
        const k = Math.max(1, Math.min(60, Math.round(total)))
        row.chunks = Array.from({ length: k }, () => ({ ready: row.readyLh, vol: total / k }))
        lane.items.push(...row.chunks)
      }
    })
  }
  // each lane runs the vehicle type its daily plans used most
  for (const lane of Object.values(lanes)) lane.type = Object.entries(lane.types).sort((a, b) => b[1] - a[1])[0][0]

  const finish = () => {
    for (const row of rows) {
      if (!isValmo(row.c.mode)) continue
      const { o, c, city } = row
      const depart = row.chunks ? avg(row.chunks.map((ch) => ch.depart)) : row.readyLh
      row.b.waitSc = depart - row.readyLh
      row.b.lineHaul = row.chunks ? c.laneKm / SCHEDULE.lineHaulSpeed : 0
      const arriveDsc = depart + row.b.lineHaul
      if (c.mode === 'hybrid_lm') {
        row.b.partner = SCHEDULE.hybridLastMileH * (0.8 + 0.4 * hash(o.id, 3))
        row.delivered = arriveDsc + row.b.partner
        continue
      }
      const ah = cityById[c.destAh]
      const scNode = net.dcs.find((x) => x.id === c.destSc)
      const feedDep = nextSlot(arriveDsc + SCHEDULE.sortH, SCHEDULE.destFeeder)
      const arriveAh = feedDep + km(scNode, ah) / SCHEDULE.feederSpeed + 0.5
      row.b.toDestAirhub = arriveAh - arriveDsc
      const wave = nextSlot(arriveAh + 0.5, SCHEDULE.waves[city.tier])
      row.b.waitAirhub = wave - arriveAh
      const f = o.cod ? FAIL_RATE.cod[city.tier] : FAIL_RATE.prepaid
      const fails = (hash(o.id, 7) < f ? 1 : 0) + (hash(o.id, 9) < f * f ? 1 : 0)
      row.b.outForDelivery = 1 + hash(o.id, 5) * (SCHEDULE.waveLengthH - 1) + fails * 24
      row.delivered = wave + row.b.outForDelivery
    }
  }

  const trips = runDispatch(lanes, threshold)
  finish()

  // what-if: other dispatch thresholds (same allocation, different truck waiting)
  const compare = [0.5, 0.65, 0.8, 0.9, 0.97].map((th) => {
    const t = runDispatch(lanes, th)
    const waits = rows.filter((r) => r.chunks).map((r) => avg(r.chunks.map((ch) => ch.depart)) - r.readyLh)
    const parcels = Object.values(lanes).reduce((s, l) => s + l.orders, 0) * SCALE
    const lhCost = t.reduce((s, x) => s + x.cost, 0) / Math.max(1, parcels)
    const fill = t.reduce((s, x) => s + x.vol, 0) / Math.max(1, t.reduce((s, x) => s + x.cap, 0))
    const avgWait = avg(waits)
    return { threshold: th, avgWait, p90Wait: pct(waits, 0.9), lhCost, fill, trips: t.reduce((s, x) => s + x.vehicles, 0), total: lhCost + avgWait * delayCostPerHour }
  })
  // restore the selected threshold's dispatch for the detailed tables
  runDispatch(lanes, threshold)
  finish()
  const best = [...compare].sort((a, b) => a.total - b.total)[0]

  const valmoRows = rows.filter((r) => isValmo(r.c.mode))
  const bucketAvg = Object.fromEntries(BUCKETS.map(([k]) => [k, avg(valmoRows.map((r) => r.b[k] ?? 0))]))
  const totalH = rows.map((r) => r.delivered - r.placed)

  const perProduct = {}
  for (const r of rows) {
    const p = (perProduct[r.o.productId] ??= { productId: r.o.productId, rows: [] })
    p.rows.push(r)
  }
  const products = Object.values(perProduct).map((p) => {
    const v = p.rows.filter((r) => isValmo(r.c.mode))
    const prod = productById[p.productId]
    return {
      productId: p.productId, name: prod.name, category: prod.category,
      orders: p.rows.length * SCALE,
      valmoShare: v.length / p.rows.length,
      cost: avg(p.rows.map((r) => r.c.cost)),
      days: avg(p.rows.map((r) => (r.delivered - r.placed) / 24)),
      buckets: Object.fromEntries(BUCKETS.map(([k]) => [k, avg(v.map((r) => r.b[k] ?? 0))])),
    }
  }).sort((a, b) => b.orders - a.orders)

  const laneRows = Object.values(lanes).map((l) => {
    const waits = rows.filter((r) => r.chunks && r.c.laneKey === l.key).map((r) => r.b.waitSc)
    const vehicles = l.trips.reduce((s, t) => s + t.vehicles, 0)
    const vol = l.trips.reduce((s, t) => s + t.vol, 0)
    const cap = l.trips.reduce((s, t) => s + t.cap, 0)
    return {
      key: l.key, from: l.from, to: l.to, km: Math.round(l.km), vehicle: VEHICLES[l.type].label,
      parcels: l.orders * SCALE, trips: vehicles, fill: vol / cap, avgWait: avg(waits), maxWait: Math.max(...waits),
      costPerParcel: l.trips.reduce((s, t) => s + t.cost, 0) / (l.orders * SCALE),
    }
  }).sort((a, b) => b.parcels - a.parcels)

  const hist = [0, 0, 0, 0, 0, 0, 0, 0]
  for (const h of totalH) hist[Math.min(7, Math.floor(h / 24))] += SCALE
  const n = rows.length || 1
  const samples = rows.filter((r, i) => i % Math.max(1, Math.floor(rows.length / 30)) === 0).slice(0, 30).map((r) => ({
    id: r.o.id, day: r.o.day, hour: r.o.hour, product: productById[r.o.productId].name, seller: sellerById[r.o.sellerId].city, city: r.city.name,
    mode: r.c.mode, label: r.c.label, cost: r.c.cost, buckets: r.b, totalH: r.delivered - r.placed,
  }))

  return {
    from, to, threshold, delayCostPerHour,
    summary: {
      orders: rows.length * SCALE,
      days: groupByDay(orders).length,
      valmoShare: valmoRows.length / n,
      costPerOrder: cost / n,
      stagesPerOrder: Object.fromEntries(Object.entries(stageSum).map(([k, v]) => [k, v / n])),
      avgDays: avg(totalH) / 24,
      p90Days: pct(totalH, 0.9) / 24,
      avgWaitSc: avg(valmoRows.filter((r) => r.chunks).map((r) => r.b.waitSc)),
      p90WaitSc: pct(valmoRows.filter((r) => r.chunks).map((r) => r.b.waitSc), 0.9),
      avgWaitAirhub: bucketAvg.waitAirhub,
      trips: trips.reduce((s, t) => s + t.vehicles, 0),
      fill: trips.reduce((s, t) => s + t.vol, 0) / Math.max(1, trips.reduce((s, t) => s + t.cap, 0)),
      byMode: Object.fromEntries(Object.entries(byMode).map(([k, v]) => [k, v * SCALE])),
    },
    buckets: bucketAvg,
    compare,
    recommended: best.threshold,
    products: products.slice(0, 25),
    lanes: laneRows.slice(0, 15),
    histogram: hist.map((v, i) => ({ days: i === 7 ? '7+' : `${i}–${i + 1}`, orders: v })),
    samples,
  }
}
