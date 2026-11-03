// Meesho Trust Score (300–900) + risk-based loan offers + RBI Key Fact Statement.
// Every factor records where its data comes from in the Meesho / Valmo chain, so the
// score is explainable to the user, the partner lender and the regulator.
import { BUYERS, SELLERS } from '../data/personas.js'
import products from '../data/products.json'
import { sellerDashboard } from '../engine/seller.js'
import { CREW, LOAN_PRODUCTS, PARTNERS, partnerById } from './data.js'

const clamp01 = (x) => Math.max(0, Math.min(1, x))
const mean = (a) => a.reduce((s, x) => s + x, 0) / a.length

export const band = (s) =>
  s >= 800 ? { label: 'Excellent', tone: 'green' } : s >= 750 ? { label: 'Very good', tone: 'green' } : s >= 700 ? { label: 'Good', tone: 'green' } : s >= 640 ? { label: 'Fair', tone: 'amber' } : s >= 580 ? { label: 'Building', tone: 'amber' } : { label: 'Thin file', tone: 'red' }

function finish(factors) {
  const raw = factors.reduce((s, f) => s + f.weight * f.value, 0)
  return { score: Math.round(300 + 600 * raw), factors: factors.map((f) => ({ ...f, points: Math.round(600 * f.weight * f.value), max: Math.round(600 * f.weight) })) }
}

// ---------------- sellers ----------------
function sellerScore(seller) {
  const d = sellerDashboard(seller, products)
  const weekly = d.weekly.filter((w) => w.actual != null).map((w) => w.actual)
  const cv = Math.sqrt(mean(weekly.map((x) => (x - mean(weekly)) ** 2))) / Math.max(1, mean(weekly))
  const first = mean(weekly.slice(0, 4))
  const last = mean(weekly.slice(-4))
  const growth = (last - first) / Math.max(1, first)
  const rto = seller.rtoRate ?? 0.07
  const roas = seller.adRoas ?? 3
  return {
    ...finish([
      {
        key: 'sales', label: 'Sales consistency & growth', weight: 0.35,
        value: clamp01(0.5 * (1 - cv * 2) + 0.3 * Math.min(1, seller.tenureMonths / 24) + 0.2 * clamp01(0.5 + growth)),
        display: `₹${Math.round(d.kpis.gmv30 / 1000)}k sales / month · ${growth >= 0 ? '+' : ''}${Math.round(growth * 100)}% trend · ${seller.tenureMonths} months on Meesho`,
        source: 'Meesho order ledger & weekly settlement payouts',
      },
      {
        key: 'dispatch', label: 'Valmo handover on time', weight: 0.25,
        value: clamp01((seller.onTimeDispatch - 0.8) / 0.19),
        display: `${Math.round(seller.onTimeDispatch * 100)}% of parcels handed to Valmo within 24 h`,
        source: 'Valmo Airhub pickup scans (Pilot handover time)',
      },
      {
        key: 'quality', label: 'Quality, returns & RTO', weight: 0.25,
        value: clamp01(1 - d.kpis.avgReturn / 30 - rto * 1.5),
        display: `${d.kpis.avgReturn}% customer returns · ${Math.round(rto * 100)}% RTO`,
        source: 'Returns desk + Valmo return-to-origin scans',
      },
      {
        key: 'ads', label: 'Meesho Ads return on spend', weight: 0.15,
        value: clamp01(roas / 6),
        display: `${roas}× return on ad spend`,
        source: 'Meesho Ads console (spend vs attributed orders)',
      },
    ]),
    monthlySales: d.kpis.gmv30,
  }
}

// ---------------- buyers & resellers ----------------
function buyerScore(b, live = {}) {
  const orders90 = b.ordersLast90d + (live.orders ?? 0)
  const returnRate = live.returnRate ?? b.returnRate
  const factors = [
    {
      key: 'cod', label: 'Cash-on-Delivery honesty', weight: 0.4,
      value: clamp01((b.codAcceptance - 0.75) / 0.24),
      display: `${Math.round(b.codAcceptance * 100)}% of COD parcels accepted & paid at the door`,
      source: 'Valmo Pilot doorstep app (COD collected vs refused)',
    },
    {
      key: 'repay', label: 'Repayment record', weight: 0.25,
      value: clamp01((b.onTimeRepayment - 0.8) / 0.19),
      display: `${Math.round(b.onTimeRepayment * 100)}% of past dues paid on time`,
      source: 'Partner lender repayment feed',
    },
    b.reseller
      ? {
          key: 'resale', label: 'Reseller sales consistency', weight: 0.2,
          value: clamp01(0.6 * Math.min(1, orders90 / 25) + 0.4 * clamp01((b.resellerConversion ?? 0.15) / 0.25)),
          display: `${orders90} orders in 90 days · ${Math.round((b.resellerConversion ?? 0.15) * 100)}% WhatsApp share → order conversion`,
          source: 'Reseller catalogue shares & orders',
        }
      : {
          key: 'frequency', label: 'Shopping frequency & tenure', weight: 0.2,
          value: clamp01(0.6 * Math.min(1, orders90 / 12) + 0.4 * Math.min(1, (b.monthsOnMeesho ?? 12) / 24)),
          display: `${orders90} orders in 90 days · ${b.monthsOnMeesho ?? 12} months on Meesho`,
          source: 'Meesho order history',
        },
    {
      key: 'returns', label: 'Returns behaviour', weight: 0.15,
      value: clamp01(1 - returnRate / 35),
      display: `${Math.round(returnRate)}% of orders returned`,
      source: 'Returns desk',
    },
  ]
  return finish(factors)
}

// ---------------- Valmo crew ----------------
function crewScore(c) {
  return finish([
    { key: 'success', label: 'Delivery success', weight: 0.35, value: clamp01((c.successRate - 0.85) / 0.13), display: `${Math.round(c.successRate * 100)}% first-attempt success · ${c.deliveries.toLocaleString('en-IN')} ${c.type === 'driver' ? 'trips' : 'parcels'}`, source: 'Valmo Pilot app delivery scans' },
    { key: 'attendance', label: 'Attendance', weight: 0.25, value: clamp01((c.attendance - 0.75) / 0.23), display: `${Math.round(c.attendance * 100)}% of rostered days worked`, source: 'Airhub roster check-ins' },
    { key: 'tenure', label: 'Tenure with Valmo', weight: 0.15, value: clamp01(c.tenureMonths / 30), display: `${c.tenureMonths} months`, source: 'Valmo onboarding records' },
    { key: 'rating', label: 'Customer rating', weight: 0.15, value: clamp01((c.rating - 3.8) / 1.1), display: `${c.rating} ★ average`, source: 'Post-delivery customer ratings' },
    { key: 'cash', label: 'COD cash deposited on time', weight: 0.1, value: clamp01((c.codDeposit - 0.85) / 0.15), display: `${Math.round(c.codDeposit * 100)}% deposited same day`, source: 'Airhub cash reconciliation' },
  ])
}

// ---------------- directory ----------------
/** Everyone FinHub can score: buyers, resellers, sellers, Valmo crew. live = per-user order stats */
export function finUsers(live = {}) {
  const buyers = BUYERS.map((b) => {
    const s = buyerScore(b, live[b.id])
    return { id: b.id, name: b.name, kind: b.reseller ? 'reseller' : 'buyer', role: b.reseller ? 'Reseller' : 'Buyer', segment: b.segment, city: b.city, ...s, monthlyIncome: b.monthlyIncome, products: b.reseller ? ['buyer_paylater', 'reseller_micro'] : ['buyer_paylater'], insurance: [] }
  })
  const sellers = SELLERS.map((s) => {
    const sc = sellerScore(s)
    return { id: s.id, name: s.name, owner: s.owner, kind: 'seller', role: 'Seller', segment: s.segment, city: s.city, ...sc, monthlyIncome: Math.round(sc.monthlySales * 0.18), products: ['seller_wc'], insurance: ['transit_shield', 'godown', 'hospicash'] }
  })
  const crew = CREW.map((c) => ({ id: c.id, name: c.name, kind: c.type, role: c.role, segment: c.role, city: c.city, node: c.node, ...crewScore(c), monthlyIncome: c.monthlyEarnings, products: c.products, insurance: c.insurance }))
  return [...buyers, ...sellers, ...crew]
}

// ---------------- limits, pricing & offers ----------------
const BASE_RATE = (s) => (s >= 800 ? 13 : s >= 750 ? 15 : s >= 700 ? 17 : s >= 650 ? 19.5 : s >= 600 ? 22 : 24)

export function limitFor(user, productKey) {
  const p = LOAN_PRODUCTS[productKey]
  const s = user.score
  let lim = 0
  if (productKey === 'seller_wc') lim = s >= 780 ? user.monthlySales * 2 : s >= 700 ? user.monthlySales * 1.5 : s >= 620 ? user.monthlySales : 0
  if (productKey === 'reseller_micro') lim = s >= 580 ? 2000 + (s - 580) * 60 : 0
  if (productKey === 'buyer_paylater') lim = s >= 750 ? 2500 : s >= 700 ? 2000 : s >= 650 ? 1500 : s >= 600 ? 1000 : s >= 550 ? 500 : 0
  if (productKey === 'crew_ev') lim = s >= 700 ? 110000 : s >= 640 ? 80000 : 0
  if (productKey === 'crew_advance') lim = s >= 580 ? user.monthlyIncome * 0.6 : 0
  if (productKey === 'captain_wc') lim = s >= 640 ? user.monthlyIncome * 2.5 : 0
  if (productKey === 'truck_topup') lim = s >= 640 ? user.monthlyIncome * 4 : 0
  return Math.round(Math.min(p.max, lim) / 500) * 500
}

export const emi = (P, annualPct, n) => {
  const r = annualPct / 1200
  return r ? (P * r * (1 + r) ** n) / ((1 + r) ** n - 1) : P / n
}

/** All eligible lender offers for this user/product/amount, cheapest first (RBI: show every eligible lender). */
export function offersFor(user, productKey, amount, tenure) {
  const product = LOAN_PRODUCTS[productKey]
  const limit = limitFor(user, productKey)
  return PARTNERS.filter((p) => p.products?.includes(productKey) && user.score >= p.minScore)
    .map((p) => {
      const max = Math.round(Math.min(product.max, limit * (p.type === 'bank' ? 0.95 : 1.1)) / 500) * 500
      const principal = Math.min(amount, max)
      if (productKey === 'buyer_paylater') {
        return { partner: p, principal, max, rate: 0, apr: 0, fee: 0, gst: 0, net: principal, tenure, instalments: 1, emi: principal, totalInterest: 0, totalRepay: principal, meeshoFee: principal * 0.0125, days: true }
      }
      const rate = Math.max(10.5, BASE_RATE(user.score) + p.spread)
      const fee = Math.round((principal * p.fee) / 100)
      const gst = Math.round(fee * 0.18)
      const m = emi(principal, rate, tenure)
      const totalInterest = Math.round(m * tenure - principal)
      // APR folds the processing fee into the yearly cost (RBI KFS "all-inclusive APR")
      const apr = rate + ((fee + gst) / principal) * (12 / tenure) * 100
      return {
        partner: p, principal, max, rate: +rate.toFixed(2), apr: +apr.toFixed(2), fee, gst, net: principal - fee - gst, tenure, instalments: tenure,
        emi: Math.round(m), totalInterest, totalRepay: principal + totalInterest + fee + gst,
        sweepPct: user.monthlySales ? +((m / user.monthlySales) * 100).toFixed(1) : null,
        meeshoFee: Math.round((principal * p.lspFee) / 100),
      }
    })
    .filter((o) => o.principal >= product.min)
    .sort((a, b) => a.apr - b.apr)
}

/** RBI Key Fact Statement for a chosen offer. */
export function kfs(user, productKey, offer) {
  const product = LOAN_PRODUCTS[productKey]
  const p = offer.partner
  return {
    lender: p.name, lenderType: p.rbi ?? p.type, lsp: 'Meesho FinTech (Lending Service Provider)',
    borrower: user.name, product: product.label,
    principal: offer.principal, processingFee: offer.fee, gst: offer.gst, netDisbursed: offer.net,
    rate: offer.rate, apr: offer.apr, tenure: offer.tenure, tenureUnit: product.days ? 'days' : 'months',
    instalments: offer.instalments, instalment: offer.emi, totalInterest: offer.totalInterest, totalRepayable: offer.totalRepay,
    repayment: product.repay,
    disbursal: `Directly from ${p.name} to the borrower's bank account — loan money never passes through Meesho`,
    coolingOff: '3 days — cancel without penalty by repaying principal + interest for the days used',
    penalCharges: product.days ? '₹30 late fee after the due date; no interest is ever charged if paid on time' : '2% per month on the overdue instalment only (no compounding)',
    recovery: 'No recovery agents for the first 60 days; reminders only by app/SMS. Agents, if used later, follow RBI Fair Practices Code.',
    grievance: [`${p.name} Grievance Officer — via the lender's website`, 'Meesho FinTech Nodal Officer — grievance.finhub@meesho.example'],
    meeshoFeeNote: `Meesho is paid ₹${offer.meeshoFee.toLocaleString('en-IN')} by ${p.short} as a service fee. You pay Meesho nothing.`,
  }
}

export { partnerById }
