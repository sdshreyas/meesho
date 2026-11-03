import { useState } from 'react'
import { api } from '../../api.js'
import { useFetch } from '../../useFetch.js'
import { ScoreFactors, ScoreGauge } from '../fin/Score.jsx'
import LoanFlow from '../fin/LoanFlow.jsx'
import { Policies, inr } from '../fin/FinParts.jsx'

/** Valmo crew finance: Trust Scores, default insurance and loans for Pilots, Captains and drivers. */
export default function CrewFinanceTab() {
  const { data: d, reload } = useFetch(() => api.finance.overview(), [])
  const [flow, setFlow] = useState(null)
  if (!d) return <div className="loading">Loading crew…</div>
  const crew = d.users.filter((u) => ['pilot', 'captain', 'driver'].includes(u.kind))
  return (
    <div className="ops-stack">
      <div className="box">
        <b>🛵 Valmo crew finance</b>
        <small className="muted">Every Pilot, Captain and line-haul driver is insured by default (Valmo pays). Their delivery record builds a Meesho Trust Score that partner lenders use for EV, fuel-advance and working-capital loans — shared only with the crew member's DPDP consent.</small>
      </div>
      {crew.map((u) => (
        <div key={u.id} className="box crew-card">
          <div className="crew-top">
            <ScoreGauge score={u.score} band={u.band} size={170} />
            <div className="crew-info">
              <h3>{u.name}</h3>
              <p className="muted">{u.role} · {u.node}</p>
              <div className="fc-row"><span>Monthly earnings</span><b>{inr(u.monthlyIncome)}</b></div>
              {u.products.map((p) => (
                <div key={p} className="fc-row">
                  <span>{d.products[p].label}</span>
                  {u.limits[p] ? (
                    <button className="btn-mini" onClick={() => setFlow({ userId: u.id, productKey: p, amount: u.limits[p], tenure: d.products[p].tenures[1] ?? d.products[p].tenures[0] })}>Up to {inr(u.limits[p])} — offers</button>
                  ) : <b className="down">not eligible yet</b>}
                </div>
              ))}
            </div>
            <div className="crew-cover"><Policies user={u} onChange={reload} /></div>
          </div>
          <details>
            <summary>What builds {u.name.split(' ')[0]}'s score</summary>
            <ScoreFactors factors={u.factors} />
          </details>
        </div>
      ))}
      {flow && <LoanFlow {...flow} onClose={() => { setFlow(null); reload() }} onDone={reload} />}
    </div>
  )
}
