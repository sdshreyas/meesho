import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { api } from '../api.js'
import { useFetch } from '../useFetch.js'
import { PARTNER_TYPES } from '../finance/data.js'
import { ScoreFactors, ScoreGauge } from '../components/fin/Score.jsx'
import { inr, when } from '../components/fin/FinParts.jsx'

const TABS = [
  ['overview', '🏠 Overview'],
  ['partners', '🤝 Partners'],
  ['scores', '📊 Trust Scores'],
  ['loans', '💸 Loan book'],
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
            ['🔒', 'DPDP consent', 'Customer picks lenders & data in their app'],
            ['🏦', 'Partner lender / insurer', 'Underwrites, prices, issues KFS'],
            ['💸', 'Direct disbursal', 'Lender → user bank account'],
            ['🔁', 'Escrow sweep', 'Repaid from weekly payouts'],
          ].map(([i, t, x], n) => (
            <div key={t} className="flow-step"><span className="flow-icon">{i}</span><b>{t}</b><small>{x}</small>{n < 5 && <i className="flow-arrow">→</i>}</div>
          ))}
        </div>
        <p className="muted">Meesho is the Lending Service Provider and Corporate Insurance Agent — it never lends from its own balance sheet, never holds loan money, and earns a service fee from partners. This dashboard only monitors: customers choose, partners lend and insure.</p>
        <div className="row-gap">
          <button className="btn-primary sm" onClick={() => go('loans')}>View the loan book →</button>
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

/** Horizontal bar list for "share by X" analytics. */
function Bars({ rows, fmt = inr }) {
  const max = Math.max(1, ...rows.map((r) => r.value))
  return (
    <div className="mbars">
      {rows.map((r) => (
        <div key={r.label} className="mbar">
          <span className="mbar-label">{r.label}</span>
          <div className="mbar-track"><div style={{ width: `${(r.value / max) * 100}%`, background: r.color }} /></div>
          <b>{fmt(r.value)}</b>
          {r.note && <small className="muted">{r.note}</small>}
        </div>
      ))}
    </div>
  )
}

const groupSum = (list, key, val) => {
  const m = {}
  for (const x of list) {
    const k = typeof key === 'function' ? key(x) : x[key]
    m[k] = m[k] ?? { label: k, value: 0, n: 0 }
    m[k].value += val(x)
    m[k].n += 1
  }
  return Object.values(m).sort((a, b) => b.value - a.value)
}

const MONITOR = 'Monitoring only — customers choose and sign in their own Meesho / Valmo app; partners lend and insure. FinHub cannot disburse, opt in, cancel or withdraw on anyone’s behalf.'

/** Loan book: read-only analytics of loans customers have already taken with partner lenders. */
function LoanBook({ d }) {
  const kindOf = Object.fromEntries(d.users.map((u) => [u.id, KIND[u.kind] ?? u.kind]))
  const colorOf = Object.fromEntries(d.partners.map((p) => [p.name, p.color]))
  const live = d.loans.filter((l) => l.status !== 'cancelled')
  const book = live.reduce((s, l) => s + l.principal, 0)
  const monthly = live.reduce((s, l) => s + (d.products[l.productKey]?.days ? 0 : l.emi), 0)
  const avgApr = live.length ? live.reduce((s, l) => s + l.apr * l.principal, 0) / Math.max(1, book) : 0
  const fees = live.reduce((s, l) => s + l.meeshoFee, 0)
  const cooling = d.loans.filter((l) => l.status === 'cooling-off').length
  const cancelled = d.loans.filter((l) => l.status === 'cancelled').length
  return (
    <div className="ops-stack">
      <div className="monitor-note">👁 {MONITOR}</div>
      <div className="kpis">
        <div className="kpi purple"><small>Live loan book</small><b>{crore(book)}</b><small className="kpi-sub">{live.length} loans via partners</small></div>
        <div className="kpi"><small>Monthly repayments due</small><b>{inr(monthly)}</b><small className="kpi-sub">swept from payouts / earnings</small></div>
        <div className="kpi"><small>Weighted average APR</small><b>{avgApr.toFixed(1)}%</b></div>
        <div className="kpi green"><small>Meesho service fees</small><b>{inr(fees)}</b><small className="kpi-sub">paid by lenders</small></div>
        <div className="kpi amber"><small>In 3-day cooling-off</small><b>{cooling}</b><small className="kpi-sub">{cancelled} cancelled by customers</small></div>
      </div>
      <div className="fin-cols">
        <div className="box"><b>By lender</b><Bars rows={groupSum(live, 'partnerName', (l) => l.principal).map((r) => ({ ...r, color: colorOf[r.label], note: `${r.n} loans` }))} fmt={crore} /></div>
        <div className="box"><b>By product</b><Bars rows={groupSum(live, 'product', (l) => l.principal).map((r) => ({ ...r, note: `${r.n} loans` }))} fmt={crore} /></div>
        <div className="box"><b>By customer type</b><Bars rows={groupSum(live, (l) => kindOf[l.userId], (l) => l.principal).map((r) => ({ ...r, note: `${r.n} loans` }))} fmt={crore} /></div>
      </div>
      <div className="box">
        <b>📒 Loans chosen by customers</b>
        <div className="table-wrap">
          <table className="sku-table">
            <thead><tr><th>Loan</th><th>Customer</th><th>Product</th><th>Lender chosen</th><th>Amount</th><th>Rate / APR</th><th>Repayment</th><th>Meesho fee</th><th>Consent</th><th>Status</th></tr></thead>
            <tbody>
              {d.loans.map((l) => (
                <tr key={l.id}>
                  <td><code>{l.id}</code><small className="muted block">{when(l.disbursedAt)}</small></td>
                  <td>{l.userName}<small className="muted block">{kindOf[l.userId]}</small></td>
                  <td>{l.product}</td>
                  <td>{l.partnerName}</td>
                  <td>{inr(l.principal)}</td>
                  <td>{l.rate}% / {l.apr}%</td>
                  <td>{inr(l.emi)} × {l.tenure}{d.products[l.productKey]?.days ? ' days' : ''}</td>
                  <td>{inr(l.meeshoFee)}</td>
                  <td><code>{l.consentId}</code></td>
                  <td><span className={'pill ' + (l.status === 'active' ? 'green' : l.status === 'cooling-off' ? 'amber' : '')}>{l.status}{l.status === 'cooling-off' ? ` · ${l.coolingHoursLeft}h` : ''}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
          {!d.loans.length && <p className="muted">No customer has taken a loan yet.</p>}
        </div>
      </div>
    </div>
  )
}

/** Insurance: read-only view of covers customers have opted into, default crew covers and claims. */
function Insurance({ d }) {
  const sellers = d.users.filter((u) => u.kind === 'seller')
  const crew = d.users.filter((u) => ['pilot', 'captain', 'driver'].includes(u.kind))
  const opted = sellers.flatMap((u) => u.policies.filter((p) => p.on).map((p) => ({ ...p, user: u })))
  const crewCovers = crew.flatMap((u) => u.policies.filter((p) => p.on).map((p) => ({ ...p, user: u })))
  const paid = d.claims.reduce((s, c) => s + c.amount, 0)
  const offered = sellers.reduce((s, u) => s + u.policies.length, 0)
  return (
    <div className="ops-stack">
      <div className="monitor-note">👁 {MONITOR}</div>
      <div className="kpis">
        <div className="kpi purple"><small>Seller covers opted in</small><b>{opted.length}</b><small className="kpi-sub">of {offered} offered · {Math.round((opted.length / Math.max(1, offered)) * 100)}% uptake</small></div>
        <div className="kpi"><small>Crew covers (default)</small><b>{crewCovers.length}</b><small className="kpi-sub">{crew.length} Valmo crew insured</small></div>
        <div className="kpi green"><small>Claims auto-paid</small><b>{inr(paid)}</b><small className="kpi-sub">{d.claims.length} claims · 0 documents</small></div>
        <div className="kpi"><small>Insurers</small><b>{new Set([...opted, ...crewCovers].map((p) => p.insurerName)).size}</b></div>
      </div>
      <div className="fin-cols">
        <div className="box"><b>Opted-in covers by product</b><Bars rows={groupSum(opted, 'label', () => 1)} fmt={(n) => n} /></div>
        <div className="box"><b>All covers by insurer</b><Bars rows={groupSum([...opted, ...crewCovers], 'insurerName', () => 1)} fmt={(n) => n} /></div>
      </div>
      <div className="box">
        <b>🏪 Seller covers — chosen by the seller</b>
        <div className="table-wrap">
          <table className="sku-table">
            <thead><tr><th>Seller</th><th>Cover</th><th>Insurer</th><th>Premium</th><th>Opted in</th><th>Status</th></tr></thead>
            <tbody>
              {opted.map((p) => (
                <tr key={p.user.id + p.key}>
                  <td><b>{p.user.name}</b></td>
                  <td>{p.label}<small className="muted block">{p.cover}</small></td>
                  <td>{p.insurerName}</td>
                  <td>₹{p.price} {p.unit}</td>
                  <td>{p.since ? when(p.since) : '—'}</td>
                  <td><span className="pill green">Active</span></td>
                </tr>
              ))}
            </tbody>
          </table>
          {!opted.length && <p className="muted">No seller has opted into a cover yet.</p>}
        </div>
      </div>
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
      <div className="box">
        <b>⚡ Zero-paperwork claims</b>
        <table className="sku-table">
          <thead><tr><th>Claim</th><th>Order</th><th>Trigger</th><th>Paid</th><th>When</th></tr></thead>
          <tbody>
            {d.claims.map((c) => <tr key={c.id}><td><code>{c.id}</code></td><td>{c.orderId} · {c.item}</td><td>{c.trigger}</td><td>{inr(c.amount)}</td><td>{when(c.at)}</td></tr>)}
          </tbody>
        </table>
        {!d.claims.length && <p className="muted">No claims yet.</p>}
      </div>
    </div>
  )
}

/** DPDP consents: read-only list of active consent artefacts plus consent analytics. */
function Consents({ d }) {
  const now = Date.now()
  const active = d.consents.filter((c) => !c.withdrawnAt && c.expiresAt > now).sort((a, b) => b.givenAt - a.givenAt)
  const withdrawn = d.consents.filter((c) => c.withdrawnAt).length
  const nameOf = Object.fromEntries(d.users.map((u) => [u.id, u.name]))
  const soon = active.filter((c) => c.expiresAt - now < 30 * 86400000).length
  return (
    <div className="ops-stack">
      <div className="monitor-note">👁 Monitoring only — consents are given and withdrawn by the customer in their own app (“My consents”). FinHub sees the audit trail, never the controls.</div>
      <div className="kpis">
        <div className="kpi purple"><small>Active consents</small><b>{active.length}</b><small className="kpi-sub">{new Set(active.map((c) => c.userId)).size} customers</small></div>
        <div className="kpi"><small>Partners receiving data</small><b>{new Set(active.map((c) => c.partnerId)).size}</b></div>
        <div className="kpi"><small>Withdrawn by customers</small><b>{withdrawn}</b></div>
        <div className="kpi amber"><small>Expiring in 30 days</small><b>{soon}</b><small className="kpi-sub">valid {d.dpdp.consentValidityDays} days · data kept {d.dpdp.retentionDays} days</small></div>
      </div>
      <div className="fin-cols">
        <div className="box"><b>Active consents by partner</b><Bars rows={groupSum(active, 'partnerName', () => 1)} fmt={(n) => n} /></div>
        <div className="box"><b>Active consents by purpose</b><Bars rows={groupSum(active, (c) => d.products[c.productKey]?.label ?? c.purpose, () => 1)} fmt={(n) => n} /></div>
      </div>
      <div className="box">
        <b>🔒 Active consents (DPDP Act 2023)</b>
        <div className="table-wrap">
          <table className="sku-table">
            <thead><tr><th>Consent ID</th><th>Customer</th><th>Shared with</th><th>Purpose</th><th>Data</th><th>Given</th><th>Valid till</th><th>Status</th></tr></thead>
            <tbody>
              {active.map((c) => (
                <tr key={c.id}>
                  <td><code>{c.id}</code></td>
                  <td>{nameOf[c.userId] ?? c.userId}</td>
                  <td>{c.partnerName}</td>
                  <td>{c.purpose}</td>
                  <td><small>{c.fields.join(', ')}</small></td>
                  <td>{when(c.givenAt)}</td>
                  <td>{new Date(c.expiresAt).toLocaleDateString('en-IN')}</td>
                  <td><span className="pill green">Active</span></td>
                </tr>
              ))}
            </tbody>
          </table>
          {!active.length && <p className="muted">No active consents.</p>}
        </div>
        <div className="dpdp-terms">
          <span>👁 Right to access & correct</span><span>🗑 Right to erasure</span><span>📮 DPO: {d.dpdp.dpo.email}</span><span>⚖ Grievance: {d.dpdp.grievance.email}</span>
        </div>
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
    ['Multi-lender transparency', 'The customer’s loan screen shows every eligible lender side by side, cheapest APR first.'],
    ['Key Fact Statement before signing', 'Full KFS with APR, fees, every instalment, recovery & grievance — must be read to proceed.'],
    ['3-day cooling-off', 'Customers cancel without penalty from their own app; FinHub tracks cooling-off status.'],
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
  const { data: d } = useFetch(() => api.finance.overview(), [])
  const go = (k) => setParams({ tab: k })
  const view = useMemo(() => {
    if (!d) return null
    if (tab === 'partners') return <Partners d={d} />
    if (tab === 'scores') return <Scores d={d} />
    if (tab === 'loans') return <LoanBook d={d} />
    if (tab === 'insurance') return <Insurance d={d} />
    if (tab === 'consents') return <Consents d={d} />
    if (tab === 'board') return <Board />
    if (tab === 'rules') return <Rules />
    return <Overview d={d} go={go} />
  }, [d, tab]) // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <main className="page ops finance">
      <div className="ops-head">
        <div>
          <h2>Meesho FinHub</h2>
          <small className="muted">Monitoring dashboard for embedded credit & insurance through partner banks, NBFCs and insurers — Meesho as Lending Service Provider and Corporate Agent. DPDP-compliant consent on every data share.</small>
        </div>
        <nav className="ops-tabs wrap">
          {TABS.map(([k, l]) => <button key={k} className={tab === k ? 'sel' : ''} onClick={() => go(k)}>{l}</button>)}
        </nav>
      </div>
      {!d ? <div className="loading">Loading FinHub…</div> : view}
    </main>
  )
}
