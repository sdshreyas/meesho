// Fake database. Catalogue and profiles are static JSON; orders and
// seller choices (insurance, loan applications) persist in localStorage.
import products from '../data/products.json'
import { PROFILES, SELLER_LOCATIONS } from '../data/personas.js'

const KEY = 'meesho.db.v1'

function load() {
  try {
    return JSON.parse(localStorage.getItem(KEY)) ?? {}
  } catch {
    return {}
  }
}

const state = { orders: [], insurance: {}, loans: {}, ...load() }

function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state))
  } catch {
    /* demo still works in memory */
  }
}

export const db = {
  products,
  profiles: PROFILES,
  sellerLocations: SELLER_LOCATIONS,
  profile: (id) => PROFILES.find((p) => p.id === id),
  product: (id) => products.find((p) => p.id === id),

  orders: (personaId) => state.orders.filter((o) => !personaId || o.personaId === personaId),
  order: (id) => state.orders.find((o) => o.id === id),
  addOrder(order) {
    state.orders.unshift(order)
    save()
    return order
  },

  returnOrder(id, reason) {
    const o = state.orders.find((x) => x.id === id)
    if (!o || o.returned) return o
    o.returned = { at: Date.now(), reason }
    save()
    return o
  },

  insurance: (sellerId) => state.insurance[sellerId] ?? {},
  setInsurance(sellerId, plan, on) {
    state.insurance[sellerId] = { ...this.insurance(sellerId), [plan]: on }
    save()
    return state.insurance[sellerId]
  },

  loans: (sellerId) => state.loans[sellerId] ?? {},
  applyLoan(sellerId, loan) {
    state.loans[sellerId] = { ...this.loans(sellerId), [loan]: Date.now() }
    save()
    return state.loans[sellerId]
  },
}
