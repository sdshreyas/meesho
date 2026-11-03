// FinSahayak — a plain-language finance advisor for sellers (and anyone FinHub scores).
// Uses Gemini with the key saved on the login page; without a key it answers the common
// questions from the user's own score, offers and policies.
import { pickModel } from '../personalise/personalise.js'
import { LANGUAGES } from '../data/languages.js'

const GEMINI = 'https://generativelanguage.googleapis.com/v1beta'
const inr = (n) => '₹' + Math.round(n).toLocaleString('en-IN')

function system(user, offers, language) {
  const lang = LANGUAGES.find((l) => l.code === language)?.name ?? 'English'
  return `You are FinSahayak, Meesho's friendly finance helper for small sellers, resellers and Valmo crew in India.
Answer in ${lang}, in short simple sentences a first-time borrower understands (max ~120 words, use ₹ and bullet points when useful).
Facts about this user (JSON): ${JSON.stringify({ name: user.name, role: user.role, city: user.city, trustScore: user.score, band: user.band.label, scoreFactors: user.factors.map((f) => ({ factor: f.label, points: `${f.points}/${f.max}`, detail: f.display, source: f.source })), limits: user.limits, offers, insurance: user.policies.map((p) => ({ name: p.label, price: `₹${p.price} ${p.unit}`, active: p.on })) })}
Rules: never promise approval; lenders decide. Explain APR, EMI, cooling-off (3 days) and the Key Fact Statement when relevant. Meesho never charges the borrower — the lender pays Meesho. Loan money goes from the lender straight to the user's bank account. Suggest borrowing only what sales can repay. Insurance is always optional (except crew cover that Valmo pays for). Do not ask for passwords, OTPs or full bank details.`
}

function fallback(user, offers, question) {
  const q = question.toLowerCase()
  const weakest = [...user.factors].sort((a, b) => a.points / a.max - b.points / b.max)[0]
  const best = offers[0]
  if (/score|kaise|why|improve|badh|increase/.test(q)) {
    return `Your Meesho Trust Score is **${user.score}/900 (${user.band.label})**.\n${user.factors.map((f) => `• ${f.label}: ${f.points}/${f.max} — ${f.display}`).join('\n')}\n\nBiggest gain: improve **${weakest.label.toLowerCase()}** (${weakest.display}). This is read from ${weakest.source.toLowerCase()}.`
  }
  if (/insur|bima|shield|cover|damage/.test(q)) {
    return `Insurance options for you:\n${user.policies.map((p) => `• **${p.label}** — ₹${p.price} ${p.unit}: ${p.cover}${p.on ? ' ✅ active' : ''}`).join('\n')}\n\nAll seller covers are optional and never pre-ticked. A ₹2 transit shield protects a parcel worth up to ₹1,000 — one lost parcel can wipe out the profit of 8–10 orders.`
  }
  if (/kfs|apr|cooling|cancel|charges|fee/.test(q)) {
    return 'Before you take any loan you see a **Key Fact Statement (KFS)**: the all-in yearly cost (APR), processing fee, every instalment, and the lender\'s grievance officer.\n• You get **3 days to cancel** without penalty — just repay the principal and the interest for those days.\n• Meesho never charges you; the lender pays Meesho a service fee.'
  }
  if (best) {
    return `Cheapest offer right now: **${best.lender}** — ${inr(best.amount)} at ${best.rate}% (APR ${best.apr}%), about **${inr(best.emi)}/${best.tenure > 1 ? 'month' : 'instalment'}** for ${best.tenure} ${best.tenure > 40 ? 'days' : 'months'}.\n${offers.slice(1).map((o) => `• ${o.lender}: ${o.rate}% → ${inr(o.emi)}/month`).join('\n')}\n\nTip: borrow only what your next 2–3 months of sales can repay. Repayment is auto-deducted from your weekly payouts, so there is no big EMI shock.`
  }
  return `Your Trust Score is ${user.score}/900. Ask me "how can I improve my score?", "which loan is cheapest?" or "is the ₹2 shield worth it?".`
}

export async function askAdvisor({ user, offers, question, history, apiKey, language }) {
  if (!apiKey) return { answer: fallback(user, offers, question), source: 'built-in' }
  try {
    const model = await pickModel(apiKey)
    const contents = [...history.slice(-6).map((m) => ({ role: m.role === 'user' ? 'user' : 'model', parts: [{ text: m.text }] })), { role: 'user', parts: [{ text: question }] }]
    const res = await fetch(`${GEMINI}/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ systemInstruction: { parts: [{ text: system(user, offers, language) }] }, contents, generationConfig: { temperature: 0.5, maxOutputTokens: 1024 } }),
    })
    const json = await res.json()
    if (!res.ok) throw new Error(json.error?.message ?? `Gemini ${res.status}`)
    const text = (json.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? '').join('').trim()
    return { answer: text || fallback(user, offers, question), source: `Gemini · ${model}` }
  } catch (e) {
    return { answer: fallback(user, offers, question), source: 'built-in', error: e.message }
  }
}
