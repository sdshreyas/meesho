// User data API: behaviour history, preferences (with versions) and the
// sign-in personalisation step that asks Gemini to update preferences.
import { http, HttpResponse, delay } from 'msw'
import { db } from './db.js'
import { userdb } from './userdb.js'
import { computeBehaviour } from '../tracking/analytics.js'
import { buildPrompt, callGemini, describeChanges, rulesUpdate, sanitize } from '../personalise/personalise.js'

export const userHandlers = [
  // Sign-in personalisation: history → Gemini (or rules) → new preference version
  http.post('*/api/users/:id/personalise', async ({ params, request }) => {
    const { apiKey } = await request.json().catch(() => ({}))
    const profile = db.profile(params.id)
    if (!profile || profile.type !== 'buyer') return HttpResponse.json({ error: 'not a buyer' }, { status: 400 })
    const started = Date.now()
    const behaviour = computeBehaviour(userdb.history(profile.id), db.orders())
    const prev = userdb.prefs(profile.id)
    const prompt = buildPrompt(profile, behaviour, prev)
    let next
    let meta
    let error = null
    let raw = null
    if (apiKey) {
      try {
        const r = await callGemini(apiKey, prompt)
        raw = r.raw
        next = sanitize(r.data, prev)
        meta = { source: 'gemini', model: r.model, tokens: r.usage?.totalTokenCount ?? null }
      } catch (e) {
        error = e.message
      }
    }
    if (!next) {
      await delay(600)
      next = rulesUpdate(prev, behaviour, profile)
      meta = { source: 'rules', model: null, fallbackReason: apiKey ? error : 'No Gemini API key' }
    }
    const store = userdb.savePrefs(profile.id, next, meta)
    const run = {
      at: new Date().toISOString(), ms: Date.now() - started, ...meta, error,
      sessions: behaviour.sessions, prompt, raw, changes: describeChanges(prev, store.current),
    }
    userdb.logRun(profile.id, run)
    return HttpResponse.json({ ...run, prompt: undefined, preferences: store.current, version: store.current.version })
  }),

  http.get('*/api/users/:id/preferences', async ({ params }) => {
    await delay(60)
    const current = userdb.prefs(params.id)
    return HttpResponse.json({
      ...current,
      reengageProducts: current.reengage.map((pid) => db.product(pid)).filter(Boolean),
    })
  }),

  // Everything we hold on a user (for the My Data page and the Excel export)
  http.get('*/api/users/:id/data', async ({ params }) => {
    await delay(80)
    const profile = db.profile(params.id)
    if (!profile) return HttpResponse.json({ error: 'unknown user' }, { status: 404 })
    const history = userdb.history(params.id)
    const orders = db.orders(params.id)
    return HttpResponse.json({
      profile,
      behaviour: computeBehaviour(history, db.orders()),
      history,
      preferences: userdb.prefsStore(params.id),
      runs: userdb.runs(params.id),
      orders,
    })
  }),

  http.post('*/api/users/:id/reset', async ({ params }) => {
    userdb.clearHistory(params.id)
    userdb.resetPrefs(params.id)
    return HttpResponse.json({ ok: true })
  }),
]
