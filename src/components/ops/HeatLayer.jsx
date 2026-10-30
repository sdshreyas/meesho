import { useEffect } from 'react'
import { useMap } from 'react-leaflet'
import L from '../../lib/leaflet-global.js'
import 'leaflet.heat'

/** points: [[lat, lng, intensity 0..1], ...] */
export default function HeatLayer({ points, radius = 32, blur = 24, gradient }) {
  const map = useMap()
  useEffect(() => {
    if (!points?.length) return
    const layer = L.heatLayer(points, { radius, blur, max: 1, minOpacity: 0.3, gradient }).addTo(map)
    return () => map.removeLayer(layer)
  }, [map, points, radius, blur, gradient])
  return null
}
