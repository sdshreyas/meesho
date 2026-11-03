import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { api } from '../api.js'
import { useFetch } from '../useFetch.js'
import { PARTNER_TYPES } from '../finance/data.js'
import { ScoreFactors, ScoreGauge } from '../components/fin/Score.jsx'
import LoanFlow from '../components/fin/LoanFlow.jsx'
import { ConsentCenter, Policies, inr, when } from '../components/fin/FinParts.jsx'

const TABS = [
  ['overview', '🏠 Overview'],
  ['partners', '🤝 Partners'],
  ['scores', '📊 Trust Scores'],
  ['loans', '💸 Loan desk'],
  ['insurance', '🛡 Insurance'],
  ['consents', '🔒 Consents (DPDP)'],
  ['board', '📈 Board & escrow'],
  ['rules', '⚖ Rules'],
]
const KIND = { buyer: 'Buyers', reseller: 'Resellers', seller: 'Sellers', pilot: 'Valmo Pilots', captain: 'Valmo Captains', driver: 'Line-haul drivers' }
const crore = (n) => (n >= 1e7 ? `₹${(n / 1e7).toFixed(2)} Cr` : n >= 1e5 ? `₹${(n / 1e5).toFixed(1)} L` : inr(n))

function Overview({ d, go }) {
  const s = d.stats
  return (
    <div className="ops-stack">
      <div className="kpis">
        <div className="kpi purple"><small>Loans disbursed (demo)</small><b>{crore(s.disbursed)}</b><small className="kpi-sub">{s.loans} loans</small></div>
        <div className="kpi"><small>Meesho service fees</small><b>{inr(s.meeshoFees)}</b><small className="kpi-sub">paid by lenders, not users</small></div>
        <div className="kpi"><small>Active DPDP consents</small><b>{s.activeConsents}</b></div>
        <div className="kpi"><small>Active policies</small><b>{s.policies}</b><small className="kpi-sub">incl. default crew cover</small></div>
        <div className="kpi green"><small>Auto-claims paid</small><b>{inr(s.claimsPaid)}</b></div>
      </div>
      <div className="box">
        <b>How Meesho FinHub works</b>
        <div className="flow-strip fin-flow">
          {[
            ['📊', 'Meesho & Valmo data', 'Orders, Valmo scans, returns, COD, ads'],
            ['🧮', 'Trust Score /900', 'Explainable factors, recalculated daily'],
            ['🔒', 'DPDP consent', 'User picks lenders & data — per purpose'],
            ['🏦', 'Partner lender / insurer', 'Underwrites, prices, issues KFS'],
            ['💸', 'Direct disbursal', 'Lender → user bank account'],
            ['🔁', 'Escrow sweep', 'Repaid from weekly payouts'],
          ].map(([i, t, x], n) => (
            <div key={t} className="flow-step"><span className="flow-icon">{i}</span><b>{t}</b><small>{x}</small>{n < 5 && <i className="flow-arrow">→</i>}</div>
          ))}
        </div>
        <p className="muted">Meesho is the Lending Service Provider and Corporate Insurance Agent — it never lends from its own balance sheet, never holds loan money, and earns a service fee from partners.</p>
        <div className="row-gap">
          <button className="btn-primary sm" onClick={() => go('loans')}>Open the loan desk →</button>
          <button className="btn-outline sm" onClick={() => go('scores')}>See Trust Scores</button>
        </div>
      </div>
      <div className="box">
        <b>Everyone FinHub serves</b>
        <div className="people-grid">
          {d.users.map((u) => (
            <div key={u.id} className="person">
              <span className={'score-chip ' + u.band.tone}>{u.score}</span>
              <span><b>{u.name}</b><small className="muted block">{u.role} · {u.city}</small></span>
              <small>{Object.entries(u.limits).map(([p, v]) => (v ? `${d.products[p].label}: ${inr(v)}` : `${d.products[p].label}: not yet`)).join(' · ')}</small>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function Partners({ d }) {
  return (
    <div className="ops-stack">
      <small className="muted">Partner names are illustrative for the case study; no real partnership is implied. Rates are indicative.</small>
      {Object.entries(PARTNER_TYPES).map(([type, label]) => (
        <div key={type} className="box">
          <b>{label}</b>
          <div className="partner-grid">
            {d.partners.filter((p) => p.type === type).map((p) => (
              <div key={p.id} className="partner-card">
                <div className="partner-logo" style={{ background: p.color }}>{p.short.slice(0, 2).toUpperCase()}</div>
                <div>
                  <b>{p.name}</b>
                  <small className="muted block">{p.rbi ?? p.irdai ?? p.role}</small>
                  <small className="block">{p.blurb}</small>
                  {p.products && <small className="block">Products: {p.products.map((x) => d.products[x].label).join(', ')}</small>}
                  {p.spread != null && <small className="block">Pricing: base {p.spread >= 0 ? '+' : ''}{p.spread}% · fee {p.fee}% · min score {p.minScore} · <b>Meesho fee {p.lspFee}%</b></small>}
                  {p.commission && <small className="block"><b>Meesho commission {p.commission}%</b> of premium</small>}
                </div>
                <span className="pill green">Integrated</span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

function Scores({ d }) {
  const [kind, setKind] = useState('all')
  const [open, setOpen] = useState(d.users[0].id)
  const list = d.users.filter((u) => kind === 'all' || u.kind === kind)
  const u = d.users.find((x) => x.id === open) ?? list[0]
  return (
    <div className="ops-split">
      <aside className="ops-side">
        <div className="seg wrap">
          {[['all', 'All'], ...Object.entries(KIND)].map(([k, l]) => <button key={k} className={kind === k ? 'sel' : ''} onClick={() => setKind(k)}>{l}</button>)}
        </div>
        {list.map((x) => (
          <button key={x.id} className={'person btnlike' + (x.id === u?.id ? ' sel' : '')} onClick={() => setOpen(x.id)}>
            <span className={'score-chip ' + x.band.tone}>{x.score}</span>
            <span><b>{x.name}</b><small className="muted block">{x.role}</small></span>
          </button>
        ))}
      </aside>
      {u && (
        <div className="ops-main">
          <div className="box score-box">
            <ScoreGauge score={u.score} band={u.band} />
            <div>
              <h3>{u.name}</h3>
              <p className="muted">{u.role} · {u.city}</p>
              <p>Most of Meesho's sellers and buyers are “credit invisible” to banks. The Trust Score turns their Meesho and Valmo track record into a number partners can lend against — shared only with the user's consent.</p>
              {Object.entries(u.limits).map(([p, v]) => <div key={p} className="fc-row"><span>{d.products[p].label}</span><b>{v ? `up to ${inr(v)}` : 'not eligible yet'}</b></div>)}
            </div>
          </div>
          <div className="box">
            <b>What makes up this score</b>
            <ScoreFactors factors={u.factors} />
          </div>
        </div>
      )}
    </div>
  )
}

function LoanDesk({ d, reload }) {
  const borrowers = d.users.filter((u) => u.products.length)
  const [uid, setUid] = useState(borrowers.find((u) => u.kind === 'seller')?.id ?? borrowers[0].id)
  const u = borrowers.find((x) => x.id === uid)
  const [productKey, setProductKey] = useState(u.products[0])
  const product = d.products[productKey] ?? d.products[u.products[0]]
  const pk = u.products.includes(productKey) ? productKey : u.products[0]
  const limit = u.limits[pk] || 0
  const [tenure, setTenure] = useState(product.tenures[1] ?? product.tenures[0])
  const [flow, setFlow] = useState(false)
  const amt = limit // the amount is set by the Trust Score, not chosen by Meesho
  const ten = product.tenures.includes(tenure) ? tenure : product.tenures[0]
  const cancel = async (id) => {
    await api.finance.cancelLoan(id)
    reload()
  }
  return (
    <div className="ops-stack">
      <div className="box">
        <b>💸 Loan desk — share data, compare lenders, disburse</b>
        <div className="form-row batch-form">
          <label>Borrower
            <select value={uid} onChange={(e) => { setUid(e.target.value); setProductKey(borrowers.find((x) => x.id === e.target.value).products[0]) }}>
              {borrowers.map((x) => <option key={x.id} value={x.id}>{x.name} · {x.role} · {x.score}</option>)}
            </select>
          </label>
          <label>Product
            <select value={pk} onChange={(e) => setProductKey(e.target.value)}>
              {u.products.map((p) => <option key={p} value={p}>{d.products[p].label}</option>)}
            </select>
          </label>
          <label>Pre-approved amount
            <b className="preapproved">{limit ? inr(limit) : 'Not eligible yet'}</b>
          </label>
          <label>Tenure
            <select value={ten} onChange={(e) => setTenure(+e.target.value)}>
              {product.tenures.map((t) => <option key={t} value={t}>{t} {product.days ? 'days' : 'months'}</option>)}
            </select>
          </label>
          <label>&nbsp;<button className="btn-primary" disabled={!limit} onClick={() => setFlow(true)}>Get lender offers</button></label>
        </div>
        <small className="muted">Trust Score {u.score} ({u.band.label}) · amount set automatically from the Trust Score · repayment: {product.repay}</small>
      </div>
      {flow && <LoanFlow userId={u.id} productKey={pk} amount={amt} tenure={ten} onClose={() => { setFlow(false); reload() }} onDone={reload} />}

      <div className="box">
        <b>📒 Loan book</b>
        <div className="table-wrap">
          <table className="sku-table">
            <thead><tr><th>Loan</th><th>Borrower</th><th>Product</th><th>Lender</th><th>Amount</th><th>Rate / APR</th><th>Instalment</th><th>Meesho fee</th><th>Consent</th><th>Status</th><th /></tr></thead>
            <tbody>
              {d.loans.map((l) => (
                <tr key={l.id}>
                  <td><code>{l.id}</code><small className="muted block">{when(l.disbursedAt)}</small></td>
                  <td>{l.userName}</td>
                  <td>{l.product}</td>
                  <td>{l.partnerName}</td>
                  <td>{inr(l.principal)}</td>
                  <td>{l.rate}% / {l.apr}%</td>
                  <td>{inr(l.emi)} × {l.tenure}</td>
                  <td>{inr(l.meeshoFee)}</td>
                  <td><code>{l.consentId}</code></td>
                  <td><span className={'pill ' + (l.status === 'active' ? 'green' : l.status === 'cooling-off' ? 'amber' : '')}>{l.status}{l.status === 'cooling-off' ? ` · ${l.coolingHoursLeft}h` : ''}</span></td>
                  <td>{l.status === 'cooling-off' && <button className="btn-mini" onClick={() => cancel(l.id)}>Cancel</button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!d.loans.length && <p className="muted">No loans yet — pick a borrower above.</p>}
        </div>
      </div>
    </div>
  )
}

function Insurance({ d, reload }) {
  const sellers = d.users.filter((u) => u.kind === 'seller')
  const crew = d.users.filter((u) => ['pilot', 'captain', 'driver'].includes(u.kind))
  return (
    <div className="ops-stack">
      <div className="box">
        <b>🛵 Valmo crew — covered by default</b>
        <small className="muted">Every Valmo Pilot, Captain and line-haul driver is insured from day one; Valmo pays the premium.</small>
        <div className="table-wrap">
          <table className="sku-table">
            <thead><tr><th>Crew member</th><th>Role</th><th>Covers</th><th>Status</th></tr></thead>
            <tbody>
              {crew.map((u) => (
                <tr key={u.id}>
                  <td><b>{u.name}</b><small className="muted block">{u.node}</small></td>
                  <td>{u.role}</td>
                  <td>{u.policies.map((p) => <small key={p.key} className="block">{p.label} — {p.insurerName} · ₹{p.price} {p.unit}</small>)}</td>
                  <td><span className="pill green">✓ Active (default)</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      {sellers.map((u) => (
        <div key={u.id} className="box">
          <b>🏪 {u.name} — seller insurance (opt-in)</b>
          <Policies user={u} onChange={reload} />
        </div>
      ))}
      <div className="box">
        <b>⚡ Zero-paperwork claims</b>
        <table className="sku-table">
          <thead><tr><th>Claim</th><th>Order</th><th>Trigger</th><th>Paid</th><th>When</th></tr></thead>
          <tbody>
            {d.claims.map((c) => <tr key={c.id}><td><code>{c.id}</code></td><td>{c.orderId} · {c.item}</td><td>{c.trigger}</td><td>{inr(c.amount)}</td><td>{when(c.at)}</td></tr>)}
          </tbody>
        </table>
        {!d.claims.length && <p className="muted">No claims yet — simulate a hub damage scan from a seller's dispatch list.</p>}
      </div>
    </div>
  )
}

function Board() {
  const [sellerUptake, setSellerUptake] = useState(4)
  const ticket = 60000 // average pre-approved seller loan — set by the Trust Score, not chosen
  const [payLater, setPayLater] = useState(12)
  const [shield, setShield] = useState(25)
  const [fldg, setFldg] = useState(false)
  const SELLERS = 575000
  const ORDERS_M = 1.8e8 // ~21 crore buyers, monthly orders
  const loansPerMonth = (SELLERS * sellerUptake) / 100 / 6
  const disbursal = loansPerMonth * ticket
  const lspPct = fldg ? 4 : 2.75
  const lendRev = disbursal * (lspPct / 100)
  const blOrders = (ORDERS_M * payLater) / 100
  const blRev = blOrders * (420 * 0.0125 + 18)
  const insRev = ORDERS_M * (shield / 100) * 2 * 0.18
  const total = lendRev + blRev + insRev
  const book = disbursal * 3
  const split = { valmo: 45, premium: 2, sweep: 95, seller: 1000 - 45 - 2 - 95 }
  return (
    <div className="ops-stack">
      <div className="box">
        <b>📈 Revenue simulator (monthly, at Meesho scale)</b>
        <div className="form-row batch-form">
          <label>Sellers taking a loan in 6 months: <b>{sellerUptake}%</b><input type="range" min="1" max="15" value={sellerUptake} onChange={(e) => setSellerUptake(+e.target.value)} /></label>
          <label>Average seller loan (pre-approved)<b className="preapproved">{inr(ticket)}</b></label>
          <label>Orders paid with Pay Later: <b>{payLater}%</b><input type="range" min="0" max="40" value={payLater} onChange={(e) => setPayLater(+e.target.value)} /></label>
          <label>Parcels with ₹2 shield: <b>{shield}%</b><input type="range" min="0" max="80" value={shield} onChange={(e) => setShield(+e.target.value)} /></label>
          <label className="check"><input type="checkbox" checked={fldg} onChange={(e) => setFldg(e.target.checked)} /> Offer 5% default-loss guarantee (FLDG)</label>
        </div>
        <div className="kpis">
          <div className="kpi"><small>Seller loans / month</small><b>{crore(disbursal)}</b><small className="kpi-sub">{Math.round(loansPerMonth).toLocaleString('en-IN')} loans</small></div>
          <div className="kpi"><small>Lending fees ({lspPct}%)</small><b>{crore(lendRev)}</b></div>
          <div className="kpi"><small>Pay Later (MDR share + COD saving)</small><b>{crore(blRev)}</b></div>
          <div className="kpi"><small>Insurance commission</small><b>{crore(insRev)}</b></div>
          <div className="kpi purple"><small>FinHub revenue / month</small><b>{crore(total)}</b><small className="kpi-sub">{crore(total * 12)} a year</small></div>
          {fldg && <div className="kpi amber"><small>FLDG locked (5% of book)</small><b>{crore(book * 0.05)}</b><small className="kpi-sub">max RBI allows</small></div>}
        </div>
        <small className="muted">Assumptions: 5.75 lakh sellers, ~18 crore orders a month, 6-month loans, ₹420 Pay Later basket, 1.25% MDR share + ₹18 COD handling saved per order, 18% insurance commission.</small>
      </div>
      <div className="box">
        <b>🔁 Tripartite escrow — how a ₹1,000 seller payout is split</b>
        <div className="escrow">
          <div className="esc-node">Buyer pays ₹1,000</div>
          <div className="esc-arrow">→</div>
          <div className="esc-node bank">Escrow account<small>(trustee bank, not Meesho's account)</small></div>
          <div className="esc-arrow">→</div>
          <div className="esc-split">
            <div><b>₹{split.valmo}</b> Valmo logistics fee</div>
            <div><b>₹{split.premium}</b> Transit Shield premium → insurer</div>
            <div><b>₹{split.sweep}</b> loan repayment sweep → lender</div>
            <div className="seller"><b>₹{split.seller}</b> → seller's bank account</div>
          </div>
        </div>
        <small className="muted">The seller signs an escrow instruction + e-NACH back-up when taking the loan. Loan money and repayments never touch Meesho's corporate account (RBI Digital Lending Directions).</small>
      </div>
    </div>
  )
}

const RULES = [
  ['RBI — Digital Lending', [
    ['Loan money never passes through Meesho', 'Disbursal goes lender → borrower bank (UTR shown); repayments go to the lender via escrow.'],
    ['Multi-lender transparency', 'Loan desk shows every eligible lender side by side, cheapest APR first.'],
    ['Key Fact Statement before signing', 'Full KFS with APR, fees, every instalment, recovery & grievance — must be read to proceed.'],
    ['3-day cooling-off', 'Cancel without penalty from the success screen and the loan book.'],
    ['No fees charged by the LSP to borrowers', 'Meesho’s fee is paid by the lender and disclosed in the KFS.'],
    ['Default-loss guarantee capped at 5%', 'Board simulator models FLDG at exactly 5% of the book.'],
  ]],
  ['IRDAI — Insurance distribution', [
    ['Corporate Agent registration', 'Meesho distributes policies of Acko, Digit, ICICI Lombard, Care Health as Corporate Agent.'],
    ['No pre-ticked insurance', 'Seller covers and the ₹2 Transit Shield are unticked until the seller opts in.'],
    ['Premium before risk (Sec. 64VB)', 'Premium is settled to the insurer from escrow when the policy is issued.'],
  ]],
  ['DPDP Act 2023 & DPDP Rules', [
    ['Clear notice before consent', 'Consent screen states who asks, purpose, exact data fields, recipients, retention and rights.'],
    ['Purpose limitation', 'Each consent is tied to one product (e.g. working-capital underwriting) — not reused for ads.'],
    ['Data minimisation', 'Only fields needed for that product are listed; optional fields can be unticked.'],
    ['Granular, per-recipient consent', 'One consent artefact per lender, nothing pre-selected.'],
    ['Easy withdrawal', 'One-click Withdraw in “My consents” — as easy as giving consent.'],
    ['Storage limitation', 'Consents expire after 1 year; data retained for 180 days, then deleted by partners.'],
    ['Rights of the Data Principal', 'Access, correction, erasure and grievance contacts shown on every consent screen.'],
    ['Accountability & audit trail', 'Every consent has an ID, timestamp, language and field list, linked to the loan it enabled.'],
    ['Age confirmation', 'Borrowers confirm they are 18+ before any data is shared.'],
  ]],
]

function Rules() {
  return (
    <div className="ops-stack">
      {RULES.map(([title, items]) => (
        <div key={title} className="box">
          <b>⚖ {title}</b>
          <table className="sku-table">
            <thead><tr><th>Requirement</th><th>How FinHub complies</th><th /></tr></thead>
            <tbody>{items.map(([r, h]) => <tr key={r}><td><b>{r}</b></td><td>{h}</td><td><span className="pill green">✓</span></td></tr>)}</tbody>
          </table>
        </div>
      ))}
      <small className="muted">Summary for a case-study prototype; not legal advice.</small>
    </div>
  )
}

export default function Finance() {
  const [params, setParams] = useSearchParams()
  const tab = params.get('tab') ?? 'overview'
  const { data: d, reload } = useFetch(() => api.finance.overview(), [])
  const go = (k) => setParams({ tab: k })
  const view = useMemo(() => {
    if (!d) return null
    if (tab === 'partners') return <Partners d={d} />
    if (tab === 'scores') return <Scores d={d} />
    if (tab === 'loans') return <LoanDesk d={d} reload={reload} />
    if (tab === 'insurance') return <Insurance d={d} reload={reload} />
    if (tab === 'consents') return <ConsentCenter consents={[...d.consents].reverse()} dpdp={d.dpdp} onChange={reload} showUser />
    if (tab === 'board') return <Board />
    if (tab === 'rules') return <Rules />
    return <Overview d={d} go={go} />
  }, [d, tab]) // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <main className="page ops finance">
      <div className="ops-head">
        <div>
          <h2>Meesho FinHub</h2>
          <small className="muted">Embedded credit & insurance through partner banks, NBFCs and insurers — Meesho as Lending Service Provider and Corporate Agent. DPDP-compliant consent on every data share.</small>
        </div>
        <nav className="ops-tabs wrap">
          {TABS.map(([k, l]) => <button key={k} className={tab === k ? 'sel' : ''} onClick={() => go(k)}>{l}</button>)}
        </nav>
      </div>
      {!d ? <div className="loading">Loading FinHub…</div> : view}
    </main>
  )
}
