// Thin client for the (mock) backend. Relative URLs resolve under the
// GitHub Pages base path, e.g. /meesho/api/products.
const BASE = import.meta.env.BASE_URL + 'api'

async function req(path, opts = {}) {
  const res = await fetch(BASE + path, {
    ...opts,
    headers: { 'Content-Type': 'application/json' },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  })
  if (!res.ok) throw new Error(`${res.status} ${path}`)
  return res.json()
}

const qs = (o) => new URLSearchParams(Object.entries(o).filter(([, v]) => v !== undefined && v !== '' && v !== null)).toString()

export const api = {
  profiles: () => req('/profiles'),
  products: (o) => req('/products?' + qs(o)),
  bundles: (o) => req('/bundles?' + qs(o)),
  product: (id, o) => req(`/products/${id}?` + qs(o)),
  quote: (body) => req('/cart/quote', { method: 'POST', body }),
  placeOrder: (body) => req('/orders', { method: 'POST', body }),
  orders: (persona) => req('/orders?' + qs({ persona })),
  tracking: (id) => req(`/orders/${id}/tracking`),
  sellerDashboard: (id) => req(`/sellers/${id}/dashboard`),
  setInsurance: (id, plan, enrolled) => req(`/sellers/${id}/insurance`, { method: 'POST', body: { plan, enrolled } }),
  applyLoan: (id, loan) => req(`/sellers/${id}/loans`, { method: 'POST', body: { loan } }),
}
