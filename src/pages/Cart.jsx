import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api } from '../api.js'
import { inr, useApp } from '../store.jsx'
import { useFetch } from '../useFetch.js'
import products from '../data/products.json'
import ProductCard, { img } from '../components/ProductCard.jsx'
import { track } from '../tracking/tracker.js'

const byId = Object.fromEntries(products.map((p) => [p.id, p]))
const NUDGE_ICON = { nudge_delivery: '🚚', nudge_cod: '💵', nudge_tier1: '🏷️', nudge_bnpl: '💳' }

function NudgeBar({ n }) {
  const { t } = useApp()
  return (
    <div className={'nudge' + (n.done ? ' done' : '')}>
      <span>{n.done ? '🎉' : NUDGE_ICON[n.key]} {t(n.key, n.vars)}</span>
      {n.progress !== undefined && (
        <div className="progress"><div style={{ width: `${Math.min(100, n.progress * 100)}%` }} /></div>
      )}
    </div>
  )
}

function Bnpl({ bnpl, plan, setPlan }) {
  const { t } = useApp()
  return (
    <div className="bnpl">
      <div className="bnpl-head">
        <b>{t('bnplTitle')}</b>
        <span className="limit">{t('bnplLimit', { amount: bnpl.limit.toLocaleString('en-IN') })}</span>
      </div>
      {bnpl.plans.map((p) => (
        <label key={p.id} className={'plan' + (p.eligible ? '' : ' disabled') + (plan === p.id ? ' sel' : '')}>
          <input type="radio" name="plan" disabled={!p.eligible} checked={plan === p.id} onChange={() => setPlan(p.id)} />
          <div>
            <b>{t(p.id)}</b>
            <small>{p.eligible ? t(p.id + '_d', p.vars) : t(p.reason.key, p.reason.vars)}</small>
          </div>
        </label>
      ))}
      <details>
        <summary>{t('bnplWhy')}</summary>
        <ul className="factors">
          {bnpl.factors.map((f) => (
            <li key={f.key} className={f.good ? 'good' : 'bad'}>{f.good ? '✓' : '!'} {t(f.key, f.vars)}</li>
          ))}
        </ul>
      </details>
    </div>
  )
}

export default function Cart() {
  const { profile, cart, setCart, addToCart, nudges, t, tx } = useApp()
  const navigate = useNavigate()
  const [payment, setPayment] = useState(profile.payment === 'COD' ? 'COD' : 'UPI')
  const [plan, setPlan] = useState(null)
  const [placing, setPlacing] = useState(false)
  const key = JSON.stringify(cart)
  const { data: q } = useFetch(
    () => api.quote({ lines: cart, personaId: profile.id, payment, nudges }),
    [key, profile.id, payment, nudges],
  )

  const setQty = (i, qty) => {
    const line = cart[i]
    if (line) track(qty <= 0 ? 'remove_from_cart' : qty > line.qty ? 'add_to_cart' : 'cart_qty_down', { productId: line.productId, qty: Math.abs(qty - line.qty), price: byId[line.productId]?.price, category: byId[line.productId]?.category })
    setCart((c) => (qty <= 0 ? c.filter((_, j) => j !== i) : c.map((l, j) => (j === i ? { ...l, qty } : l))))
  }

  if (!cart.length) {
    return (
      <main className="page empty">
        <div className="empty-icon">🛒</div>
        <h2>{t('emptyCart')}</h2>
        <Link to="/" className="btn-primary">{t('startShopping')}</Link>
      </main>
    )
  }

  const bnplPlanValid = payment !== 'BNPL' || q?.bnpl?.plans.find((p) => p.id === plan)?.eligible
  const place = async () => {
    setPlacing(true)
    const order = await api.placeOrder({ lines: cart, personaId: profile.id, payment, plan: payment === 'BNPL' ? plan : null, nudges })
    track('purchase', {
      orderId: order.id, total: order.total, payment, plan: payment === 'BNPL' ? plan : null,
      items: cart.map((l) => ({ productId: l.productId, qty: l.qty, bundleId: l.bundleId ?? null, price: byId[l.productId]?.price })),
      personalDiscount: q?.personalDiscount ?? 0, offerCode: q?.offer?.code ?? null,
    })
    setCart([])
    navigate(`/track/${order.id}?new=1`)
  }

  return (
    <main className="page cart-page">
      <div className="cart-main">
        {q?.nudges?.length > 0 && (
          <div className="nudges">
            {q.nudges.map((n) => <NudgeBar key={n.key} n={n} />)}
          </div>
        )}
        <div className="cart-lines">
          {cart.map((l, i) => {
            const p = byId[l.productId]
            const qi = q?.items?.find((x) => x.productId === l.productId && (x.bundleId ?? null) === (l.bundleId ?? null))
            return (
              <div key={l.productId + (l.bundleId ?? '')} className="cart-line">
                <img src={img(p.image)} alt={p.name} />
                <div className="cl-info">
                  <Link to={`/product/${p.id}`}>{tx(p.name)}</Link>
                  <div className="price-row">
                    <b>{inr(p.price)}</b>
                    <s>{inr(p.mrp)}</s>
                  </div>
                  {l.bundleId && <span className="tag-bundle">{t('completeTheLook')}</span>}
                  {qi?.packPct > 0 && <span className="tag-bundle">{t('packDiscount')} −{qi.packPct}%</span>}
                </div>
                <div className="qty">
                  <button onClick={() => setQty(i, l.qty - 1)}>−</button>
                  <span>{l.qty}</span>
                  <button onClick={() => setQty(i, l.qty + 1)}>+</button>
                </div>
              </div>
            )
          })}
        </div>

        {q?.suggestions?.length > 0 && (
          <section>
            <h3 className="section-title">{t('addToUnlock')}</h3>
            <div className="grid grid-3">
              {q.suggestions.map((p) => <ProductCard key={p.id} p={p} compact onAdd={(x) => addToCart(x.id)} />)}
            </div>
          </section>
        )}
      </div>

      <aside className="cart-side">
        <div className="box">
          <b>{t('paymentMethod')}</b>
          {['COD', 'UPI', 'BNPL'].map((m) => (
            <label key={m} className={'pay' + (payment === m ? ' sel' : '')}>
              <input type="radio" name="pay" checked={payment === m} onChange={() => setPayment(m)} />
              {t(m === 'COD' ? 'pay_cod' : m === 'UPI' ? 'pay_upi' : 'pay_bnpl')}
              {m === 'BNPL' && <em className="new">0%</em>}
            </label>
          ))}
          {payment === 'BNPL' && q?.bnpl && <Bnpl bnpl={q.bnpl} plan={plan} setPlan={setPlan} />}
        </div>

        {q && (
          <div className="box price-box">
            <b>{t('priceDetails')}</b>
            <div className="pd"><span>{t('productTotal')}</span><span>{inr(q.productTotal)}</span></div>
            {q.bundleDiscount > 0 && <div className="pd green"><span>{t('bundleDiscount')}</span><span>−{inr(q.bundleDiscount)}</span></div>}
            {q.packDiscount > 0 && <div className="pd green"><span>{t('packDiscount')}</span><span>−{inr(q.packDiscount)}</span></div>}
            {q.multiItemDiscount > 0 && <div className="pd green"><span>{t('multiItemDiscount')} ({q.tierPct}%)</span><span>−{inr(q.multiItemDiscount)}</span></div>}
            {q.personalDiscount > 0 && <div className="pd green"><span>🎁 {t('personalOffer')} {q.offer.code} ({q.offer.pct}%)</span><span>−{inr(q.personalDiscount)}</span></div>}
            <div className="pd"><span>{t('deliveryFee')}</span><span>{q.deliveryFee ? inr(q.deliveryFee) : <em className="green">FREE</em>}</span></div>
            {q.codFee > 0 && <div className="pd"><span>{t('codFee')}</span><span>{inr(q.codFee)}</span></div>}
            <div className="pd total"><span>{t('orderTotal')}</span><span>{inr(q.total)}</span></div>
            {q.savings + q.mrpSavings > 0 && <div className="save-banner">{t('youSave', { amount: q.savings + q.mrpSavings })}</div>}
            <button className="btn-primary wide" disabled={placing || !bnplPlanValid} onClick={place}>{t('placeOrder')}</button>
          </div>
        )}
      </aside>
    </main>
  )
}
