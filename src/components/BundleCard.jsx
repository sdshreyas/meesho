import { Link } from 'react-router-dom'
import { inr, useApp } from '../store.jsx'
import { img } from './ProductCard.jsx'

export default function BundleCard({ bundle, title }) {
  const { t, tx, addToCart } = useApp()
  const addAll = () => bundle.items.forEach((p) => addToCart(p.id, 1, bundle.id))
  return (
    <div className="bundle">
      <div className="bundle-head">
        <b>{title ?? t('completeTheLook')}</b>
        <span className="save-tag">{t('bundleSave', { amount: bundle.savings })}</span>
      </div>
      <div className="bundle-items">
        {bundle.items.map((p, i) => (
          <div key={p.id} className="bundle-item">
            {i > 0 && <span className="plus">+</span>}
            <Link to={`/product/${p.id}`}>
              <img src={img(p.image)} alt={p.name} />
              <small>{tx(p.name)}</small>
              <b>{inr(p.price)}</b>
            </Link>
          </div>
        ))}
      </div>
      <div className="bundle-foot">
        <div>
          <small>{t('bundlePrice')}</small>
          <div className="price-row">
            <b>{inr(bundle.price)}</b>
            <s>{inr(bundle.total)}</s>
          </div>
        </div>
        <button className="btn-primary" onClick={addAll}>{t('addBundle')}</button>
      </div>
    </div>
  )
}
