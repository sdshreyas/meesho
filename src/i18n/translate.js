// Live translation through free public APIs, with a localStorage cache and a
// bundled offline fallback (public/i18n/<lang>.json) so a live demo never breaks.
//  1. Google Translate free endpoint (21 Indian languages, CORS-enabled)
//  2. MyMemory free API for languages Google does not cover (Kashmiri, Bodo)

const GOOGLE = 'https://clients5.google.com/translate_a/t?client=dict-chrome-ex&sl=en'
const MYMEMORY = 'https://api.mymemory.translated.net/get'
const CACHE_PREFIX = 'meesho.tr.v1.'

// "{amount}" -> "<b>0</b>": the API keeps <b> tags (and reorders them per grammar)
export const protect = (text) => {
  let i = 0
  return text.replace(/\{\w+\}/g, () => `<b>${i++}</b>`)
}

const decode = (s) =>
  s.replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/​/g, '')

function chunk(texts, maxLen = 1800) {
  const out = []
  let cur = []
  let len = 0
  for (const t of texts) {
    const l = encodeURIComponent(t).length + 3
    if (cur.length && len + l > maxLen) {
      out.push(cur)
      cur = []
      len = 0
    }
    cur.push(t)
    len += l
  }
  if (cur.length) out.push(cur)
  return out
}

export async function google(texts, lang) {
  const result = {}
  await Promise.all(
    chunk(texts).map(async (batch) => {
      const qs = batch.map((t) => 'q=' + encodeURIComponent(protect(t))).join('&')
      const res = await fetch(`${GOOGLE}&tl=${lang}&${qs}`)
      if (!res.ok) throw new Error('translate ' + res.status)
      const arr = await res.json()
      batch.forEach((t, i) => {
        const v = Array.isArray(arr[i]) ? arr[i][0] : arr[i]
        if (typeof v === 'string') result[t] = decode(v)
      })
    }),
  )
  return result
}

async function myMemory(texts, lang) {
  const result = {}
  // sequential + small: the anonymous quota is limited
  for (const t of texts) {
    const res = await fetch(`${MYMEMORY}?q=${encodeURIComponent(protect(t))}&langpair=en|${lang}`)
    const json = await res.json()
    const v = json?.responseData?.translatedText
    if (v && json.responseStatus === 200 && !/MYMEMORY WARNING/.test(v)) result[t] = decode(v)
  }
  return result
}

function readCache(lang) {
  try {
    return JSON.parse(localStorage.getItem(CACHE_PREFIX + lang)) ?? {}
  } catch {
    return {}
  }
}

function writeCache(lang, map) {
  try {
    localStorage.setItem(CACHE_PREFIX + lang, JSON.stringify(map))
  } catch {
    /* storage full or blocked — fine, we just re-fetch next time */
  }
}

async function bundled(lang) {
  try {
    const res = await fetch(`${import.meta.env.BASE_URL}i18n/${lang}.json`)
    return res.ok ? await res.json() : {}
  } catch {
    return {}
  }
}

/**
 * Returns { map, source } where map is english -> translated (protected form).
 * source is 'cache' | 'api' | 'offline' | 'partial'.
 */
export async function translateAll(texts, lang, { limited = false } = {}) {
  const cached = readCache(lang)
  const missing = texts.filter((t) => !(t in cached))
  if (!missing.length) return { map: cached, source: 'cache' }
  let fresh = {}
  let source = 'api'
  try {
    fresh = limited ? await myMemory(missing.slice(0, 60), lang) : await google(missing, lang)
  } catch {
    source = 'offline'
  }
  const stillMissing = missing.filter((t) => !(t in fresh))
  if (stillMissing.length) {
    const offline = await bundled(lang)
    for (const t of stillMissing) if (offline[t]) fresh[t] = offline[t]
    if (source === 'api' && Object.keys(fresh).length < missing.length) source = 'partial'
  }
  const map = { ...cached, ...fresh }
  writeCache(lang, map)
  return { map, source }
}

// Fill a translated template: "<b>0</b>" slots map to the {names} of the English source.
export function fill(english, translated, vars = {}) {
  const names = [...english.matchAll(/\{(\w+)\}/g)].map((m) => m[1])
  if (translated) {
    // the API sometimes drops the space next to a slot ("नमस्ते<b>0</b>") — put it back
    const letter = /[\p{L}\p{M}]/u
    return translated.replace(/<\s*b\s*>\s*(\d+)\s*<\s*\/\s*b\s*>/gi, (m, i, at, s) => {
      const v = String(vars[names[+i]] ?? '')
      const before = at > 0 && letter.test(s[at - 1]) && letter.test(v[0] ?? '') ? ' ' : ''
      const after = letter.test(s[at + m.length] ?? '') && letter.test(v.at(-1) ?? '') ? ' ' : ''
      return before + v + after
    })
  }
  return english.replace(/\{(\w+)\}/g, (_, n) => vars[n] ?? '')
}
