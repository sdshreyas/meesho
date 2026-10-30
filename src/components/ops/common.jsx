import L from '../../lib/leaflet-global.js'

export const INDIA_CENTER = [22.6, 80.5]

export function money(n) {
  const a = Math.abs(n)
  const sign = n < 0 ? '−' : ''
  if (a >= 1e7) return `${sign}₹${(a / 1e7).toFixed(2)} Cr`
  if (a >= 1e5) return `${sign}₹${(a / 1e5).toFixed(1)} L`
  return `${sign}₹${Math.round(a).toLocaleString('en-IN')}`
}
export const num = (n) => Math.round(n).toLocaleString('en-IN')
export const pct = (x, d = 0) => `${(x * 100).toFixed(d)}%`

export const CATEGORY_COLOR = {
  'Women Fashion': '#d6336c', 'Men Fashion': '#1c7ed6', 'Jewellery & Accessories': '#f59f00', 'Bags & Footwear': '#7048e8',
  'Beauty & Health': '#e64980', 'Home & Kitchen': '#0ca678', Electronics: '#495057', 'Sports & Fitness': '#f76707',
}

export const dcIcon = (dc, variant = 'base', label = 'V') =>
  L.divIcon({
    className: 'dc-pin',
    html: `<span class="dc ${dc.type} ${variant}">${label}</span>`,
    iconSize: dc.type === 'sort' ? [30, 30] : [24, 24],
    iconAnchor: dc.type === 'sort' ? [15, 15] : [12, 12],
  })

export function Kpi({ label, value, sub, tone }) {
  return (
    <div className={'kpi ' + (tone ?? '')}>
      <small>{label}</small>
      <b>{value}</b>
      {sub && <small className="kpi-sub">{sub}</small>}
    </div>
  )
}

export const utilTone = (u) => (u == null ? '' : u > 0.95 ? 'red' : u > 0.8 ? 'amber' : 'green')
