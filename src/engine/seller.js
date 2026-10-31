// Seller analytics: demand forecast & stock planner, return-rate risk,
// credit limit and insurance quotes — all derived from the fake order history.
import { FESTIVAL } from './config.js'

const RETURN_BENCHMARK = {
  'Women Fashion': 22, 'Men Fashion': 20, 'Bags & Footwear': 20, 'Jewellery & Accessories': 10,
  'Beauty & Health': 6, 'Home & Kitchen': 8, Electronics: 11, 'Sports & Fitness': 9,
}
const RETURN_FEE_PER_UNIT = 35
const RETURN_REASON = {
  Sarees: ['Colour different from photo', 'Upload real photos in daylight, no filters'],
  Lehengas: ['Size / fit mismatch', 'Add a measured size chart with model height'],
  'Western Wear': ['Size / fit mismatch', 'Add a measured size chart with model height'],
  'T-shirts': ['Size / fit mismatch', 'Show chest & length in cm for each size'],
  Jackets: ['Size / fit mismatch', 'Show chest & length in cm for each size'],
  Dresses: ['Size / fit mismatch', 'Add a measured size chart with model height'],
  'Tops & Kurtis': ['Size / fit mismatch', 'Add a measured size chart with model height'],
  Shirts: ['Size / fit mismatch', 'Show chest & length in cm for each size'],
  'Women Footwear': ['Size mismatch', 'Add a foot-length (cm) size guide'],
  'Men Footwear': ['Size mismatch', 'Add a foot-length (cm) size guide'],
  Watches: ['Looks different from photo', 'Upload real photos in daylight, no filters'],
  Sunglasses: ['Looks different from photo', 'Upload real photos in daylight, no filters'],
  Jewellery: ['Colour different from photo', 'Upload real photos in daylight, no filters'],
  Handbags: ['Quality not as expected', 'Mention material and add a close-up photo'],
  Kitchen: ['Damaged in transit', 'Use bubble wrap and a 3-ply box'],
  'Home Decor': ['Damaged in transit', 'Use bubble wrap and a 3-ply box'],
  'Mobile Accessories': ['Not working / defective', 'Test every unit before packing'],
}
const DEFAULT_REASON = ['Quality not as expected', 'Check every unit before packing']

const sum = (a) => a.reduce((s, x) => s + x, 0)
const mean = (a) => sum(a) / a.length

export function daysToFestival(now = new Date('2026-10-27')) {
  return Math.max(0, Math.ceil((new Date(FESTIVAL.date) - now) / 86400000))
}

export function skuPlan(p) {
  const w = p.weeklySales
  const recent = w.slice(-4)
  const weighted = (recent[0] * 1 + recent[1] * 2 + recent[2] * 3 + recent[3] * 4) / 10
  const trend = (mean(recent) - mean(w.slice(0, 4))) / Math.max(1, mean(w.slice(0, 4)))
  const uplift = p.tags.includes('festive') ? FESTIVAL.uplift : 1
  const weeklyForecast = weighted * (1 + trend * 0.5) * uplift
  const forecast2w = Math.round(weeklyForecast * 2)
  const sd = Math.sqrt(mean(w.map((x) => (x - mean(w)) ** 2)))
  const leadWeeks = 1
  const safety = Math.round(1.65 * sd * Math.sqrt(leadWeeks + 2))
  const needed = Math.round(weeklyForecast * (2 + leadWeeks)) + safety
  const reorder = Math.max(0, needed - p.stock)
  const daysCover = Math.round(p.stock / (weeklyForecast / 7))
  const status = daysCover < 14 ? 's_reorder' : daysCover > 60 ? 's_overstock' : 's_healthy'

  const benchmark = RETURN_BENCHMARK[p.category] ?? 10
  const risk = p.returnRate > benchmark + 4 ? 'high' : p.returnRate > benchmark ? 'watch' : 'ok'
  const projectedReturns = Math.round(forecast2w * (p.returnRate / 100))
  const [reason, tip] = RETURN_REASON[p.subcategory] ?? DEFAULT_REASON
  const qualityScore = Math.round(Math.max(0, Math.min(100, 100 - p.returnRate * 1.4 - (4.6 - p.rating) * 12)))

  return {
    id: p.id, name: p.name, image: p.image, price: p.price, stock: p.stock, category: p.category,
    weeklySales: w, forecast2w, weeklyForecast: Math.round(weeklyForecast), trend, festive: uplift > 1,
    reorder, daysCover, status,
    returnRate: p.returnRate, benchmark, risk, projectedReturns,
    projectedFee: risk === 'high' ? projectedReturns * RETURN_FEE_PER_UNIT : 0,
    reason, tip, qualityScore,
  }
}

export function sellerDashboard(seller, products) {
  const own = products.filter((p) => p.sellerId === seller.id)
  const skus = own.map(skuPlan)
  const last4Units = own.map((p) => sum(p.weeklySales.slice(-4)))
  const gmv30 = Math.round(sum(own.map((p, i) => p.price * last4Units[i])))
  const orders30 = sum(last4Units)
  const avgReturn = Math.round((sum(own.map((p, i) => p.returnRate * last4Units[i])) / orders30) * 10) / 10
  const qualityScore = Math.round(mean(skus.map((s) => s.qualityScore)))

  const weekly = Array.from({ length: 8 }, (_, w) => ({
    week: `W${w + 1}`,
    actual: Math.round(sum(own.map((p) => p.price * p.weeklySales[w]))),
  }))
  const fw = Math.round(sum(skus.map((s, i) => s.weeklyForecast * own[i].price)))
  weekly.push({ week: 'W9', forecast: fw }, { week: 'W10', forecast: Math.round(fw * 1.06) })
  weekly[7].forecast = weekly[7].actual

  // credit: monthly GMV x risk multipliers
  const tenureF = seller.tenureMonths >= 12 ? 1 : 0.7
  const returnF = Math.max(0.5, 1 - Math.max(0, avgReturn - 10) / 50)
  const ratingF = seller.sellerRating / 4.5
  const limit = Math.round((gmv30 * 1.0 * seller.onTimeDispatch * returnF * tenureF * ratingF) / 1000) * 1000
  const restockCost = Math.round(sum(skus.map((s) => s.reorder * s.price * 0.6)) / 100) * 100
  const rate = seller.tenureMonths >= 12 && avgReturn < 15 ? 16 : 19

  const stockValue = Math.round(sum(own.map((p) => p.stock * p.price * 0.6)))
  return {
    seller,
    kpis: { gmv30, orders30, avgReturn, qualityScore, creditLimit: limit },
    weekly,
    daysToFestival: daysToFestival(),
    festivalUplift: Math.round((FESTIVAL.uplift - 1) * 100),
    skus,
    returnAlerts: skus.filter((s) => s.risk !== 'ok').sort((a, b) => b.returnRate - a.returnRate),
    feeThresholdFee: RETURN_FEE_PER_UNIT,
    credit: {
      limit,
      rate,
      restockCost: Math.min(restockCost, limit),
      factors: [
        { key: 'f_gmv', vars: { amount: gmv30.toLocaleString('en-IN') }, good: true },
        { key: 'f_dispatch', vars: { pct: Math.round(seller.onTimeDispatch * 100) }, good: seller.onTimeDispatch >= 0.9 },
        { key: 'f_returns', vars: { pct: avgReturn }, good: avgReturn < 15 },
        { key: 'f_tenure', vars: { n: seller.tenureMonths }, good: seller.tenureMonths >= 12 },
        { key: 'f_rating', vars: { rating: seller.sellerRating }, good: seller.sellerRating >= 4 },
      ],
    },
    insurance: {
      stockValue,
      plans: [
        { id: 'ins_stock', unit: 'perYear', amount: Math.round(stockValue * 0.006) },
        { id: 'ins_transit', unit: 'perShipment', amount: 2 },
        { id: 'ins_return', unit: 'perYear', amount: Math.round(gmv30 * 12 * 0.004) },
      ],
    },
  }
}

const lakh = (n) => (n >= 100000 ? `₹${(n / 100000).toFixed(2)} lakh` : `₹${Math.round(n).toLocaleString('en-IN')}`)

/**
 * Plain-English script for the seller's audio briefing: performance first,
 * then the most valuable improvements, then finance offers. Translated and
 * spoken in the browser.
 */
export function audioSummary(d, enrolled = {}) {
  const k = d.kpis
  const first = d.seller.owner.split(' ')[0]
  const prev = sum(d.weekly.slice(0, 4).map((w) => w.actual ?? 0))
  const curr = sum(d.weekly.slice(4, 8).map((w) => w.actual ?? 0))
  const growth = Math.round(((curr - prev) / Math.max(1, prev)) * 100)
  const best = [...d.skus].sort((a, b) => sum(b.weeklySales.slice(-4)) * b.price - sum(a.weeklySales.slice(-4)) * a.price)[0]
  const low = d.skus.filter((s) => s.status === 's_reorder').sort((a, b) => a.daysCover - b.daysCover)
  const worst = d.returnAlerts[0]
  const lines = [
    `Namaste ${first}. Here is your business summary for ${d.seller.name}.`,
    `In the last 30 days you received ${k.orders30.toLocaleString('en-IN')} orders worth ${lakh(k.gmv30)}.`,
    growth >= 0
      ? `Your sales grew ${growth} percent compared with the previous month.`
      : `Your sales fell ${Math.abs(growth)} percent compared with the previous month.`,
    `Your best selling product is ${best.name}.`,
    `${FESTIVAL.name} is in ${d.daysToFestival} days, so festive products may sell ${d.festivalUplift} percent more.`,
  ]
  if (low.length) {
    lines.push(`${low.length} products will run out within two weeks. Add stock first for ${low.slice(0, 2).map((s) => s.name).join(' and ')}.`)
  }
  if (worst) {
    lines.push(`Your average return rate is ${k.avgReturn} percent. ${worst.name} has the highest returns at ${worst.returnRate} percent, mostly because of ${worst.reason.toLowerCase()}.`)
    lines.push(`To fix this, ${worst.tip.charAt(0).toLowerCase() + worst.tip.slice(1)}.${worst.projectedFee ? ` This can save you a return fee of ${lakh(worst.projectedFee)}.` : ''}`)
  }
  lines.push(`You are pre-approved for a working capital loan of ${lakh(d.credit.limit)} at ${d.credit.rate} percent interest, and ${lakh(d.credit.restockCost)} to fund your ${FESTIVAL.name} stock.`)
  lines.push(
    enrolled.ins_stock
      ? 'Your stock is insured with Stock Shield.'
      : `You can insure your stock worth ${lakh(d.insurance.stockValue)} for just ${lakh(d.insurance.plans[0].amount)} a year.`,
  )
  lines.push(`Your quality score is ${k.qualityScore} out of 100. Keep it above 80 to rank higher in buyer feeds.`)
  return lines
}
