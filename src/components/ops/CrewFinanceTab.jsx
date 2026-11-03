import { api } from '../../api.js'
import { useFetch } from '../../useFetch.js'
import { ScoreFactors, ScoreGauge } from '../fin/Score.jsx'
import { inr, when } from '../fin/FinParts.jsx'

/** Valmo crew finance (monitoring only): Trust Scores, default insurance and the loans crew chose in their own app. */
export default function CrewFinanceTab() {
  const { data: d } = useFetch(() => api.finance.overview(), [])
  if (!d) return <div className="loading">Loading crew…</div>
  const crew = d.users.filter((u) => ['pilot', 'captain', 'driver'].includes(u.kind))
  return (
    <div className="ops-stack">
      <div className="box">
        <b>🛵 Valmo crew finance</b>
        <small className="muted">Every Pilot, Captain and line-haul driver is insured by default (Valmo pays). Their delivery record builds a Meesho Trust Score that partner lenders use for EV, fuel-advance and working-capital loans — shared only with the crew member's DPDP consent. Crew apply in their own Valmo app; this view only monitors.</small>
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
                  {u.limits[p] ? <b>pre-approved {inr(u.limits[p])}</b> : <b className="down">not eligible yet</b>}
                </div>
              ))}
            </div>
            <div className="crew-cover">
              <b>Covers (default · paid by Valmo)</b>
              {u.policies.map((p) => <div key={p.key} className="fc-row"><span>{p.label}<small className="muted block">{p.insurerName}</small></span><span className="pill green">✓ Active</span></div>)}
              <b>Loans taken</b>
              {u.loans.length ? u.loans.map((l) => (
                <div key={l.id} className="fc-row"><span>{l.product} · {l.partnerName}<small className="muted block">{when(l.disbursedAt)} · {inr(l.emi)} × {l.tenure}</small></span><b>{inr(l.principal)}</b></div>
              )) : <small className="muted">None yet</small>}
            </div>
          </div>
          <details>
            <summary>What builds {u.name.split(' ')[0]}'s score</summary>
            <ScoreFactors factors={u.factors} />
          </details>
        </div>
      ))}
    </div>
  )
}
