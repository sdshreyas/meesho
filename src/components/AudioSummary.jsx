import { useEffect, useRef, useState } from 'react'
import { useApp } from '../store.jsx'
import { google } from '../i18n/translate.js'
import { langByCode } from '../data/languages.js'
import { SUMMARY_LANGS, loadVoices, pickVoice, speakAll, speechSupported } from '../i18n/speech.js'

const cache = {}

async function translateLines(lines, lang) {
  if (lang === 'en') return { lines, ok: true }
  const key = lang + '|' + lines.join('|')
  if (cache[key]) return cache[key]
  try {
    const map = await google(lines, lang)
    const out = { lines: lines.map((l) => map[l] ?? l), ok: lines.every((l) => map[l]) }
    cache[key] = out
    return out
  } catch {
    return { lines, ok: false }
  }
}

/** Spoken business briefing for sellers, in 8 languages, switchable with one click. */
export default function AudioSummary({ lines }) {
  const { lang, setLang, t } = useApp()
  const [text, setText] = useState({ lines, ok: true, lang: 'en' })
  const [voices, setVoices] = useState([])
  const [state, setState] = useState('idle') // idle | playing | paused
  const [current, setCurrent] = useState(-1)
  const stopRef = useRef(null)
  const autoplay = useRef(false)

  useEffect(() => {
    loadVoices().then(setVoices)
    return () => stopRef.current?.()
  }, [])

  const key = lines.join('|')
  useEffect(() => {
    let alive = true
    stopRef.current?.()
    setState('idle')
    setCurrent(-1)
    translateLines(lines, lang).then((r) => alive && setText({ ...r, lang }))
    return () => {
      alive = false
    }
  }, [key, lang]) // eslint-disable-line react-hooks/exhaustive-deps

  const { voice, via } = pickVoice(voices, text.ok ? lang : 'en')
  const ready = text.lang === lang

  const play = (from = 0) => {
    if (!voice) return
    stopRef.current = speakAll(text.lines, voice, {
      from,
      onIndex: setCurrent,
      onEnd: () => {
        setState('idle')
        setCurrent(-1)
      },
    })
    setState('playing')
  }

  // after a language chip is clicked, start speaking as soon as the translation lands
  useEffect(() => {
    if (autoplay.current && ready && voices.length) {
      autoplay.current = false
      play()
    }
  }, [ready, voices.length]) // eslint-disable-line react-hooks/exhaustive-deps

  const toggle = () => {
    if (state === 'playing') {
      speechSynthesis.pause()
      setState('paused')
    } else if (state === 'paused') {
      speechSynthesis.resume()
      setState('playing')
    } else play()
  }
  const stop = () => {
    stopRef.current?.()
    setState('idle')
    setCurrent(-1)
  }
  const choose = (code) => {
    if (code === lang) return play()
    autoplay.current = true
    setLang(code)
  }

  const langName = langByCode(lang).name
  return (
    <div className="audio-card">
      <div className="audio-head">
        <button className={'play-btn' + (state === 'playing' ? ' on' : '')} onClick={toggle} disabled={!voice || !ready} aria-label={t('play')}>
          {state === 'playing' ? '❚❚' : '▶'}
        </button>
        <div className="audio-title">
          <b>🔊 {t('audioTitle')}</b>
          <small>{state === 'playing' ? t('nowPlaying', { n: current + 1, total: text.lines.length }) : t('audioSub')}</small>
          {state === 'playing' && <span className="eq"><i /><i /><i /><i /></span>}
        </div>
        {state !== 'idle' && <button className="btn-outline stop-btn" onClick={stop}>■ {t('stop')}</button>}
      </div>
      <div className="lang-chips">
        {SUMMARY_LANGS.map((l) => (
          <button key={l.code} className={l.code === lang ? 'sel' : ''} onClick={() => choose(l.code)}>{l.native}</button>
        ))}
      </div>
      {!speechSupported() && <small className="voice-note">{t('noSpeech')}</small>}
      {speechSupported() && voices.length > 0 && !voice && <small className="voice-note">{t('noVoice', { lang: langName })}</small>}
      {voice && via !== lang && text.ok && <small className="voice-note">{t('fallbackVoice', { lang: langName })}</small>}
      {!text.ok && lang !== 'en' && <small className="voice-note">{t('summaryOffline')}</small>}
      <ol className="transcript">
        {text.lines.map((l, i) => (
          <li key={i} className={i === current ? 'cur' : ''} onClick={() => voice && play(i)}>{l}</li>
        ))}
      </ol>
    </div>
  )
}
