// Cart pricing, AOV nudges and BNPL eligibility.
import {
  BNPL, BUNDLE_DISCOUNT_PCT, COD_FEE, COD_FREE_ABOVE, DELIVERY_FEE,
  FREE_DELIVERY_THRESHOLD, PACK_DISCOUNTS, TIER_DISCOUNTS,
} from './config.js'

const pct = (x, p) => Math.round((x * p) / 100)

/**
 * lines: [{ productId, qty, bundleId? }]
 * Returns the full price breakdown plus the nudges to show.
 */
export function quote(lines, products, persona, { nudges = true, payment = 'COD' } = {}) {
  const byId = Object.fromEntries(products.map((p) => [p.id, p]))
  const items = lines
    .map((l) => ({ ...l, product: byId[l.productId] }))
    .filter((l) => l.product)
    .map((l) => ({ ...l, lineTotal: l.product.price * l.qty }))

  const productTotal = items.reduce((s, l) => s + l.lineTotal, 0)
  let bundleDiscount = 0
  let packDiscount = 0
  let multiItemDiscount = 0
  let tierPct = 0

  if (nudges) {
    for (const l of items) {
      if (l.bundleId) {
        l.discount = pct(l.lineTotal, BUNDLE_DISCOUNT_PCT)
        bundleDiscount += l.discount
      } else {
        const pack = PACK_DISCOUNTS.find((d) => l.qty >= d.qty)
        if (pack) {
          l.discount = pct(l.lineTotal, pack.pct)
          l.packPct = pack.pct
          packDiscount += l.discount
        }
      }
    }
    const loose = items.filter((l) => !l.bundleId)
    const tier = TIER_DISCOUNTS.find((t) => items.length >= t.items)
    if (tier) {
      tierPct = tier.pct
      const base = loose.reduce((s, l) => s + l.lineTotal - (l.discount ?? 0), 0)
      multiItemDiscount = pct(base, tier.pct)
    }
  }

  const afterDiscounts = productTotal - bundleDiscount - packDiscount - multiItemDiscount
  const deliveryFee = items.length && afterDiscounts < FREE_DELIVERY_THRESHOLD ? DELIVERY_FEE : 0
  const codFee = payment === 'COD' && items.length && afterDiscounts < COD_FREE_ABOVE ? COD_FEE : 0
  const total = afterDiscounts + deliveryFee + codFee
  const savings = productTotal - afterDiscounts
  const mrpSavings = items.reduce((s, l) => s + (l.product.mrp - l.product.price) * l.qty, 0)

  const nudgeList = []
  if (nudges && items.length) {
    const gapDelivery = FREE_DELIVERY_THRESHOLD - afterDiscounts
    nudgeList.push(
      gapDelivery > 0
        ? { key: 'nudge_delivery', vars: { amount: gapDelivery }, progress: afterDiscounts / FREE_DELIVERY_THRESHOLD, gap: gapDelivery }
        : { key: 'nudge_delivery_done', done: true, progress: 1 },
    )
    if (payment === 'COD' && afterDiscounts < COD_FREE_ABOVE && gapDelivery <= 0) {
      nudgeList.push({ key: 'nudge_cod', vars: { amount: COD_FREE_ABOVE - afterDiscounts }, gap: COD_FREE_ABOVE - afterDiscounts })
    }
    const next = [...TIER_DISCOUNTS].reverse().find((t) => items.length < t.items)
    if (next && items.length === next.items - 1) nudgeList.push({ key: 'nudge_tier1', vars: { pct: next.pct } })
    else if (tierPct) nudgeList.push({ key: 'nudge_tier_done', vars: { pct: tierPct }, done: true })
    if (afterDiscounts >= BNPL.payLaterMin && afterDiscounts < BNPL.pay3Min) {
      nudgeList.push({ key: 'nudge_bnpl', vars: { amount: BNPL.pay3Min - afterDiscounts }, gap: BNPL.pay3Min - afterDiscounts })
    }
  }
  const gap = nudgeList.find((n) => n.gap > 0)?.gap ?? 0

  return {
    items: items.map((l) => ({ productId: l.productId, qty: l.qty, bundleId: l.bundleId, lineTotal: l.lineTotal, discount: l.discount ?? 0, packPct: l.packPct })),
    productTotal, bundleDiscount, packDiscount, multiItemDiscount, tierPct,
    deliveryFee, codFee, total, savings, mrpSavings,
    nudges: nudgeList,
    gap,
    bnpl: persona ? bnplOffer(total, persona) : null,
  }
}

/**
 * Partner-bank credit line built from platform behaviour (alternate data):
 * bureau score, repayment track record, order frequency and return behaviour.
 */
export function creditLimit(persona) {
  const base = Math.max(0, persona.creditScore - 550) * 14
  const repay = persona.onTimeRepayment
  const freq = persona.ordersLast90d * 90
  const returnPenalty = persona.returnRate * 25
  const raw = (base + freq - returnPenalty) * repay
  const limit = Math.max(0, Math.min(15000, Math.round(raw / 500) * 500))
  return {
    limit,
    factors: [
      { key: 'f_credit', vars: { score: persona.creditScore }, good: persona.creditScore >= 680 },
      { key: 'f_repay', vars: { pct: Math.round(repay * 100) }, good: repay >= 0.95 },
      { key: 'f_orders', vars: { n: persona.ordersLast90d }, good: persona.ordersLast90d >= 5 },
      { key: 'f_returns', vars: { pct: persona.returnRate }, good: persona.returnRate < 10 },
    ],
  }
}

export function bnplOffer(total, persona) {
  const { limit, factors } = creditLimit(persona)
  const withinLimit = total <= limit
  const emiMonthly = (() => {
    const r = BNPL.emiRate / 1200
    const n = BNPL.emiMonths
    return Math.ceil((total * r * (1 + r) ** n) / ((1 + r) ** n - 1))
  })()
  const plan = (id, min, vars) => ({
    id,
    vars,
    eligible: total >= min && withinLimit,
    reason: total < min ? { key: 'needMin', vars: { amount: min } } : !withinLimit ? { key: 'overLimit' } : null,
  })
  return {
    limit,
    factors,
    plans: [
      plan('plan_later', BNPL.payLaterMin, {}),
      plan('plan_pay3', BNPL.pay3Min, { amount: Math.ceil(total / 3) }),
      plan('plan_weekly', BNPL.weeklyMin, { amount: Math.ceil((total + BNPL.weeklyFee) / 4), fee: BNPL.weeklyFee }),
      plan('plan_emi', BNPL.emiMin, { amount: emiMonthly, rate: BNPL.emiRate }),
    ],
  }
}
