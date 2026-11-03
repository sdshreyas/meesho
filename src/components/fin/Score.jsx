// Meesho Trust Score gauge (300–900) and the factor breakdown with data sources.

const MIN = 300
const MAX = 900
const BANDS = [
  [300, 580, '#e03131'],
  [580, 640, '#f08c00'],
  [640, 700, '#fab005'],
  [700, 800, '#40c057'],
  [800, 900, '#0ca678'],
]

function arc(cx, cy, r, a0, a1) {
  const p = (a) => [cx + r * Math.cos(a), cy + r * Math.sin(a)]
  const [x0, y0] = p(a0)
  const [x1, y1] = p(a1)
  return `M ${x0} ${y0} A ${r} ${r} 0 ${a1 - a0 > Math.PI ? 1 : 0} 1 ${x1} ${y1}`
}
const angle = (v) => Math.PI + ((v - MIN) / (MAX - MIN)) * Math.PI

export function ScoreGauge({ score, band, size = 220, label = 'Meesho Trust Score' }) {
  const cx = size / 2
  const cy = size / 2 + 6
  const r = size / 2 - 18
  const a = angle(Math.max(MIN, Math.min(MAX, score)))
  return (
    <div className="gauge" style={{ width: size }}>
      <svg viewBox={`0 0 ${size} ${size / 2 + 26}`} width={size} role="img" aria-label={`${label} ${score} out of 900`}>
        {BANDS.map(([lo, hi, c]) => (
          <path key={lo} d={arc(cx, cy, r, angle(lo), angle(hi))} stroke={c} strokeWidth="14" fill="none" strokeLinecap="butt" />
        ))}
        <line x1={cx} y1={cy} x2={cx + (r - 22) * Math.cos(a)} y2={cy + (r - 22) * Math.sin(a)} stroke="var(--text)" strokeWidth="4" strokeLinecap="round" />
        <circle cx={cx} cy={cy} r="7" fill="var(--text)" />
        <text x={cx - r} y={cy + 20} fontSize="10" fill="var(--muted)" textAnchor="middle">300</text>
        <text x={cx + r} y={cy + 20} fontSize="10" fill="var(--muted)" textAnchor="middle">900</text>
      </svg>
      <div className="gauge-num"><b>{score}</b><span>/ 900</span></div>
      <span className={'pill ' + (band?.tone ?? '')}>{band?.label}</span>
      <small className="muted">{label}</small>
    </div>
  )
}

export function ScoreFactors({ factors, compact }) {
  return (
    <div className="factors-list">
      {factors.map((f) => (
        <div key={f.key} className="factor">
          <div className="factor-head">
            <b>{f.label}</b>
            <span className="muted">{Math.round(f.weight * 100)}% weight</span>
            <b className="factor-pts">{f.points}<small>/{f.max}</small></b>
          </div>
          <div className="factor-bar"><i style={{ width: `${(f.points / f.max) * 100}%` }} /></div>
          <small>{f.display}</small>
          {!compact && <small className="factor-src">📡 Captured from: {f.source}</small>}
        </div>
      ))}
    </div>
  )
}
