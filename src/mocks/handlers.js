// REST API served by Mock Service Worker. The app calls these with fetch()
// exactly as it would call a real backend.
import { http, HttpResponse, delay } from 'msw'
import { db } from './db.js'
import { recommend, buildBundle, bundlesForPersona, frequentlyBought, similar } from '../engine/recommend.js'
import { quote } from '../engine/pricing.js'
import { trackingSnapshot } from '../engine/logistics.js'
import { audioSummary, sellerDashboard } from '../engine/seller.js'
import { DEMO_OTP } from '../data/personas.js'
import { userdb } from './userdb.js'
import { applyPrefs } from '../personalise/applyPrefs.js'

// buyer profile merged with their live preferences
const shopper = (id) => {
  const p = db.profile(id)
  return p?.type === 'buyer' ? applyPrefs(p, userdb.prefs(p.id)) : p
}

const latency = () => delay(120 + Math.random() * 180)
const flag = (url, name) => url.searchParams.get(name) !== '0'
const notFound = (msg) => HttpResponse.json({ error: msg }, { status: 404 })

export const handlers = [
  // Login step 1: phone number -> OTP "sent" (demo: the OTP is returned for display)
  http.post('*/api/auth/send-otp', async ({ request }) => {
    await latency()
    const { phone, role } = await request.json()
    const profile = db.profiles.find((p) => p.phone === phone && p.type === role)
    if (!profile) return HttpResponse.json({ error: 'not_registered' }, { status: 404 })
    return HttpResponse.json({ sent: true, demoOtp: DEMO_OTP, expiresIn: 30 })
  }),

  // Login step 2: verify OTP -> session token
  http.post('*/api/auth/verify-otp', async ({ request }) => {
    await latency()
    const { phone, role, otp } = await request.json()
    const profile = db.profiles.find((p) => p.phone === phone && p.type === role)
    if (!profile) return HttpResponse.json({ error: 'not_registered' }, { status: 404 })
    if (otp !== DEMO_OTP) return HttpResponse.json({ error: 'wrong_otp' }, { status: 401 })
    return HttpResponse.json({ token: 'demo-' + profile.id + '-' + Date.now(), profileId: profile.id })
  }),

  http.get('*/api/profiles', async () => {
    await latency()
    return HttpResponse.json(db.profiles)
  }),

  // Personalised feed. ?persona=U1&category=&q=&nudges=1
  http.get('*/api/products', async ({ request }) => {
    await latency()
    const url = new URL(request.url)
    const persona = shopper(url.searchParams.get('persona'))
    const category = url.searchParams.get('category')
    const q = url.searchParams.get('q')?.toLowerCase()
    const nudges = flag(url, 'nudges')
    let list = recommend(db.products, persona?.type === 'buyer' ? persona : null, { nudges })
    if (category) list = list.filter((p) => p.category === category)
    if (q) list = list.filter((p) => `${p.name} ${p.subcategory} ${p.category} ${p.id}`.toLowerCase().includes(q))
    return HttpResponse.json(list)
  }),

  http.get('*/api/bundles', async ({ request }) => {
    await latency()
    const url = new URL(request.url)
    const persona = shopper(url.searchParams.get('persona'))
    if (!persona || !flag(url, 'nudges')) return HttpResponse.json([])
    return HttpResponse.json(bundlesForPersona(db.products, persona))
  }),

  http.get('*/api/products/:id', async ({ params, request }) => {
    await latency()
    const url = new URL(request.url)
    const product = db.product(params.id)
    if (!product) return notFound('product')
    const persona = shopper(url.searchParams.get('persona'))
    const nudges = flag(url, 'nudges')
    const seller = db.sellerLocations[product.sellerId]
    if (!persona || persona.type !== 'buyer') return HttpResponse.json({ product, seller, similar: similar(product, db.products, db.profiles[0]) })
    return HttpResponse.json({
      product,
      seller,
      bundle: nudges ? buildBundle(product, db.products, persona) : null,
      frequentlyBought: nudges ? frequentlyBought(product, db.products, persona) : [],
      similar: similar(product, db.products, persona),
    })
  }),

  // Price a cart and return nudges, gap-filler suggestions and BNPL plans.
  http.post('*/api/cart/quote', async ({ request }) => {
    await latency()
    const { lines = [], personaId, payment = 'COD', nudges = true } = await request.json()
    const persona = shopper(personaId)
    const q = quote(lines, db.products, persona, { nudges, payment })
    const inCart = lines.map((l) => l.productId)
    const cartSubs = inCart.map((id) => db.product(id)?.subcategory)
    q.suggestions = nudges && lines.length
      ? recommend(db.products, persona, { exclude: inCart, cartSubs, gap: q.gap, limit: 6 })
      : []
    return HttpResponse.json(q)
  }),

  http.post('*/api/orders', async ({ request }) => {
    await latency()
    const { lines = [], personaId, payment, plan, nudges = true } = await request.json()
    const persona = shopper(personaId)
    if (!persona || !lines.length) return HttpResponse.json({ error: 'invalid order' }, { status: 400 })
    const q = quote(lines, db.products, persona, { nudges, payment })
    // ships from the seller of the highest-value line
    const main = [...q.items].sort((a, b) => b.lineTotal - a.lineTotal)[0]
    const sellerId = db.product(main.productId).sellerId
    const seed = Math.floor(Math.random() * 1000)
    const order = db.addOrder({
      id: 'MSH' + Date.now().toString().slice(-8),
      personaId,
      lines,
      total: q.total,
      quote: q,
      payment,
      plan: plan ?? null,
      placedAt: Date.now(),
      seed,
      from: { ...db.sellerLocations[sellerId] },
      to: { city: persona.city, lat: persona.lat, lng: persona.lng, name: persona.name },
    })
    return HttpResponse.json(order, { status: 201 })
  }),

  http.post('*/api/orders/:id/return', async ({ params, request }) => {
    await latency()
    const { reason = 'Changed my mind' } = await request.json().catch(() => ({}))
    const o = db.returnOrder(params.id, reason)
    if (!o) return notFound('order')
    return HttpResponse.json(o)
  }),

  http.get('*/api/orders', async ({ request }) => {
    await latency()
    const personaId = new URL(request.url).searchParams.get('persona')
    return HttpResponse.json(db.orders(personaId).map((o) => ({ ...o, tracking: trackingSnapshot(o) })))
  }),

  // Logistics integration: live shipment position from the Valmo simulator.
  http.get('*/api/orders/:id/tracking', async ({ params }) => {
    await delay(80)
    const order = db.order(params.id)
    if (!order) return notFound('order')
    return HttpResponse.json({ order, tracking: trackingSnapshot(order) })
  }),

  http.get('*/api/sellers/:id/dashboard', async ({ params }) => {
    await latency()
    const seller = db.profile(params.id)
    if (!seller || seller.type !== 'seller') return notFound('seller')
    const dash = sellerDashboard(seller, db.products)
    const enrolled = db.insurance(seller.id)
    return HttpResponse.json({ ...dash, enrolled, loans: db.loans(seller.id), summary: audioSummary(dash, enrolled) })
  }),

  http.post('*/api/sellers/:id/insurance', async ({ params, request }) => {
    await latency()
    const { plan, enrolled } = await request.json()
    return HttpResponse.json(db.setInsurance(params.id, plan, enrolled))
  }),

  http.post('*/api/sellers/:id/loans', async ({ params, request }) => {
    await latency()
    const { loan } = await request.json()
    return HttpResponse.json(db.applyLoan(params.id, loan))
  }),
]
