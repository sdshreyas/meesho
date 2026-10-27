// Simulated Valmo shipment: seller -> origin hub -> sort centre -> destination
// hub -> doorstep. Demo time is compressed so a 4-day journey plays in ~4 minutes.

export const DEMO_SECONDS = 240
const REAL_DAYS = 4

const SORT_CENTRES = [
  { name: 'Valmo Sort Centre, Gurugram', lat: 28.4595, lng: 77.0266 },
  { name: 'Valmo Sort Centre, Bhiwandi', lat: 19.2813, lng: 73.0483 },
  { name: 'Valmo Sort Centre, Hoskote', lat: 13.0707, lng: 77.7982 },
  { name: 'Valmo Sort Centre, Kolkata', lat: 22.5726, lng: 88.3639 },
  { name: 'Valmo Sort Centre, Nagpur', lat: 21.1458, lng: 79.0882 },
  { name: 'Valmo Sort Centre, Ahmedabad', lat: 23.0225, lng: 72.5714 },
]

const RIDERS = ['Ramesh K.', 'Imran S.', 'Suresh P.', 'Anil M.', 'Joseph D.', 'Vikram R.']

const dist = (a, b) => Math.hypot(a.lat - b.lat, a.lng - b.lng)
const offset = (p, dLat, dLng, name) => ({ name, lat: p.lat + dLat, lng: p.lng + dLng })

export function planRoute(from, to, seed = 1) {
  const mid = { lat: (from.lat + to.lat) / 2, lng: (from.lng + to.lng) / 2 }
  const sort = [...SORT_CENTRES].sort((a, b) => dist(a, mid) - dist(b, mid))[0]
  const origin = offset(from, 0.06, 0.05, `Valmo Hub, ${from.city}`)
  const dest = offset(to, -0.05, 0.04, `Valmo Hub, ${to.city}`)
  const door = offset(to, 0.012, -0.01, 'Your address')
  // last-mile zig-zag through local streets
  const lastMile = [0.3, 0.55, 0.8].map((f, i) => ({
    lat: dest.lat + (door.lat - dest.lat) * f + (i % 2 ? 0.006 : -0.006),
    lng: dest.lng + (door.lng - dest.lng) * f + (i % 2 ? -0.007 : 0.007),
  }))
  // [status reached at the START of the leg, waypoints, share of total time]
  return {
    stops: { seller: { ...from, name: from.name }, origin, sort, dest, door },
    legs: [
      { status: 'st_picked', path: [from, origin], share: 0.1 },
      { status: 'st_origin', path: [origin, origin], share: 0.08 },
      { status: 'st_transit', path: [origin, sort], share: 0.3 },
      { status: 'st_sort', path: [sort, sort], share: 0.07 },
      { status: 'st_dest', path: [sort, dest], share: 0.25 },
      { status: 'st_ofd', path: [dest, ...lastMile, door], share: 0.2 },
    ],
    rider: RIDERS[seed % RIDERS.length],
  }
}

function along(path, f) {
  const segs = path.slice(1).map((p, i) => dist(path[i], p))
  const total = segs.reduce((s, d) => s + d, 0)
  if (!total) return { lat: path[0].lat, lng: path[0].lng }
  let target = total * f
  for (let i = 0; i < segs.length; i++) {
    if (target <= segs[i] || i === segs.length - 1) {
      const t = segs[i] ? Math.min(1, target / segs[i]) : 0
      return {
        lat: path[i].lat + (path[i + 1].lat - path[i].lat) * t,
        lng: path[i].lng + (path[i + 1].lng - path[i].lng) * t,
      }
    }
    target -= segs[i]
  }
}

/** Live tracking snapshot for an order at time `now`. */
export function trackingSnapshot(order, now = Date.now()) {
  const route = planRoute(order.from, order.to, order.seed)
  const progress = Math.min(1, (now - order.placedAt) / 1000 / DEMO_SECONDS)
  const realMs = REAL_DAYS * 86400000
  const toReal = (f) => order.placedAt + f * realMs

  const events = [{ status: 'st_placed', at: order.placedAt, done: true }]
  let acc = 0
  let position = route.stops.seller
  let status = 'st_placed'
  let headingTo = route.stops.origin
  for (const leg of route.legs) {
    const start = acc
    acc += leg.share
    const reached = progress >= start
    events.push({ status: leg.status, at: toReal(start), done: reached })
    if (reached) status = leg.status
    if (progress >= start && progress < acc) {
      position = along(leg.path, (progress - start) / leg.share)
      headingTo = leg.path[leg.path.length - 1]
    }
  }
  const delivered = progress >= 1
  events.push({ status: 'st_delivered', at: toReal(1), done: delivered })
  if (delivered) {
    status = 'st_delivered'
    position = route.stops.door
  }

  return {
    orderId: order.id,
    progress,
    status,
    position,
    headingTo,
    delivered,
    eta: toReal(1),
    events,
    stops: route.stops,
    fullPath: route.legs.flatMap((l) => l.path),
    rider: { name: route.rider, phone: '+91 98XXX XX' + (40 + (order.seed % 50)), vehicle: 'Bike · DL 3S ' + (1000 + order.seed * 7) },
    partner: 'Valmo',
  }
}
