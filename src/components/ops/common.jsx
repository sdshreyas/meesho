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

export const dcIcon = (dc, variant = 'base', label) =>
  L.divIcon({
    className: 'dc-pin',
    html: `<span class="dc ${dc.type} ${variant}">${label ?? (dc.type === 'sort' ? 'SC' : 'B')}</span>`,
    iconSize: dc.type === 'sort' ? [32, 32] : [24, 24],
    iconAnchor: dc.type === 'sort' ? [16, 16] : [12, 12],
  })

export const airhubIcon = L.divIcon({ className: 'dc-pin', html: '<span class="ah">A</span>', iconSize: [16, 16], iconAnchor: [8, 8] })

export const STAGE_COLOR = {
  firstMile: '#f59f00', sourceSort: '#9f2089', lineHaul: '#1c7ed6', destSort: '#7048e8', lastMile: '#0ca678', rto: '#e03131',
  toAirhub: '#f59f00', toSc: '#d6336c', waitSc: '#ffa8a8', lineHaul_t: '#1c7ed6', toDestAirhub: '#7048e8', waitAirhub: '#b197fc', outForDelivery: '#0ca678', partner: '#868e96',
}

export function FlowStrip() {
  const steps = [
    ['🏪', 'Seller', 'Order manifested'],
    ['🛵', '1 · First mile', 'Valmo Pilot → Airhub (Captain)'],
    ['🏭', '2 · Source sort', 'Valmo Base / Sort Centre · Handlers batch by region'],
    ['🚛', '3 · Line haul', 'Partnered trucks between sort centres'],
    ['🏭', '4 · Destination sort', 'Re-sorted into local routes'],
    ['🛵', '5 · Last mile', 'Airhub Pilots → doorstep'],
  ]
  return (
    <div className="flow-strip">
      {steps.map(([icon, t, d], i) => (
        <div key={t} className="flow-step">
          <span className="flow-icon">{icon}</span>
          <b>{t}</b>
          <small>{d}</small>
          {i < steps.length - 1 && <i className="flow-arrow">→</i>}
        </div>
      ))}
    </div>
  )
}

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
