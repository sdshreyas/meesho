// Fake logistics world for the Valmo Control Tower: cities, Valmo distribution
// centres, external partners, ~150 sellers in real manufacturing clusters and
// 6 months of order history. Everything is generated deterministically.
import products from '../data/products.json'
import { SELLER_LOCATIONS } from '../data/personas.js'

// 1 simulated order = SCALE real orders. Money and volumes shown in the UI are
// multiplied by this so the network looks like real Meesho scale.
export const SCALE = 3000
export const HISTORY_END = '2026-10-29'
export const HISTORY_DAYS = 180
const BASE_DAILY = 150

// Seeded RNG so every browser sees the same history
export function rng(seed) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function km(a, b) {
  const R = 6371
  const dLat = ((b.lat - a.lat) * Math.PI) / 180
  const dLng = ((b.lng - a.lng) * Math.PI) / 180
  const s = Math.sin(dLat / 2) ** 2 + Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(s)) * 1.25 // x1.25 road factor
}

function pick(r, items, weight) {
  const total = items.reduce((s, x) => s + weight(x), 0)
  let t = r() * total
  for (const x of items) {
    t -= weight(x)
    if (t <= 0) return x
  }
  return items[items.length - 1]
}

// name, lat, lng, state, population (millions), tier, special zone (NE / J&K / hills)
const RAW_CITIES = [
  ['Delhi', 28.61, 77.21, 'DL', 32, 1], ['Mumbai', 19.08, 72.88, 'MH', 21, 1], ['Bengaluru', 12.97, 77.59, 'KA', 13, 1],
  ['Hyderabad', 17.39, 78.49, 'TG', 10.5, 1], ['Chennai', 13.08, 80.27, 'TN', 11.5, 1], ['Kolkata', 22.57, 88.36, 'WB', 15, 1],
  ['Pune', 18.52, 73.86, 'MH', 7, 1], ['Ahmedabad', 23.02, 72.57, 'GJ', 8.5, 1], ['Surat', 21.17, 72.83, 'GJ', 7, 2],
  ['Jaipur', 26.91, 75.79, 'RJ', 4, 2], ['Lucknow', 26.85, 80.95, 'UP', 3.9, 2], ['Kanpur', 26.45, 80.33, 'UP', 3.2, 2],
  ['Nagpur', 21.15, 79.09, 'MH', 3, 2], ['Indore', 22.72, 75.86, 'MP', 3.2, 2], ['Bhopal', 23.26, 77.41, 'MP', 2.4, 2],
  ['Patna', 25.59, 85.14, 'BR', 2.5, 2], ['Vadodara', 22.31, 73.18, 'GJ', 2.2, 2], ['Ludhiana', 30.9, 75.86, 'PB', 1.9, 2],
  ['Agra', 27.18, 78.01, 'UP', 1.9, 2], ['Nashik', 20.0, 73.79, 'MH', 2.1, 2], ['Varanasi', 25.32, 82.97, 'UP', 1.6, 2],
  ['Rajkot', 22.3, 70.8, 'GJ', 2, 2], ['Meerut', 28.98, 77.71, 'UP', 1.7, 2], ['Srinagar', 34.08, 74.8, 'JK', 1.6, 2, 1],
  ['Amritsar', 31.63, 74.87, 'PB', 1.4, 2], ['Prayagraj', 25.44, 81.85, 'UP', 1.5, 2], ['Ranchi', 23.34, 85.31, 'JH', 1.5, 2],
  ['Coimbatore', 11.02, 76.96, 'TN', 2.2, 2], ['Madurai', 9.93, 78.12, 'TN', 1.7, 2], ['Vijayawada', 16.51, 80.65, 'AP', 1.7, 2],
  ['Visakhapatnam', 17.69, 83.22, 'AP', 2.1, 2], ['Guwahati', 26.14, 91.74, 'AS', 1.1, 2, 1], ['Bhubaneswar', 20.3, 85.82, 'OD', 1.1, 2],
  ['Raipur', 21.25, 81.63, 'CG', 1.4, 2], ['Kochi', 9.93, 76.27, 'KL', 2.1, 2], ['Thiruvananthapuram', 8.52, 76.94, 'KL', 1.7, 2],
  ['Chandigarh', 30.73, 76.78, 'CH', 1.2, 2], ['Dehradun', 30.32, 78.03, 'UK', 0.8, 2], ['Jodhpur', 26.24, 73.02, 'RJ', 1.4, 2],
  ['Gwalior', 26.22, 78.18, 'MP', 1.2, 2], ['Mysuru', 12.3, 76.64, 'KA', 1.1, 2], ['Hubballi', 15.36, 75.12, 'KA', 1, 2],
  ['Mangaluru', 12.91, 74.86, 'KA', 0.7, 3], ['Tiruchirappalli', 10.79, 78.7, 'TN', 1, 2], ['Salem', 11.66, 78.15, 'TN', 0.9, 3],
  ['Aurangabad', 19.88, 75.34, 'MH', 1.3, 2], ['Solapur', 17.66, 75.91, 'MH', 1, 3], ['Kolhapur', 16.7, 74.24, 'MH', 0.6, 3],
  ['Jabalpur', 23.18, 79.99, 'MP', 1.3, 2], ['Gorakhpur', 26.76, 83.37, 'UP', 0.8, 3], ['Bareilly', 28.37, 79.43, 'UP', 1, 3],
  ['Aligarh', 27.88, 78.08, 'UP', 0.9, 3], ['Moradabad', 28.84, 78.77, 'UP', 0.9, 3], ['Siliguri', 26.73, 88.4, 'WB', 0.8, 3],
  ['Dhanbad', 23.8, 86.43, 'JH', 1.2, 3], ['Jamshedpur', 22.8, 86.2, 'JH', 1.3, 3], ['Gaya', 24.79, 85.0, 'BR', 0.5, 3],
  ['Muzaffarpur', 26.12, 85.39, 'BR', 0.5, 3], ['Cuttack', 20.46, 85.88, 'OD', 0.7, 3], ['Bikaner', 28.02, 73.31, 'RJ', 0.7, 3],
  ['Udaipur', 24.59, 73.71, 'RJ', 0.5, 3], ['Kota', 25.21, 75.86, 'RJ', 1, 3], ['Bhavnagar', 21.76, 72.15, 'GJ', 0.6, 3],
  ['Jamnagar', 22.47, 70.06, 'GJ', 0.6, 3], ['Warangal', 17.97, 79.59, 'TG', 0.8, 3], ['Guntur', 16.31, 80.44, 'AP', 0.7, 3],
  ['Nellore', 14.44, 79.99, 'AP', 0.6, 3], ['Tirupati', 13.63, 79.42, 'AP', 0.4, 3], ['Belagavi', 15.85, 74.5, 'KA', 0.6, 3],
  ['Jammu', 32.73, 74.86, 'JK', 0.7, 2, 1], ['Shimla', 31.1, 77.17, 'HP', 0.2, 3, 1], ['Imphal', 24.82, 93.94, 'MN', 0.3, 3, 1],
  ['Agartala', 23.83, 91.29, 'TR', 0.4, 3, 1], ['Shillong', 25.57, 91.88, 'ML', 0.35, 3, 1], ['Panaji', 15.49, 73.83, 'GA', 0.3, 3],
  ['Puducherry', 11.94, 79.81, 'PY', 0.3, 3], ['Jhansi', 25.45, 78.57, 'UP', 0.5, 3], ['Bilaspur', 22.08, 82.15, 'CG', 0.45, 3],
  ['Sambalpur', 21.47, 83.97, 'OD', 0.3, 3], ['Ajmer', 26.45, 74.64, 'RJ', 0.55, 3], ['Rohtak', 28.9, 76.61, 'HR', 0.4, 3],
  ['Panipat', 29.39, 76.97, 'HR', 0.45, 3], ['Tiruppur', 11.11, 77.34, 'TN', 0.9, 3], ['Erode', 11.34, 77.72, 'TN', 0.5, 3],
  ['Kozhikode', 11.26, 75.78, 'KL', 0.6, 3], ['Thrissur', 10.53, 76.21, 'KL', 0.3, 3], ['Darbhanga', 26.15, 85.9, 'BR', 0.3, 3],
  ['Bhagalpur', 25.24, 86.97, 'BR', 0.4, 3], ['Durgapur', 23.52, 87.31, 'WB', 0.6, 3], ['Ujjain', 23.18, 75.78, 'MP', 0.5, 3],
  ['Satna', 24.6, 80.83, 'MP', 0.3, 3], ['Karimnagar', 18.44, 79.13, 'TG', 0.3, 3], ['Kurnool', 15.83, 78.04, 'AP', 0.5, 3],
]

const METROS = ['Delhi', 'Mumbai', 'Bengaluru', 'Hyderabad', 'Chennai', 'Kolkata', 'Pune', 'Ahmedabad']
const TIER_BOOST = { 1: 0.7, 2: 1, 3: 1.35 } // Meesho skews to tier 2/3

export const CITIES = RAW_CITIES.map(([name, lat, lng, state, pop, tier, special]) => ({
  id: name, name, lat, lng, state, pop, tier, special: !!special, metro: METROS.includes(name),
  weight: pop ** 0.75 * TIER_BOOST[tier],
}))
export const cityById = Object.fromEntries(CITIES.map((c) => [c.id, c]))

// Valmo's current network. type: 'sort' = large sort centre, 'hub' = regional hub.
// Fleet is filled in from history (see defaultFleet in optimizer.js).
export const BASE_DCS = [
  ['Gurugram', 'sort', 28.46, 77.03], ['Bhiwandi', 'sort', 19.28, 73.05], ['Hoskote', 'sort', 13.07, 77.8],
  ['Kolkata', 'sort', 22.57, 88.36], ['Ahmedabad', 'sort', 23.02, 72.57], ['Hyderabad', 'sort', 17.39, 78.49],
  ['Chennai', 'sort', 13.08, 80.27], ['Nagpur', 'hub', 21.15, 79.09], ['Jaipur', 'hub', 26.91, 75.79],
  ['Lucknow', 'hub', 26.85, 80.95], ['Patna', 'hub', 25.59, 85.14], ['Indore', 'hub', 22.72, 75.86],
  ['Kochi', 'hub', 9.93, 76.27], ['Ludhiana', 'hub', 30.9, 75.86], ['Surat', 'hub', 21.17, 72.83],
  ['Guwahati', 'hub', 26.14, 91.74], ['Bhubaneswar', 'hub', 20.3, 85.82], ['Pune', 'hub', 18.52, 73.86],
].map(([name, type, lat, lng]) => ({ id: 'DC-' + name, name: `Valmo ${type === 'sort' ? 'Sort Centre' : 'Hub'}, ${name}`, city: name, type, lat, lng }))

// Service reach and fixed cost per DC type (fixed cost is per month at real scale)
export const DC_TYPES = {
  sort: { label: 'Sort centre', firstMileKm: 140, lastMileKm: 110, fixedMonthly: 4500000 },
  hub: { label: 'Regional hub', firstMileKm: 120, lastMileKm: 150, fixedMonthly: 1500000 },
}

// Generic external logistics partners (rate per shipment, real ₹)
export const PARTNERS = [
  { id: 'XP', name: 'Partner X · Express', rates: { local: 34, regional: 42, metro: 48, national: 58, special: 76 }, extra500: 22, codPct: 1.5, codMin: 18, etaBase: 1, kmPerDay: 900 },
  { id: 'YS', name: 'Partner Y · Surface', rates: { local: 30, regional: 37, metro: 43, national: 50, special: 68 }, extra500: 17, codPct: 1.5, codMin: 16, etaBase: 2, kmPerDay: 500 },
  { id: 'ZR', name: 'Partner Z · Regional', rates: { local: 27, regional: 33 }, extra500: 14, codPct: 1.2, codMin: 14, etaBase: 1, kmPerDay: 450 },
]

// Seller clusters: where small manufacturers actually sit
const CLUSTERS = [
  ['Surat', ['Women Fashion'], 18], ['Jaipur', ['Women Fashion', 'Jewellery & Accessories'], 14],
  ['Tiruppur', ['Men Fashion', 'Women Fashion'], 10], ['Ludhiana', ['Men Fashion', 'Sports & Fitness'], 8],
  ['Delhi', ['Jewellery & Accessories', 'Electronics', 'Beauty & Health'], 16], ['Mumbai', ['Beauty & Health', 'Women Fashion'], 10],
  ['Kolkata', ['Women Fashion', 'Bags & Footwear'], 8], ['Agra', ['Bags & Footwear'], 8], ['Kanpur', ['Bags & Footwear'], 5],
  ['Rajkot', ['Home & Kitchen'], 10], ['Moradabad', ['Home & Kitchen'], 6], ['Ahmedabad', ['Home & Kitchen', 'Women Fashion'], 8],
  ['Bengaluru', ['Electronics', 'Beauty & Health'], 6], ['Hyderabad', ['Home & Kitchen'], 6], ['Meerut', ['Sports & Fitness'], 6],
  ['Chennai', ['Electronics', 'Home & Kitchen'], 5], ['Panipat', ['Home & Kitchen'], 4],
]
const FIRST = ['Shree', 'Om', 'Laxmi', 'Ganesh', 'Krishna', 'Sai', 'Royal', 'New', 'Jai', 'Maa', 'Balaji', 'Ambika', 'Shiv', 'Sagar', 'Star', 'Galaxy']
const LAST = ['Creations', 'Traders', 'Enterprises', 'Fashions', 'Collections', 'Industries', 'Mart', 'Exports', 'Handicrafts', 'Bazaar']

function buildSellers() {
  const r = rng(7)
  const byCat = {}
  for (const p of products) (byCat[p.category] ??= []).push(p.id)
  const sellers = Object.entries(SELLER_LOCATIONS).map(([id, s]) => ({
    id, name: s.name, city: s.city, lat: s.lat, lng: s.lng, rating: 4.1, featured: true,
    products: products.filter((p) => p.sellerId === id).map((p) => p.id),
  }))
  let n = 1
  for (const [cityName, cats, count] of CLUSTERS) {
    const c = cityById[cityName]
    for (let i = 0; i < count; i++) {
      const pool = cats.flatMap((cat) => byCat[cat])
      const k = Math.min(pool.length, 4 + Math.floor(r() * 7))
      const chosen = new Set()
      while (chosen.size < k) chosen.add(pool[Math.floor(r() * pool.length)])
      sellers.push({
        id: 'G' + String(n++).padStart(3, '0'),
        name: `${FIRST[Math.floor(r() * FIRST.length)]} ${LAST[Math.floor(r() * LAST.length)]}`,
        city: cityName,
        lat: c.lat + (r() - 0.5) * 0.16,
        lng: c.lng + (r() - 0.5) * 0.16,
        rating: Math.round((3.6 + r() * 1.2) * 10) / 10,
        products: [...chosen],
      })
    }
  }
  return sellers
}
export const SELLERS = buildSellers()
export const sellersByProduct = (() => {
  const m = {}
  for (const s of SELLERS) for (const pid of s.products) (m[pid] ??= []).push(s)
  return m
})()

// Shipping weight (kg) by subcategory, with a few heavy appliances
const WEIGHT = {
  Dresses: 0.45, 'Tops & Kurtis': 0.35, Shirts: 0.35, Jewellery: 0.12, Watches: 0.25, Sunglasses: 0.2,
  Handbags: 0.7, 'Women Footwear': 0.9, 'Men Footwear': 1.1, Makeup: 0.15, Fragrances: 0.35, 'Skin Care': 0.4,
  Kitchen: 0.8, 'Home Decor': 1.2, 'Mobile Accessories': 0.3, Fitness: 1.0,
}
export function weightOf(p) {
  if (p.price > 2000) return 12
  if (p.price > 800) return 3.5
  return WEIGHT[p.subcategory] ?? 0.5
}

// Regional taste: each state likes some categories more than others
const CATS = [...new Set(products.map((p) => p.category))]
const stateTaste = (() => {
  const r = rng(11)
  const t = {}
  for (const c of CITIES) t[c.state] ??= Object.fromEntries(CATS.map((cat) => [cat, 0.6 + r() * 0.9]))
  return t
})()

function seasonal(date) {
  const m = date.getUTCMonth()
  const d = date.getUTCDate()
  let f = 1
  if (m === 9) f = 1.25 + (d / 31) * 0.25 // October build-up to Diwali
  if (m === 8 && d > 20) f = 1.12
  if (date.getUTCDay() === 0) f *= 0.85
  return f
}

function buildOrders() {
  const r = rng(42)
  const popularity = Object.fromEntries(products.map((p) => [p.id, p.weeklySales.reduce((s, x) => s + x, 0)]))
  const byCat = {}
  for (const p of products) (byCat[p.category] ??= []).push(p)
  const end = new Date(HISTORY_END + 'T00:00:00Z')
  const orders = []
  for (let d = HISTORY_DAYS - 1; d >= 0; d--) {
    const date = new Date(end.getTime() - d * 86400000)
    const day = date.toISOString().slice(0, 10)
    const growth = 1 + 0.25 * ((HISTORY_DAYS - d) / HISTORY_DAYS)
    const n = Math.round(BASE_DAILY * growth * seasonal(date) * (0.9 + r() * 0.2))
    for (let i = 0; i < n; i++) {
      const city = pick(r, CITIES, (c) => c.weight)
      const cat = pick(r, CATS, (k) => stateTaste[city.state][k])
      const product = pick(r, byCat[cat], (p) => popularity[p.id])
      const sellers = sellersByProduct[product.id]
      const seller = pick(r, sellers, (s) => s.rating / (1 + km(s, city) / 700))
      const qty = r() < 0.12 ? 2 : 1
      orders.push({
        id: `H${orders.length + 1}`,
        day,
        productId: product.id,
        category: cat,
        sellerId: seller.id,
        cityId: city.id,
        qty,
        weight: Math.round(weightOf(product) * qty * 100) / 100,
        value: product.price * qty,
        cod: r() < { 1: 0.45, 2: 0.6, 3: 0.75 }[city.tier],
      })
    }
  }
  return orders
}

let _orders
export const ORDERS = () => (_orders ??= buildOrders())
export const sellerById = Object.fromEntries(SELLERS.map((s) => [s.id, s]))
export const productById = Object.fromEntries(products.map((p) => [p.id, p]))
export { products }
