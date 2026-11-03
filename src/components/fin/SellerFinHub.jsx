import { useState } from 'react'
import { api } from '../../api.js'
import { useApp } from '../../store.jsx'
import { useFetch } from '../../useFetch.js'
import { LOAN_PRODUCTS } from '../../finance/data.js'
import { ScoreFactors, ScoreGauge } from './Score.jsx'
import LoanFlow from './LoanFlow.jsx'
import { ConsentCenter, DispatchShield, FinSahayak, Policies, inr } from './FinParts.jsx'

/** Seller FinHub: Trust Score, pre-approved working capital, insurance, Valmo shield, FinSahayak. */
export default function SellerFinHub({ sellerId }) {
  const { t } = useApp()
  const { data: u, reload } = useFetch(() => api.finance.user(sellerId), [sellerId])
  const [amount, setAmount] = useState(null)
  const [tenure, setTenure] = useState(6)
  const [adBoost, setAdBoost] = useState(false)
  const [flow, setFlow] = useState(false)
  if (!u) return <div className="loading">…</div>
  const product = LOAN_PRODUCTS.seller_wc
  const limit = u.limits.seller_wc
  const amt = amount ?? Math.min(limit, 50000)
  const live = u.loans.filter((l) => l.status !== 'cancelled')

  return (
    <section className="finhub">
      <h3 className="section-title">💼 {t('financeTitle')} · Meesho FinHub</h3>
      <div className="seller-grid fin-grid">
        <div className="box score-box">
          <ScoreGauge score={u.score} band={u.band} label="Meesho Trust Score" />
          <div>
            <b>What builds your score</b>
            <ScoreFactors factors={u.factors} />
          </div>
        </div>
        <div className="box fin">
          <b>🏦 Pre-approved working capital</b>
          <small className="muted">From partner banks & NBFCs, based on your Trust Score {u.score}. Repaid automatically from your weekly Meesho payouts — no big EMI shock.</small>
          <div className="big-num">{limit ? `Up to ${inr(limit)}` : 'Not eligible yet'}</div>
          {limit > 0 && (
            <>
              <label className="slider-label">Loan amount: <b>{inr(amt)}</b>
                <input type="range" min={product.min} max={limit} step={5000} value={amt} onChange={(e) => setAmount(+e.target.value)} />
              </label>
              <div className="seg">
                {product.tenures.map((m) => <button key={m} className={tenure === m ? 'sel' : ''} onClick={() => setTenure(m)}>{m} months</button>)}
              </div>
              <label className="check">
                <input type="checkbox" checked={adBoost} onChange={(e) => setAdBoost(e.target.checked)} />
                <span>📣 <b>Ad-Credit booster:</b> put 20% ({inr(amt * 0.2)}) into my Meesho Ad Wallet and get <b>₹1,500 bonus ad credit</b></span>
              </label>
              <button className="btn-primary wide" onClick={() => setFlow(true)}>View lender offers →</button>
              <small className="muted">Next: choose which lenders may see your data (DPDP consent), compare offers, read the Key Fact Statement.</small>
            </>
          )}
          {live.length > 0 && (
            <div className="my-loans">
              <b>My loans</b>
              {live.map((l) => (
                <div key={l.id} className="fc-row">
                  <span>{l.partnerName} · {inr(l.principal)} · {l.rate}% · {inr(l.emi)}/month</span>
                  <b className={l.status === 'cooling-off' ? 'down' : 'up'}>{l.status}{l.status === 'cooling-off' ? ` (${l.coolingHoursLeft}h left)` : ''}</b>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      {flow && <LoanFlow userId={sellerId} productKey="seller_wc" amount={amt} tenure={tenure} adBoost={adBoost} onClose={() => { setFlow(false); reload() }} onDone={reload} />}

      <div className="seller-grid fin-grid">
        <DispatchShield user={u} sellerId={sellerId} onChange={reload} />
        <div className="box">
          <b>🛡 Protect your business</b>
          <Policies user={u} only={['godown', 'hospicash']} onChange={reload} />
        </div>
      </div>

      <div className="seller-grid fin-grid">
        <FinSahayak userId={sellerId} name={u.owner ?? u.name} />
        <ConsentCenter consents={[...u.consents].reverse()} dpdp={u.dpdp} onChange={reload} />
      </div>
    </section>
  )
}
