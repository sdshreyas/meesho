import { useEffect, useState } from 'react'
import { api } from '../../api.js'
import { useApp } from '../../store.jsx'

const inr = (n) => '₹' + Math.round(n).toLocaleString('en-IN')
const STEPS = ['Share data (DPDP consent)', 'Compare lender offers', 'Key Fact Statement', 'Money in your account']

/**
 * Four-step, RBI- and DPDP-compliant loan journey:
 * 1 purpose-bound consent per lender → 2 offers from every eligible lender → 3 KFS → 4 direct disbursal + cooling-off.
 */
export default function LoanFlow({ userId, productKey, amount, tenure, adBoost = false, onClose, onDone }) {
  const { lang } = useApp()
  const [step, setStep] = useState(0)
  const [data, setData] = useState(null)
  const [user, setUser] = useState(null)
  const [chosenLenders, setChosenLenders] = useState([])
  const [optional, setOptional] = useState({})
  const [agree, setAgree] = useState(false)
  const [adult, setAdult] = useState(false)
  const [pick, setPick] = useState(null)
  const [readKfs, setReadKfs] = useState(false)
  const [loan, setLoan] = useState(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)

  const loadOffers = async () => {
    const d = await api.finance.offers({ userId, productKey, amount, tenure })
    setData(d)
    return d
  }
  useEffect(() => {
    Promise.all([loadOffers(), api.finance.user(userId)]).then(([d, u]) => {
      setUser(u)
      if (d.offers.some((o) => o.consent)) setStep(1)
    })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  if (!data || !user) return <div className="modal-back"><div className="modal"><div className="loading">…</div></div></div>
  const fields = user.fields[productKey] ?? []
  const required = new Set(['kyc', fields[0]?.[0]])
  const offers = data.offers
  const consented = offers.filter((o) => o.consent)
  const sel = offers.find((o) => o.partner.id === pick) ?? consented[0]

  const giveConsent = async () => {
    setBusy(true)
    setErr(null)
    try {
      await api.finance.consent({
        userId, productKey, partnerIds: chosenLenders, language: lang, adult,
        fields: fields.map(([k]) => k).filter((k) => required.has(k) || optional[k] === true),
      })
      await loadOffers()
      setStep(1)
    } catch (e) {
      setErr(e.message)
    }
    setBusy(false)
  }
  const disburse = async () => {
    setBusy(true)
    setErr(null)
    try {
      const l = await api.finance.disburse({ userId, productKey, partnerId: sel.partner.id, amount, tenure, adBoost })
      setLoan(l)
      setStep(3)
      onDone?.(l)
    } catch (e) {
      setErr(e.message)
    }
    setBusy(false)
  }
  const k = sel?.kfs

  return (
    <div className="modal-back" role="dialog" aria-modal="true">
      <div className="modal wide">
        <div className="modal-head">
          <b>🏦 {data.user.name} · {offers[0]?.kfs.product ?? 'Loan'} · {inr(amount)}</b>
          <button className="link" onClick={onClose}>✕</button>
        </div>
        <ol className="stepper">
          {STEPS.map((s, i) => <li key={s} className={i === step ? 'now' : i < step ? 'done' : ''}><span>{i < step ? '✓' : i + 1}</span>{s}</li>)}
        </ol>

        {step === 0 && (
          <div className="consent">
            <div className="dpdp-badge">🔒 DPDP Act 2023 consent notice</div>
            <p><b>Who asks:</b> Meesho (Data Fiduciary) on behalf of you, to get you loan offers.</p>
            <p><b>Purpose (only this):</b> credit underwriting for <b>{offers[0]?.kfs.product}</b>. Not used for ads or anything else.</p>
            <b>Data that will be shared — nothing more</b>
            <ul className="field-list">
              {fields.map(([key, label]) => (
                <li key={key}>
                  <label>
                    <input type="checkbox" checked={required.has(key) || optional[key] === true} disabled={required.has(key)} onChange={(e) => setOptional((o) => ({ ...o, [key]: e.target.checked }))} />
                    {label} {required.has(key) ? <small className="muted">(needed for the loan)</small> : <small className="muted">(optional — tick to share; can improve your offer)</small>}
                  </label>
                </li>
              ))}
            </ul>
            <b>Share with which lenders? (one consent per lender, none pre-selected)</b>
            <div className="lender-picks">
              {offers.map((o) => (
                <label key={o.partner.id} className={'lender-pick' + (chosenLenders.includes(o.partner.id) ? ' on' : '')}>
                  <input type="checkbox" checked={chosenLenders.includes(o.partner.id)} onChange={(e) => setChosenLenders((c) => (e.target.checked ? [...c, o.partner.id] : c.filter((x) => x !== o.partner.id)))} />
                  <i className="partner-dot" style={{ background: o.partner.color }} />
                  <span><b>{o.partner.name}</b><small>{o.partner.rbi}</small></span>
                </label>
              ))}
              {!offers.length && <p className="muted">No lender is eligible at this Trust Score yet.</p>}
            </div>
            <div className="dpdp-terms">
              <span>🕑 Kept for {user.dpdp.retentionDays} days, consent valid {user.dpdp.consentValidityDays} days</span>
              <span>↩ Withdraw anytime in “My consents” — as easy as giving it</span>
              <span>👁 You can ask to see, correct or erase your data</span>
              <span>📮 DPO: {user.dpdp.dpo.email}</span>
            </div>
            <label className="check"><input type="checkbox" checked={adult} onChange={(e) => setAdult(e.target.checked)} /> I confirm I am 18 years or older</label>
            <label className="check"><input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} /> I agree to share the data above with the selected lenders for this purpose only</label>
            {err && <div className="login-error">{err}</div>}
            <div className="modal-actions">
              <button className="btn-outline" onClick={onClose}>Not now</button>
              <button className="btn-primary" disabled={busy || !agree || !adult || !chosenLenders.length} onClick={giveConsent}>{busy ? '…' : `Give consent & see ${chosenLenders.length || ''} offer${chosenLenders.length === 1 ? '' : 's'}`}</button>
            </div>
          </div>
        )}

        {step === 1 && (
          <div>
            <p className="muted">Every eligible lender is shown side by side (RBI multi-lender rule). Only lenders you shared data with can make an offer.</p>
            <div className="table-wrap">
              <table className="sku-table offers-table">
                <thead><tr><th>Lender</th><th>Amount</th><th>Interest</th><th>All-in APR</th><th>{data.offers[0]?.days ? 'Pay back' : 'Monthly payment'}</th><th>Fee + GST</th><th>You receive</th><th /></tr></thead>
                <tbody>
                  {offers.map((o) => (
                    <tr key={o.partner.id} className={!o.consent ? 'locked' : sel?.partner.id === o.partner.id ? 'sel' : ''} onClick={() => o.consent && setPick(o.partner.id)}>
                      <td><i className="partner-dot" style={{ background: o.partner.color }} /><b>{o.partner.name}</b></td>
                      {o.consent ? (
                        <>
                          <td>{inr(o.principal)}</td>
                          <td>{o.rate}%</td>
                          <td><b>{o.apr}%</b></td>
                          <td>{inr(o.emi)}{o.days ? ` in ${o.tenure} days` : ` × ${o.tenure}`}{o.sweepPct ? <small className="muted block">≈ {o.sweepPct}% of payouts</small> : null}</td>
                          <td>{inr(o.fee + o.gst)}</td>
                          <td>{inr(o.net)}</td>
                          <td>{sel?.partner.id === o.partner.id ? <span className="pill green">Selected</span> : <button className="btn-mini">Select</button>}</td>
                        </>
                      ) : (
                        <td colSpan={7}><span className="muted">🔒 No data shared — </span><button className="link" onClick={() => setStep(0)}>share to see this offer</button></td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {adBoost && sel && <div className="best-plan">📣 Ad-Credit booster: {inr(sel.principal * 0.2)} goes to your Meesho Ad Wallet + ₹1,500 bonus ad credit from Meesho.</div>}
            <div className="modal-actions">
              <button className="btn-outline" onClick={() => setStep(0)}>← Share with more lenders</button>
              <button className="btn-primary" disabled={!sel} onClick={() => setStep(2)}>Review Key Fact Statement →</button>
            </div>
          </div>
        )}

        {step === 2 && k && (
          <div>
            <div className="kfs">
              <div className="kfs-head"><b>Key Fact Statement</b><small>As required by RBI Digital Lending Directions</small></div>
              <table>
                <tbody>
                  <tr><td>Lender (regulated entity)</td><td><b>{k.lender}</b> · {k.lenderType}</td></tr>
                  <tr><td>Lending Service Provider</td><td>{k.lsp}</td></tr>
                  <tr><td>Product</td><td>{k.product}</td></tr>
                  <tr><td>Loan amount</td><td>{inr(k.principal)}</td></tr>
                  <tr><td>Processing fee + GST (to lender)</td><td>{inr(k.processingFee)} + {inr(k.gst)}</td></tr>
                  <tr><td>Amount credited to your bank</td><td><b>{inr(k.netDisbursed)}</b></td></tr>
                  <tr><td>Interest rate</td><td>{k.rate}% per year</td></tr>
                  <tr><td>All-inclusive APR</td><td><b>{k.apr}%</b></td></tr>
                  <tr><td>Tenure · instalments</td><td>{k.tenure} {k.tenureUnit} · {k.instalments} × {inr(k.instalment)}</td></tr>
                  <tr><td>Total interest</td><td>{inr(k.totalInterest)}</td></tr>
                  <tr><td>Total you repay</td><td><b>{inr(k.totalRepayable)}</b></td></tr>
                  <tr><td>How you repay</td><td>{k.repayment}</td></tr>
                  <tr><td>How money reaches you</td><td>{k.disbursal}</td></tr>
                  <tr><td>Cooling-off</td><td>{k.coolingOff}</td></tr>
                  <tr><td>Late charges</td><td>{k.penalCharges}</td></tr>
                  <tr><td>Recovery</td><td>{k.recovery}</td></tr>
                  <tr><td>Grievance</td><td>{k.grievance.join(' · ')}</td></tr>
                  <tr><td>Meesho's fee</td><td>{k.meeshoFeeNote}</td></tr>
                </tbody>
              </table>
            </div>
            <label className="check"><input type="checkbox" checked={readKfs} onChange={(e) => setReadKfs(e.target.checked)} /> I have read the Key Fact Statement</label>
            {err && <div className="login-error">{err}</div>}
            <div className="modal-actions">
              <button className="btn-outline" onClick={() => setStep(1)}>← Back to offers</button>
              <button className="btn-primary" disabled={!readKfs || busy} onClick={disburse}>{busy ? 'Processing…' : `Accept & receive ${inr(k.netDisbursed)}`}</button>
            </div>
          </div>
        )}

        {step === 3 && loan && (
          <div className="done-screen">
            <div className="done-big">✅ {inr(loan.net)} sent to your bank account</div>
            <div className="money-flow">
              <span className="mf-node">{loan.partnerName}</span>
              <span className="mf-arrow">→ {inr(loan.net)} · UTR {loan.utr} →</span>
              <span className="mf-node">Your bank account</span>
            </div>
            <p className="muted">Meesho never touches the loan money. Repayment: {data.offers[0]?.kfs.repayment}</p>
            {loan.adBoost && <p>📣 {inr(loan.adBoost.toAdWallet)} + ₹1,500 bonus added to your Meesho Ad Wallet.</p>}
            <p>🕑 Cooling-off: you can cancel without penalty for the next <b>{loan.coolingHoursLeft} hours</b>.</p>
            <div className="modal-actions">
              <button className="btn-outline" onClick={async () => { await api.finance.cancelLoan(loan.id); onDone?.(); onClose() }}>Cancel loan (no penalty)</button>
              <button className="btn-primary" onClick={onClose}>Done</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
