import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api.js'
import { useApp } from '../store.jsx'
import { LANGUAGES } from '../data/languages.js'
import { DEMO_OTP } from '../data/personas.js'
import ThemeToggle from '../components/ThemeToggle.jsx'

const OTP_LEN = 6
const RESEND_SECONDS = 30

// One real input (handles typing, paste, backspace, SMS autofill) drawn as 6 boxes.
function OtpBoxes({ value, onChange, onComplete }) {
  const ref = useRef(null)
  useEffect(() => ref.current?.focus(), [])
  return (
    <div className="otp-boxes" onClick={() => ref.current?.focus()}>
      <input
        ref={ref}
        className="otp-real"
        inputMode="numeric"
        autoComplete="one-time-code"
        maxLength={OTP_LEN}
        value={value}
        onChange={(e) => {
          const v = e.target.value.replace(/\D/g, '').slice(0, OTP_LEN)
          onChange(v)
          if (v.length === OTP_LEN) onComplete?.(v)
        }}
        aria-label="OTP"
      />
      {Array.from({ length: OTP_LEN }, (_, i) => (
        <span key={i} className={'otp-box' + (i === Math.min(value.length, OTP_LEN - 1) ? ' active' : '')}>{value[i] ?? ''}</span>
      ))}
    </div>
  )
}

export default function Login() {
  const { profiles, login, lang, setLang, t, tx } = useApp()
  const navigate = useNavigate()
  const [role, setRole] = useState('buyer')
  const [step, setStep] = useState('phone')
  const [phone, setPhone] = useState('')
  const [otp, setOtp] = useState('')
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)
  const [sms, setSms] = useState(null)
  const [timer, setTimer] = useState(0)

  useEffect(() => {
    if (!timer) return
    const id = setTimeout(() => setTimer(timer - 1), 1000)
    return () => clearTimeout(id)
  }, [timer])

  const switchRole = (r) => {
    setRole(r)
    setStep('phone')
    setPhone('')
    setOtp('')
    setError(null)
    setSms(null)
  }

  const sendOtp = async (e) => {
    e?.preventDefault()
    if (!/^[6-9]\d{9}$/.test(phone)) return setError(t('invalidPhone'))
    setBusy(true)
    setError(null)
    try {
      const r = await api.sendOtp(phone, role)
      setStep('otp')
      setOtp('')
      setTimer(RESEND_SECONDS)
      setTimeout(() => setSms(r.demoOtp), 900) // simulated SMS arrives
    } catch (err) {
      setError(err.code === 'not_registered' ? t('notRegistered') : err.message)
    }
    setBusy(false)
  }

  const verify = async (code = otp) => {
    if (code.length !== OTP_LEN) return
    setBusy(true)
    setError(null)
    try {
      const r = await api.verifyOtp(phone, role, code)
      login(r.profileId, r.token)
      navigate(role === 'seller' ? '/seller' : role === 'ops' ? '/ops' : '/', { replace: true })
    } catch (err) {
      setError(err.code === 'wrong_otp' ? t('wrongOtp') : err.message)
      setOtp('')
      setBusy(false)
    }
  }

  const demo = profiles.filter((p) => p.type === role)
  const pitch = {
    buyer: ['buyerPitch1', 'buyerPitch2', 'buyerPitch3'],
    seller: ['sellerPitch1', 'sellerPitch2', 'sellerPitch3'],
    ops: ['opsPitch1', 'opsPitch2', 'opsPitch3'],
  }[role]

  return (
    <div className="login-page">
      {sms && (
        <button className="sms-toast" onClick={() => { setOtp(sms); setSms(null); verify(sms) }}>
          <span className="sms-app">💬 Messages · now</span>
          <b>MEESHO</b>
          <span>{t('smsToast', { otp: sms })}</span>
        </button>
      )}

      <section className={'login-brand ' + role}>
        <div className="logo light">meesho</div>
        <h1>{t({ buyer: 'loginBuyer', seller: 'loginSeller', ops: 'loginOps' }[role])}</h1>
        <ul>
          {pitch.map((k) => <li key={k}>✓ {t(k)}</li>)}
        </ul>
        <div className="brand-art" aria-hidden>{{ buyer: '🛍️👗👟💄', seller: '🏪📦📈🏦', ops: '🚚🗺️📊🏭' }[role]}</div>
      </section>

      <section className="login-card">
        <div className="login-top">
          <ThemeToggle />
          <select value={lang} onChange={(e) => setLang(e.target.value)} aria-label={t('language')}>
            {LANGUAGES.map((l) => <option key={l.code} value={l.code}>{l.native}</option>)}
          </select>
        </div>
        <div className="role-tabs">
          <button className={role === 'buyer' ? 'sel' : ''} onClick={() => switchRole('buyer')}>🛍️ {t('loginBuyer')}</button>
          <button className={role === 'seller' ? 'sel' : ''} onClick={() => switchRole('seller')}>🏪 {t('loginSeller')}</button>
          <button className={role === 'ops' ? 'sel' : ''} onClick={() => switchRole('ops')}>🚚 {t('loginOps')}</button>
        </div>
        <h2>{t('loginHeading')}</h2>

        {step === 'phone' ? (
          <form onSubmit={sendOtp} className="login-form">
            <label>{t('mobileNumber')}</label>
            <div className="phone-input">
              <span>+91</span>
              <input
                inputMode="numeric"
                autoFocus
                maxLength={10}
                value={phone}
                placeholder="98765 43210"
                onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
              />
            </div>
            {error && <div className="login-error">{error}</div>}
            <button className="btn-primary wide" disabled={busy || phone.length !== 10}>{busy ? '…' : t('sendOtp')}</button>
          </form>
        ) : (
          <div className="login-form">
            <label>{t('otpSentTo', { phone: phone.replace(/(\d{5})(\d{5})/, '$1 $2') })}</label>
            <OtpBoxes value={otp} onChange={setOtp} onComplete={verify} />
            {error && <div className="login-error">{error}</div>}
            <button className="btn-primary wide" disabled={busy || otp.length !== OTP_LEN} onClick={() => verify()}>
              {busy ? '…' : t('verifyOtp')}
            </button>
            <div className="otp-links">
              <button className="link" onClick={() => { setStep('phone'); setSms(null); setError(null) }}>{t('changeNumber')}</button>
              {timer > 0 ? <span className="muted">{t('resendIn', { s: timer })}</span> : <button className="link" onClick={sendOtp}>{t('resendOtp')}</button>}
            </div>
          </div>
        )}

        <div className="demo-box">
          <b>{t('demoAccounts')}</b>
          {demo.map((p) => (
            <button key={p.id} className="demo-acc" onClick={() => { setPhone(p.phone); setStep('phone'); setError(null) }}>
              <span className="avatar sm">{p.name.split(' ').map((s) => s[0]).join('')}</span>
              <span className="demo-info">
                <b>{p.name}</b>
                <small>{tx(p.segment)} · {p.city}</small>
              </span>
              <code>{p.phone.replace(/(\d{5})(\d{5})/, '$1 $2')}</code>
            </button>
          ))}
          <small className="muted">{t('demoOtpHint', { otp: DEMO_OTP })}</small>
        </div>
      </section>
    </div>
  )
}
