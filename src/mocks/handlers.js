// REST API served by Mock Service Worker. The app calls these with fetch()
// exactly as it would call a real backend.
import { http, HttpResponse, delay } from 'msw'
import { db } from './db.js'
import { recommend, buildBundle, bundlesForPersona, frequentlyBought, similar } from '../engine/recommend.js'
import { quote } from '../engine/pricing.js'
import { trackingSnapshot } from '../engine/logistics.js'
import { sellerDashboard } from '../engine/seller.js'

const latency = () => delay(120 + Math.random() * 180)
const flag = (url, name) => url.searchParams.get(name) !== '0'
const notFound = (msg) => HttpResponse.json({ error: msg }, { status: 404 })

export const handlers = [
  http.get('*/api/profiles', async () => {
    await latency()
    return HttpResponse.json(db.profiles)
  }),

  // Personalised feed. ?persona=U1&category=&q=&nudges=1
  http.get('*/api/products', async ({ request }) => {
    await latency()
    const url = new URL(request.url)
    const persona = db.profile(url.searchParams.get('persona'))
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
    const persona = db.profile(url.searchParams.get('persona'))
    if (!persona || !flag(url, 'nudges')) return HttpResponse.json([])
    return HttpResponse.json(bundlesForPersona(db.products, persona))
  }),

  http.get('*/api/products/:id', async ({ params, request }) => {
    await latency()
    const url = new URL(request.url)
    const product = db.product(params.id)
    if (!product) return notFound('product')
    const persona = db.profile(url.searchParams.get('persona'))
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
    const persona = db.profile(personaId)
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
    const persona = db.profile(personaId)
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
    return HttpResponse.json({
      ...sellerDashboard(seller, db.products),
      enrolled: db.insurance(seller.id),
      loans: db.loans(seller.id),
    })
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
