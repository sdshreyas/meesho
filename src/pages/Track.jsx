import { useEffect, useMemo, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { MapContainer, Marker, Polyline, TileLayer, Tooltip, useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { api } from '../api.js'
import { inr, useApp } from '../store.jsx'
import { fmtDate } from './Orders.jsx'

const pin = (emoji, cls = '') =>
  L.divIcon({ className: 'map-pin ' + cls, html: `<span>${emoji}</span>`, iconSize: [34, 34], iconAnchor: [17, 17] })
const ICONS = {
  seller: pin('🏪'),
  hub: pin('🏭', 'small'),
  door: pin('🏠'),
  rider: pin('🛵', 'rider'),
}

function FitBounds({ path }) {
  const map = useMap()
  const key = path.map((p) => p.lat.toFixed(2)).join()
  useEffect(() => {
    map.fitBounds(L.latLngBounds(path.map((p) => [p.lat, p.lng])), { padding: [40, 40] })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])
  return null
}

function FollowRider({ position, on }) {
  const map = useMap()
  useEffect(() => {
    if (on) map.setView([position.lat, position.lng], 14, { animate: true })
  }, [on, position.lat, position.lng, map])
  return null
}

export default function Track() {
  const { id } = useParams()
  const [params] = useSearchParams()
  const { t } = useApp()
  const [snap, setSnap] = useState(null)
  const [follow, setFollow] = useState(false)

  useEffect(() => {
    let alive = true
    const tick = () => api.tracking(id).then((d) => alive && setSnap(d)).catch(() => {})
    tick()
    const iv = setInterval(tick, 1000)
    return () => {
      alive = false
      clearInterval(iv)
    }
  }, [id])

  const tr = snap?.tracking
  const path = useMemo(() => (tr ? tr.fullPath.map((p) => [p.lat, p.lng]) : []), [tr?.orderId]) // eslint-disable-line react-hooks/exhaustive-deps
  if (!snap) return <main className="page"><div className="loading">…</div></main>
  const { order } = snap
  const ofd = tr.status === 'st_ofd'
  const hubs = [tr.stops.origin, tr.stops.sort, tr.stops.dest]

  return (
    <main className="page">
      {params.get('new') && (
        <div className="success-banner">
          ✅ <b>{t('orderPlaced')}</b> {t('orderId')}: {order.id} · {inr(order.total)} {order.plan ? `· ${t(order.plan)}` : ''}
          <Link to="/">{t('continueShopping')} →</Link>
        </div>
      )}
      <div className="track">
        <div className="track-map">
          <MapContainer center={[22.5, 79]} zoom={5} scrollWheelZoom style={{ height: '100%', width: '100%' }}>
            <TileLayer attribution="&copy; OpenStreetMap contributors" url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
            <FitBounds path={tr.fullPath} />
            <FollowRider position={tr.position} on={follow || ofd} />
            <Polyline positions={path} pathOptions={{ color: '#9F2089', weight: 3, dashArray: '6 8', opacity: 0.6 }} />
            <Marker position={[tr.stops.seller.lat, tr.stops.seller.lng]} icon={ICONS.seller}><Tooltip>{order.from.name} · {order.from.city}</Tooltip></Marker>
            {hubs.map((h) => (
              <Marker key={h.name} position={[h.lat, h.lng]} icon={ICONS.hub}><Tooltip>{h.name}</Tooltip></Marker>
            ))}
            <Marker position={[tr.stops.door.lat, tr.stops.door.lng]} icon={ICONS.door}><Tooltip>{order.to.name} · {order.to.city}</Tooltip></Marker>
            {!tr.delivered && <Marker position={[tr.position.lat, tr.position.lng]} icon={ICONS.rider} zIndexOffset={1000}><Tooltip permanent direction="top">{t('liveLocation')}</Tooltip></Marker>}
          </MapContainer>
          <button className="follow-btn" onClick={() => setFollow(!follow)}>{follow ? '🗺 Full route' : '🛵 Follow'}</button>
        </div>

        <div className="track-side">
          <div className="box">
            <small className="muted">{t('orderId')}</small>
            <b className="oid">{order.id}</b>
            <div className={'status-pill big' + (tr.delivered ? ' done' : '')}>{t(tr.status)}</div>
            <p>{t('eta', { date: fmtDate(tr.eta) })}</p>
            <div className="progress"><div style={{ width: `${tr.progress * 100}%` }} /></div>
            <small className="muted">{t('demoSpeed')}</small>
          </div>
          <div className="box">
            <div className="kv"><span>{t('deliveryPartner')}</span><b>Valmo</b></div>
            <div className="kv"><span>{t('rider')}</span><b>{tr.rider.name}</b></div>
            <div className="kv"><span /><small>{tr.rider.vehicle} · {tr.rider.phone}</small></div>
            <div className="kv"><span>{t('shipFrom', { city: order.from.city })}</span></div>
            <div className="kv"><span>{t('shipTo', { city: order.to.city })}</span></div>
          </div>
          <ol className="timeline">
            {tr.events.map((e) => (
              <li key={e.status} className={e.done ? 'done' : ''}>
                <b>{t(e.status)}</b>
                <small>{new Date(e.at).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</small>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </main>
  )
}
