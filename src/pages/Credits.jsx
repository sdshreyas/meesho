import credits from '../data/credits.json'
import products from '../data/products.json'
import { useApp } from '../store.jsx'
import { img } from '../components/ProductCard.jsx'

const byId = Object.fromEntries(products.map((p) => [p.id, p]))

export default function Credits() {
  const { t } = useApp()
  return (
    <main className="page">
      <h3 className="section-title">{t('credits')}</h3>
      <p className="muted">
        Products P001–P100 use sample photos from the free dummyjson.com API. Additional photos below come from Wikimedia Commons (free licences, credited) and the FakeStore sample API.
      </p>
      <div className="credits-list">
        {credits.map((c) => (
          <a key={c.id} className="credit" href={c.page} target="_blank" rel="noreferrer">
            <img src={img(byId[c.id].image)} alt="" />
            <span>
              <b>{c.name}</b><br />
              {c.title} · {c.artist} · {c.license}
            </span>
          </a>
        ))}
      </div>
    </main>
  )
}
