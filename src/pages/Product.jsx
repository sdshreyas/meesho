import { useEffect, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { track } from '../tracking/tracker.js'
import { api } from '../api.js'
import { inr, useApp } from '../store.jsx'
import { useFetch } from '../useFetch.js'
import { PACK_DISCOUNTS, RESELL_MARKUP } from '../engine/config.js'
import ProductCard, { Rating, Reasons, img } from '../components/ProductCard.jsx'
import BundleCard from '../components/BundleCard.jsx'

const SIZED = ['Women Fashion', 'Men Fashion']
const FOOTWEAR = ['Women Footwear', 'Men Footwear']

export default function Product() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { profile, nudges, addToCart, t, tx } = useApp()
  const nf = nudges ? 1 : 0
  const { data, loading } = useFetch(() => api.product(id, { persona: profile.id, nudges: nf }), [id, profile.id, nf])
  const [size, setSize] = useState(null)
  const [pack, setPack] = useState(1)
  const [added, setAdded] = useState(false)
  const location = useLocation()
  useEffect(() => {
    track('product_view', { productId: id, source: location.state?.from ?? 'direct', query: location.state?.query ?? null })
  }, [id]) // eslint-disable-line react-hooks/exhaustive-deps

  if (loading && !data) return <main className="page"><div className="loading">…</div></main>
  if (!data) return <main className="page">Not found</main>
  const { product: p, seller, bundle, frequentlyBought, similar } = data
  const off = Math.round((1 - p.price / p.mrp) * 100)
  const sizes = SIZED.includes(p.category) ? ['S', 'M', 'L', 'XL', 'XXL'] : FOOTWEAR.includes(p.subcategory) ? ['5', '6', '7', '8', '9'] : null
  const reseller = profile.reseller && nudges
  const packs = [1, ...PACK_DISCOUNTS.map((d) => d.qty).reverse()]
  const packPct = (n) => PACK_DISCOUNTS.find((d) => n >= d.qty)?.pct ?? 0
  const perPiece = (n) => Math.round(p.price * (1 - packPct(n) / 100))

  const add = () => {
    addToCart(p.id, reseller ? pack : 1)
    setAdded(true)
    setTimeout(() => setAdded(false), 1500)
  }

  return (
    <main className="page">
      <div className="pdp">
        <div className="pdp-img">
          <img src={img(p.image)} alt={p.name} />
        </div>
        <div className="pdp-info">
          <h1>{tx(p.name)}</h1>
          <div className="price-row big">
            <b>{inr(p.price)}</b>
            <s>{inr(p.mrp)}</s>
            <span className="off">{t('off_pct', { pct: off })}</span>
          </div>
          <Rating p={p} />
          {p.reasons && <Reasons reasons={p.reasons} />}

          {sizes && (
            <div className="box">
              <b>{t('selectSize')}</b>
              <div className="sizes">
                {sizes.map((s) => (
                  <button key={s} className={size === s ? 'sel' : ''} onClick={() => setSize(s)}>{s}</button>
                ))}
              </div>
            </div>
          )}

          {reseller && (
            <div className="box packs">
              <b>{t('resellerPacks')}</b>
              <div className="pack-row">
                {packs.map((n) => (
                  <button key={n} className={'pack' + (pack === n ? ' sel' : '')} onClick={() => setPack(n)}>
                    <b>{t('packOf', { n })}</b>
                    <span>{t('perPiece', { amount: perPiece(n) })}</span>
                    {packPct(n) > 0 && <em>{t('off_pct', { pct: packPct(n) })}</em>}
                  </button>
                ))}
              </div>
              <small className="muted">
                {t('marginHint', { price: Math.round(p.price * RESELL_MARKUP), profit: Math.round(p.price * RESELL_MARKUP) - perPiece(pack) })}
              </small>
            </div>
          )}

          <div className="pdp-actions">
            <button className="btn-outline" onClick={add}>{added ? t('added') + ' ✓' : t('addToCart')}</button>
            <button className="btn-primary" onClick={() => { addToCart(p.id, reseller ? pack : 1); navigate('/cart') }}>{t('buyNow')}</button>
          </div>

          <div className="box">
            <b>{t('productDetails')}</b>
            <p className="muted">{p.description}</p>
            <small className="muted">{tx(p.category)} · {tx(p.subcategory)} · {p.id}</small>
          </div>
          {seller && (
            <div className="box seller-mini">
              <span>{t('soldBy')}</span> <b>{seller.name}</b> <small className="muted">· {t('shipFrom', { city: seller.city })}</small>
            </div>
          )}
        </div>
      </div>

      {bundle && (
        <section className="pdp-bundle">
          <BundleCard bundle={bundle} />
        </section>
      )}

      {frequentlyBought?.length > 0 && (
        <section>
          <h3 className="section-title">{t('frequentlyBought')}</h3>
          <div className="grid grid-6">
            {frequentlyBought.map((x) => <ProductCard key={x.id} p={x} compact from="fbt" onAdd={(q) => addToCart(q.id)} />)}
          </div>
        </section>
      )}

      <section>
        <h3 className="section-title">{t('similarProducts')}</h3>
        <div className="grid grid-6">
          {similar.map((x) => <ProductCard key={x.id} p={x} from="similar" />)}
        </div>
      </section>
    </main>
  )
}
