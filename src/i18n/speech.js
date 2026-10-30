// Text-to-speech with the browser's built-in Web Speech API (free, no key).
// Indian-language voices come from the device (macOS, Windows, Android, Chrome).

export const SUMMARY_LANGS = [
  { code: 'hi', bcp: 'hi-IN', native: 'हिन्दी' },
  { code: 'en', bcp: 'en-IN', native: 'English' },
  { code: 'kn', bcp: 'kn-IN', native: 'ಕನ್ನಡ' },
  { code: 'gu', bcp: 'gu-IN', native: 'ગુજરાતી' },
  { code: 'ta', bcp: 'ta-IN', native: 'தமிழ்' },
  { code: 'te', bcp: 'te-IN', native: 'తెలుగు' },
  { code: 'mr', bcp: 'mr-IN', native: 'मराठी' },
  { code: 'ml', bcp: 'ml-IN', native: 'മലയാളം' },
]

// Marathi is written in Devanagari, so a Hindi voice can read it if no Marathi voice exists
const FALLBACK = { mr: 'hi' }

export const speechSupported = () => typeof window !== 'undefined' && 'speechSynthesis' in window

export function loadVoices() {
  if (!speechSupported()) return Promise.resolve([])
  const now = speechSynthesis.getVoices()
  if (now.length) return Promise.resolve(now)
  return new Promise((resolve) => {
    const done = () => resolve(speechSynthesis.getVoices())
    speechSynthesis.addEventListener('voiceschanged', done, { once: true })
    setTimeout(done, 1500)
  })
}

const findVoice = (voices, code) => {
  const matches = voices.filter((v) => v.lang.replace('_', '-').toLowerCase().startsWith(code))
  const prefer = (v) => (v.lang.toUpperCase().endsWith('IN') ? 2 : 0) + (/google/i.test(v.name) ? 1 : 0)
  return matches.sort((a, b) => prefer(b) - prefer(a))[0] ?? null
}

/** { voice, via } — via is the language actually spoken, or null if nothing can read it. */
export function pickVoice(voices, code) {
  const own = findVoice(voices, code)
  if (own) return { voice: own, via: code }
  const fb = FALLBACK[code] && findVoice(voices, FALLBACK[code])
  return fb ? { voice: fb, via: FALLBACK[code] } : { voice: null, via: null }
}

/**
 * Speaks sentences one by one (long single utterances get cut off in Chrome).
 * Returns a stop() function.
 */
export function speakAll(sentences, voice, { from = 0, onIndex, onEnd } = {}) {
  speechSynthesis.cancel()
  let stopped = false
  const next = (i) => {
    if (stopped) return
    if (i >= sentences.length) return onEnd?.()
    const u = new SpeechSynthesisUtterance(sentences[i])
    u.voice = voice
    u.lang = voice.lang
    u.rate = 0.95
    u.onstart = () => onIndex?.(i)
    u.onend = () => next(i + 1)
    u.onerror = (e) => (e.error === 'interrupted' || e.error === 'canceled' ? null : next(i + 1))
    speechSynthesis.speak(u)
  }
  next(from)
  return () => {
    stopped = true
    speechSynthesis.cancel()
  }
}
