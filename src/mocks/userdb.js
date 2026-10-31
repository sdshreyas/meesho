// Per-user databases (kept in the browser by the mock backend):
//   history:<userId>      – every session with its events (behaviour history)
//   preferences:<userId>  – current preferences that drive the site + every past version
// Each user gets their own two stores, keyed by profile id.
import { PROFILES } from '../data/personas.js'

const HKEY = (id) => `meesho.userdb.history.v1.${id}`
const PKEY = (id) => `meesho.userdb.prefs.v1.${id}`
const MAX_SESSIONS = 150
const MAX_EVENTS = 800
const MAX_VERSIONS = 60

function read(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key)) ?? fallback
  } catch {
    return fallback
  }
}
function write(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
    return true
  } catch {
    return false // storage full — keep running in memory
  }
}

export const SECTIONS = ['reengage', 'recommended', 'edits', 'bundles', 'grid']

/** Starting preferences for a user = their persona profile. */
export function defaultPrefs(profile) {
  return {
    version: 1,
    updatedAt: new Date().toISOString(),
    source: 'default',
    model: null,
    categoryWeights: { ...(profile.affinity ?? {}) },
    subcategoryBoost: {},
    priceBand: profile.priceBand ?? [100, 800],
    preferredTags: profile.preferredTags ?? [],
    styles: profile.styles ?? [],
    discount: { pct: 0, categories: [], code: '', reason: '' },
    bundle: { discountPct: 12, focusSubcategories: [] },
    reengage: [],
    avoid: { subcategories: [], productIds: [] },
    nudges: { highlightBnpl: false, urgency: false },
    layout: { heroMessage: '', sectionOrder: SECTIONS },
    insights: [],
    rationale: 'Initial preferences from the user profile.',
  }
}

export const userdb = {
  // ---- behaviour history ----
  history(id) {
    return read(HKEY(id), { profileId: id, createdAt: new Date().toISOString(), sessions: [] })
  },
  saveSession(id, session) {
    const h = this.history(id)
    const s = { ...session, events: session.events.slice(-MAX_EVENTS) }
    const i = h.sessions.findIndex((x) => x.id === s.id)
    if (i >= 0) h.sessions[i] = s
    else h.sessions.push(s)
    h.sessions = h.sessions.slice(-MAX_SESSIONS)
    write(HKEY(id), h)
    return h
  },
  clearHistory(id) {
    localStorage.removeItem(HKEY(id))
  },

  // ---- preferences (current + versions) ----
  prefsStore(id) {
    const stored = read(PKEY(id), null)
    if (stored) return stored
    const profile = PROFILES.find((p) => p.id === id) ?? {}
    return { profileId: id, current: defaultPrefs(profile), versions: [] }
  },
  prefs(id) {
    return this.prefsStore(id).current
  },
  /** Save new preferences; the previous ones move into the version history. */
  savePrefs(id, next, meta = {}) {
    const store = this.prefsStore(id)
    const prev = store.current
    store.versions = [...store.versions, { ...prev, replacedAt: new Date().toISOString() }].slice(-MAX_VERSIONS)
    store.current = { ...next, version: (prev.version ?? 1) + 1, updatedAt: new Date().toISOString(), ...meta }
    write(PKEY(id), store)
    return store
  },
  resetPrefs(id) {
    localStorage.removeItem(PKEY(id))
  },

  // ---- LLM run log (prompt + raw reply) ----
  logRun(id, run) {
    const key = `meesho.userdb.llm.v1.${id}`
    const runs = read(key, [])
    write(key, [...runs, run].slice(-20))
  },
  runs(id) {
    return read(`meesho.userdb.llm.v1.${id}`, [])
  },
}
