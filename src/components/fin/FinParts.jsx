// Smaller FinHub building blocks: insurance toggles, Valmo dispatch shield with
// auto-claims, DPDP consent centre and the FinSahayak advisor chat.
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { api } from '../../api.js'
import { useApp } from '../../store.jsx'
import { partnerById } from '../../finance/data.js'
import products from '../../data/products.json'

const inr = (n) => '₹' + Math.round(n).toLocaleString('en-IN')
const when = (t) => new Date(t).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })

/** Opt-in insurance (never pre-ticked); default crew covers shown as active. */
export function Policies({ user, onChange, only }) {
  const [busy, setBusy] = useState(null)
  const list = user.policies.filter((p) => !only || only.includes(p.key))
  const toggle = async (p) => {
    setBusy(p.key)
    await api.finance.policy({ userId: user.id, key: p.key, on: !p.on })
    await onChange?.()
    setBusy(null)
  }
  return (
    <div className="policies">
      {list.map((p) => (
        <div key={p.key} className={'policy' + (p.on ? ' on' : '')}>
          <div>
            <b>{p.label}</b> {p.default && <span className="pill green">Default · paid by Valmo</span>}
            <small className="muted block">{p.insurerName} · ₹{p.price} {p.unit}</small>
            <small className="block">{p.cover}</small>
          </div>
          {p.default ? (
            <span className="pill green">✓ Active</span>
          ) : (
            <button className={p.on ? 'btn-done' : 'btn-outline'} disabled={busy === p.key} onClick={() => toggle(p)}>{p.on ? 'Insured ✓' : 'Opt in'}</button>
          )}
        </div>
      ))}
      <small className="muted">IRDAI: Meesho acts as Corporate Agent. Seller covers are opt-in only — never pre-ticked; the policy starts once the premium reaches the insurer.</small>
    </div>
  )
}

/** Today's Valmo pickups with the ₹2/parcel shield (unchecked by default) and a hub-scan claim simulator. */
export function DispatchShield({ user, sellerId, onChange }) {
  const shield = user.policies.find((p) => p.key === 'transit_shield')
  const [claims, setClaims] = useState([])
  const [busy, setBusy] = useState(null)
  const mine = products.filter((p) => p.sellerId === sellerId).slice(0, 6)
  const orders = mine.map((p, i) => ({ id: `MSH-${88210 + i * 7}`, item: p.name, value: p.price, hub: ['Nagpur Valmo Base', 'Gurugram Sort Centre', 'Lucknow Valmo Base', 'Bhiwandi Sort Centre'][i % 4] }))
  const toggle = async () => {
    await api.finance.policy({ userId: user.id, key: 'transit_shield', on: !shield.on })
    await onChange?.()
  }
  const damage = async (o) => {
    setBusy(o.id)
    if (shield.on) {
      const c = await api.finance.claim({ userId: user.id, orderId: o.id, item: o.item, value: o.value, hub: o.hub })
      setClaims((x) => [c, ...x])
    } else {
      setClaims((x) => [{ id: 'none-' + o.id, orderId: o.id, item: o.item, amount: 0, uninsured: true, hub: o.hub, at: Date.now() }, ...x])
    }
    setBusy(null)
  }
  return (
    <div className="box">
      <b>📦 Today's Valmo pickups ({orders.length} parcels)</b>
      <label className={'shield-banner' + (shield?.on ? ' on' : '')}>
        <input type="checkbox" checked={!!shield?.on} onChange={toggle} />
        <span>
          <b>Valmo Transit & RTO Shield — ₹2 per parcel</b> (total {inr(orders.length * 2)} today) · powered by Acko
          <small className="block">Up to ₹1,000 per parcel against loss, theft, water damage or torn packaging. Policy number issued at the Valmo pickup scan. Unticked by default (IRDAI).</small>
        </span>
      </label>
      <table className="sku-table">
        <thead><tr><th>Order</th><th>Item</th><th>Value</th><th>Status</th><th /></tr></thead>
        <tbody>
          {orders.map((o) => {
            const c = claims.find((x) => x.orderId === o.id)
            return (
              <tr key={o.id}>
                <td>{o.id}</td>
                <td>{o.item}</td>
                <td>{inr(o.value)}</td>
                <td>{c ? (c.uninsured ? <span className="pill red">Damaged — not insured</span> : <span className="pill green">₹{c.amount} auto-credited</span>) : shield?.on ? <span className="pill green">Shielded</span> : <span className="muted">Not insured</span>}</td>
                <td>{!c && <button className="btn-mini" disabled={busy === o.id} onClick={() => damage(o)}>Simulate hub damage scan</button>}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
      {claims.filter((c) => !c.uninsured).map((c) => (
        <div key={c.id} className="claim-toast">🔔 Valmo hub scan at {c.hub} detected damage on {c.orderId}. <b>{inr(c.amount)} claim auto-credited</b> to your payout · {c.id} · 0 documents asked.</div>
      ))}
    </div>
  )
}

// short tag for each shared data field
const FIELD_LABEL = {
  cod: 'COD acceptance', orders: 'Order history', repay: 'Repayment record', kyc: 'KYC', sales: 'Sales ledger',
  dispatch: 'Valmo dispatch', returns: 'Returns & RTO', ads: 'Ads ROAS', tenure: 'Tenure', resale: 'Resale orders',
  margin: 'Margin', earnings: 'Earnings', success: 'Delivery success', attendance: 'Attendance', handling: 'Airhub handling',
  sla: 'Airhub SLA', trips: 'Line-haul trips',
}

/** DPDP: every consent artefact, with one-click withdrawal and the user's rights. */
export function ConsentCenter({ consents, dpdp, onChange, userName, readOnly }) {
  const [busy, setBusy] = useState(null)
  const [note, setNote] = useState(null)
  useEffect(() => {
    if (!note) return
    const t = setTimeout(() => setNote(null), 6000)
    return () => clearTimeout(t)
  }, [note])
  const withdraw = async (c) => {
    setBusy(c.id)
    await api.finance.withdraw(c.id)
    await onChange?.()
    setBusy(null)
    setNote(c)
  }
  return (
    <div className="box consents-card">
      <b>🔒 My consents (DPDP Act 2023)</b>
      <small className="muted">Every data share is a separate, purpose-bound, time-bound consent you can withdraw in one click. Withdrawal stops future sharing; lenders must delete your data after the retention period.</small>
      <div className="table-wrap">
        <table className="sku-table consent-table">
          <thead><tr><th>Consent ID</th><th>User</th><th>Shared with</th><th>Purpose</th><th>Data</th><th>Given</th><th>Valid till</th><th>Status</th></tr></thead>
          <tbody>
            {consents.map((c) => {
              const active = !c.withdrawnAt && c.expiresAt > Date.now()
              return (
                <tr key={c.id} className={active ? '' : 'revoked'}>
                  <td><code>{c.id}</code></td>
                  <td>{userName ?? c.userId}<small className="muted block">{c.userId}</small></td>
                  <td>{c.partnerName}</td>
                  <td>{c.purpose}</td>
                  <td><div className="data-tags">{c.fields.map((f) => <span key={f} className="data-tag">{FIELD_LABEL[f] ?? f}</span>)}</div></td>
                  <td>{when(c.givenAt)}</td>
                  <td className="nowrap">{new Date(c.expiresAt).toLocaleDateString('en-IN')}</td>
                  <td><div className="consent-status">
                    {active ? <span className="pill green">Active</span> : <span className={'pill ' + (c.withdrawnAt ? 'red' : 'gray')}>{c.withdrawnAt ? 'Withdrawn' : 'Expired'}</span>}
                    {!readOnly && (active
                      ? <button className="btn-withdraw" disabled={busy === c.id} onClick={() => withdraw(c)}>{busy === c.id ? '…' : 'Withdraw'}</button>
                      : c.withdrawnAt && <button className="btn-withdraw" disabled>Revoked</button>)}
                  </div></td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {!consents.length && <p className="muted">No data has been shared with any partner.</p>}
      </div>
      {dpdp && (
        <div className="dpdp-terms">
          <span>⚙️ Right to access & correct</span><span>🗑️ Right to erasure</span><span>🛡️ DPO: {dpdp.dpo.email}</span><span>✉️ Grievance: {dpdp.grievance.email}</span>
        </div>
      )}
      {note && createPortal(
        <div className="consent-toast" role="status">
          <b>✅ Consent withdrawn · {note.id}</b>
          <span>Future data sharing with {note.partnerName} has been stopped under the DPDP Act 2023. They may keep already-shared data only for the {dpdp?.retentionDays ?? 180}-day retention period, then must delete it.</span>
          <button className="link" onClick={() => setNote(null)}>Dismiss</button>
        </div>,
        document.body,
      )}
    </div>
  )
}

/** FinSahayak: plain-language finance helper (Gemini with the saved key, else built-in answers). */
export function FinSahayak({ userId, name }) {
  const { lang } = useApp()
  const [msgs, setMsgs] = useState([{ role: 'bot', text: `Namaste ${name.split(' ')[0]}! I'm FinSahayak 🙏 Ask me about your Trust Score, loans, EMIs or insurance.` }])
  const [q, setQ] = useState('')
  const [busy, setBusy] = useState(false)
  const end = useRef(null)
  useEffect(() => {
    end.current?.scrollIntoView({ block: 'nearest' }) // returns a Promise in newer browsers — don't hand it to React
  }, [msgs])
  const key = (() => {
    try {
      return localStorage.getItem('meesho.gemini.key') ?? ''
    } catch {
      return ''
    }
  })()
  const ask = async (text) => {
    if (!text.trim()) return
    const history = msgs.filter((m) => m.role !== 'bot' || msgs.indexOf(m) > 0).map((m) => ({ role: m.role === 'user' ? 'user' : 'model', text: m.text }))
    setMsgs((m) => [...m, { role: 'user', text }])
    setQ('')
    setBusy(true)
    const r = await api.finance.advisor({ userId, question: text, history, apiKey: key, language: lang }).catch((e) => ({ answer: e.message, source: 'error' }))
    setMsgs((m) => [...m, { role: 'bot', text: r.answer, source: r.source }])
    setBusy(false)
  }
  const render = (t) => t.split('\n').map((line, i) => <p key={i} dangerouslySetInnerHTML={{ __html: line.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/\*\*(.+?)\*\*/g, '<b>$1</b>') }} />)
  return (
    <div className="box sahayak">
      <div className="box-head"><b>🙏 FinSahayak — your finance helper</b><small className="muted">{key ? 'Gemini' : 'Built-in answers (add a Gemini key at login for AI)'}</small></div>
      <div className="chat">
        {msgs.map((m, i) => (
          <div key={i} className={'bubble ' + m.role}>{render(m.text)}{m.source && <small className="muted">{m.source}</small>}</div>
        ))}
        {busy && <div className="bubble bot">…</div>}
        <div ref={end} />
      </div>
      <div className="chips">
        {['How can I improve my score?', 'Which loan is cheapest?', 'Is the ₹2 shield worth it?', 'What is a KFS?'].map((s) => <button key={s} className="chip" onClick={() => ask(s)}>{s}</button>)}
      </div>
      <form className="chat-input" onSubmit={(e) => { e.preventDefault(); ask(q) }}>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ask in any language…" />
        <button className="btn-primary sm" disabled={busy}>Send</button>
      </form>
      <small className="muted">FinSahayak explains options; the lender makes the final credit decision.</small>
    </div>
  )
}

export { inr, when, partnerById }
