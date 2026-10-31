// Client-side behaviour tracker. One session per login; every page view, scroll,
// product/category view, search, cart change, purchase and return is recorded and
// written to the user's behaviour-history database.
import { userdb } from '../mocks/userdb.js'

const RESUME_MS = 30 * 60 * 1000 // reopening the tab within 30 min continues the session

let cur = null // { profileId, session }
let flushTimer = null

const pageKind = (path) => {
  if (path.startsWith('/product/')) return 'product'
  if (path.startsWith('/track/')) return 'tracking'
  if (path.startsWith('/?q=')) return 'search'
  if (path.startsWith('/?cat=')) return 'category'
  if (path === '/' || path === '') return 'home'
  return path.replace(/^\//, '').split(/[/?]/)[0] || 'home'
}

function persist() {
  if (cur) userdb.saveSession(cur.profileId, cur.session)
}
function scheduleFlush() {
  clearTimeout(flushTimer)
  flushTimer = setTimeout(persist, 1500)
}
const page = () => cur?.session.pages.at(-1)

function closePage(now = Date.now()) {
  const p = page()
  if (p && !p.leave) p.leave = now
}

export function startSession(profileId, { fresh = false } = {}) {
  if (cur?.profileId === profileId && !fresh) return cur.session
  if (cur) endSession('switch')
  const last = userdb.history(profileId).sessions.at(-1)
  const now = Date.now()
  if (!fresh && last && !last.ended && now - (last.lastActive ?? last.start) < RESUME_MS) {
    cur = { profileId, session: last }
  } else {
    if (last && !last.ended) userdb.saveSession(profileId, { ...last, ended: true, endReason: 'timeout' })
    cur = {
      profileId,
      session: { id: 'S' + now.toString(36), profileId, start: now, lastActive: now, firstPage: null, exitPage: null, pages: [], events: [], device: navigator.userAgent.includes('Mobile') ? 'mobile' : 'desktop' },
    }
  }
  persist()
  return cur.session
}

export function endSession(reason = 'logout') {
  if (!cur) return
  closePage()
  cur.session.ended = true
  cur.session.endReason = reason
  cur.session.lastActive = Date.now()
  persist()
  cur = null
}

let lastKey = null
let lastAt = 0

export function track(type, data = {}) {
  if (!cur) return
  const now = Date.now()
  // ignore exact repeats within 1.5 s (double renders, double clicks)
  const key = type + '|' + (data.productId ?? data.category ?? data.query ?? data.path ?? '') + '|' + (data.qty ?? '')
  if (key === lastKey && now - lastAt < 1500) return
  lastKey = key
  lastAt = now
  cur.session.events.push({ t: now, type, page: page()?.path ?? null, ...data })
  cur.session.lastActive = now
  scheduleFlush()
}

export function pageView(path) {
  if (!cur) return
  const now = Date.now()
  if (page()?.path === path) return
  closePage(now)
  const entry = { path, kind: pageKind(path), enter: now, leave: null, maxScroll: 0 }
  cur.session.pages.push(entry)
  // new page starts at the top; measure the first screenful once it has rendered
  window.scrollTo(0, 0)
  setTimeout(() => {
    entry.maxScroll = Math.max(entry.maxScroll, scrollDepth())
    scheduleFlush()
  }, 500)
  if (!cur.session.firstPage) cur.session.firstPage = path
  cur.session.exitPage = path
  track('page_view', { path, kind: pageKind(path) })
}

function scrollDepth() {
  const doc = document.documentElement
  const h = Math.max(doc.scrollHeight, 1)
  return Math.min(1, (window.scrollY + window.innerHeight) / h)
}

if (typeof window !== 'undefined') {
  let ticking = false
  window.addEventListener('scroll', () => {
    if (ticking || !cur) return
    ticking = true
    requestAnimationFrame(() => {
      const p = page()
      if (p) p.maxScroll = Math.max(p.maxScroll ?? 0, scrollDepth())
      cur.session.lastActive = Date.now()
      ticking = false
      scheduleFlush()
    })
  }, { passive: true })
  const flushNow = () => {
    if (!cur) return
    cur.session.lastActive = Date.now()
    persist()
  }
  window.addEventListener('pagehide', flushNow)
  document.addEventListener('visibilitychange', () => document.visibilityState === 'hidden' && flushNow())
}

export const currentSessionId = () => cur?.session.id ?? null
