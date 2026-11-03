// Meesho FinHub API — partners, Trust Scores, DPDP consent & data sharing, loans,
// insurance policies, auto-claims and the FinSahayak advisor. Served in-browser by MSW.
import { http, HttpResponse, delay } from 'msw'
import { db } from './db.js'
import { DATA_FIELDS, DPDP, INSURANCE_PRODUCTS, LOAN_PRODUCTS, PARTNERS, partnerById } from '../finance/data.js'
import { band, finUsers, kfs, limitFor, offersFor } from '../finance/engine.js'
import { askAdvisor } from '../finance/advisor.js'

const KEY = 'meesho.finance.v1'
const load = () => {
  try {
    return JSON.parse(localStorage.getItem(KEY)) ?? {}
  } catch {
    return {}
  }
}
const st = { consents: [], loans: [], policies: {}, claims: [], ...load() }
const save = () => {
  try {
    localStorage.setItem(KEY, JSON.stringify(st))
  } catch {
    /* in memory */
  }
}
const DAY = 86400000

// live behaviour from the order database feeds buyer scores
function live() {
  const out = {}
  for (const o of db.orders()) {
    const x = (out[o.personaId] ??= { orders: 0 })
    x.orders += 1
  }
  return out
}
const users = () => finUsers(live())
const userById = (id) => users().find((u) => u.id === id)

const activeConsent = (userId, partnerId, productKey) =>
  st.consents.find((c) => c.userId === userId && c.partnerId === partnerId && c.productKey === productKey && !c.withdrawnAt && c.expiresAt > Date.now())

function loanView(l) {
  const coolingLeft = l.coolingOffUntil - Date.now()
  return { ...l, status: l.cancelledAt ? 'cancelled' : coolingLeft > 0 ? 'cooling-off' : 'active', coolingHoursLeft: Math.max(0, Math.round(coolingLeft / 3600000)) }
}

function policiesFor(user) {
  const mine = st.policies[user.id] ?? {}
  return user.insurance.map((key) => {
    const p = INSURANCE_PRODUCTS[key]
    const on = p.default ? mine[key]?.on !== false : !!mine[key]?.on
    return { key, ...p, insurerName: partnerById[p.insurer].name, on, since: mine[key]?.at ?? null }
  })
}

const userCard = (u) => ({
  ...u, band: band(u.score),
  limits: Object.fromEntries(u.products.map((p) => [p, limitFor(u, p)])),
  loans: st.loans.filter((l) => l.userId === u.id).map(loanView),
  consents: st.consents.filter((c) => c.userId === u.id),
  policies: policiesFor(u),
})

export const financeHandlers = [
  http.get('*/api/finance/overview', async () => {
    await delay(120)
    const all = users().map(userCard)
    const loans = st.loans.map(loanView)
    const live = loans.filter((l) => l.status !== 'cancelled')
    return HttpResponse.json({
      partners: PARTNERS,
      users: all,
      loans,
      claims: st.claims,
      consents: st.consents,
      products: LOAN_PRODUCTS,
      insurance: INSURANCE_PRODUCTS,
      dpdp: DPDP,
      stats: {
        disbursed: live.reduce((s, l) => s + l.principal, 0),
        loans: live.length,
        meeshoFees: live.reduce((s, l) => s + l.meeshoFee, 0),
        activeConsents: st.consents.filter((c) => !c.withdrawnAt && c.expiresAt > Date.now()).length,
        policies: all.reduce((s, u) => s + u.policies.filter((p) => p.on).length, 0),
        claimsPaid: st.claims.reduce((s, c) => s + c.amount, 0),
      },
    })
  }),

  http.get('*/api/finance/users/:id', async ({ params }) => {
    await delay(80)
    const u = userById(params.id)
    if (!u) return HttpResponse.json({ error: 'unknown' }, { status: 404 })
    return HttpResponse.json({ ...userCard(u), fields: Object.fromEntries(u.products.map((p) => [p, DATA_FIELDS[p]])), dpdp: DPDP })
  }),

  // Offers from every eligible lender (shown even before consent — no personal data leaves Meesho for this)
  http.post('*/api/finance/offers', async ({ request }) => {
    await delay(150)
    const { userId, productKey, amount, tenure } = await request.json()
    const u = userById(userId)
    if (!u) return HttpResponse.json({ error: 'unknown' }, { status: 404 })
    const offers = offersFor(u, productKey, amount, tenure).map((o) => ({ ...o, consent: !!activeConsent(u.id, o.partner.id, productKey), kfs: kfs(u, productKey, o) }))
    return HttpResponse.json({ user: { id: u.id, name: u.name, score: u.score, band: band(u.score) }, limit: limitFor(u, productKey), offers })
  }),

  // DPDP: record one consent artefact per partner (granular, purpose-bound, time-bound)
  http.post('*/api/finance/consent', async ({ request }) => {
    await delay(150)
    const { userId, productKey, partnerIds = [], fields = [], language = 'en', adult } = await request.json()
    if (!adult) return HttpResponse.json({ error: 'Borrower must confirm they are 18 or older' }, { status: 400 })
    const allowed = new Set((DATA_FIELDS[productKey] ?? []).map(([k]) => k))
    const now = Date.now()
    const made = partnerIds.filter((id) => partnerById[id]).map((partnerId) => {
      const c = {
        id: 'CNS-' + now.toString(36).toUpperCase() + '-' + partnerId.toUpperCase().slice(0, 4),
        userId, partnerId, partnerName: partnerById[partnerId].name, productKey,
        purpose: `Credit underwriting for ${LOAN_PRODUCTS[productKey].label}`,
        fields: fields.filter((f) => allowed.has(f)),
        language, givenAt: now, expiresAt: now + DPDP.consentValidityDays * DAY, retentionDays: DPDP.retentionDays,
        withdrawnAt: null,
      }
      st.consents.push(c)
      return c
    })
    save()
    return HttpResponse.json({ consents: made })
  }),

  http.post('*/api/finance/consent/:id/withdraw', async ({ params }) => {
    const c = st.consents.find((x) => x.id === params.id)
    if (!c) return HttpResponse.json({ error: 'unknown consent' }, { status: 404 })
    c.withdrawnAt = Date.now()
    save()
    return HttpResponse.json(c)
  }),

  // Disburse (only with an active consent for that lender) — straight from lender to borrower
  http.post('*/api/finance/loans', async ({ request }) => {
    await delay(400)
    const { userId, productKey, partnerId, amount, tenure, adBoost = false } = await request.json()
    const u = userById(userId)
    const consent = activeConsent(userId, partnerId, productKey)
    if (!u) return HttpResponse.json({ error: 'unknown' }, { status: 404 })
    if (!consent) return HttpResponse.json({ error: 'No active DPDP consent for this lender' }, { status: 403 })
    const offer = offersFor(u, productKey, amount, tenure).find((o) => o.partner.id === partnerId)
    if (!offer) return HttpResponse.json({ error: 'Offer not available' }, { status: 400 })
    const now = Date.now()
    const loan = {
      id: 'LN' + now.toString().slice(-8), userId, userName: u.name, productKey, product: LOAN_PRODUCTS[productKey].label,
      partnerId, partnerName: offer.partner.name, principal: offer.principal, rate: offer.rate, apr: offer.apr, tenure, emi: offer.emi,
      net: offer.net, meeshoFee: offer.meeshoFee, consentId: consent.id, disbursedAt: now, coolingOffUntil: now + 3 * DAY,
      adBoost: adBoost ? { toAdWallet: Math.round(offer.principal * 0.2), bonus: 1500 } : null,
      utr: 'UTR' + Math.floor(now / 7).toString().slice(-10),
    }
    st.loans.unshift(loan)
    save()
    return HttpResponse.json(loanView(loan), { status: 201 })
  }),

  http.post('*/api/finance/loans/:id/cancel', async ({ params }) => {
    const l = st.loans.find((x) => x.id === params.id)
    if (!l) return HttpResponse.json({ error: 'unknown loan' }, { status: 404 })
    if (Date.now() > l.coolingOffUntil) return HttpResponse.json({ error: 'Cooling-off period is over' }, { status: 400 })
    l.cancelledAt = Date.now()
    save()
    return HttpResponse.json(loanView(l))
  }),

  // Insurance: opt-in only (never pre-ticked); crew covers are on by default (paid by Valmo)
  http.post('*/api/finance/policies', async ({ request }) => {
    await delay(150)
    const { userId, key, on } = await request.json()
    ;(st.policies[userId] ??= {})[key] = { on: !!on, at: Date.now(), policyNo: on ? 'POL' + Date.now().toString().slice(-9) : null }
    save()
    return HttpResponse.json(st.policies[userId][key])
  }),

  // Zero-paperwork claim from a Valmo hub damage scan
  http.post('*/api/finance/claims', async ({ request }) => {
    await delay(500)
    const { userId, orderId, item, value, hub } = await request.json()
    const claim = { id: 'CLM' + Date.now().toString().slice(-8), userId, orderId, item, amount: Math.min(1000, value), hub, insurer: 'Acko General Insurance', at: Date.now(), trigger: `Damage flagged by barcode scan at ${hub}`, documents: 0 }
    st.claims.unshift(claim)
    save()
    return HttpResponse.json(claim, { status: 201 })
  }),

  // FinSahayak advisor (Gemini with the saved key, or built-in answers)
  http.post('*/api/finance/advisor', async ({ request }) => {
    const { userId, question, history = [], apiKey, language = 'en' } = await request.json()
    const u = userById(userId)
    if (!u) return HttpResponse.json({ error: 'unknown' }, { status: 404 })
    const offers = u.products.flatMap((p) => offersFor(u, p, limitFor(u, p) || LOAN_PRODUCTS[p].min, LOAN_PRODUCTS[p].tenures[1] ?? LOAN_PRODUCTS[p].tenures[0]).slice(0, 3).map((o) => ({ product: LOAN_PRODUCTS[p].label, lender: o.partner.name, amount: o.principal, rate: o.rate, apr: o.apr, emi: o.emi, tenure: o.tenure })))
    const answer = await askAdvisor({ user: userCard(u), offers, question, history, apiKey, language })
    return HttpResponse.json(answer)
  }),
]
