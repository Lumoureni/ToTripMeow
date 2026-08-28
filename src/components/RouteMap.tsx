import { useEffect, useRef, useState } from 'react'
import { loadAMap } from '../api/amap'
import type { Destination, RouteInfo } from '../types'

type Props = {
  destinations: Destination[]
  route: RouteInfo | null
}

export function RouteMap({ destinations, route }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<any>(null)
  const overlaysRef = useRef<any[]>([])
  const [mapReady, setMapReady] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    const el = containerRef.current
    if (!el) return

    loadAMap()
      .then((AMap) => {
        if (cancelled || mapRef.current) return
        mapRef.current = new AMap.Map(el, {
          zoom: 5,
          center: [104.195397, 35.86166],
          viewMode: '2D',
          mapStyle: 'amap://styles/whitesmoke',
        })
        mapRef.current.addControl(new AMap.ToolBar({ position: { right: '16px', top: '16px' } }))
        mapRef.current.addControl(new AMap.Scale())
        setMapReady(true)
      })
      .catch((err) => {
        if (!cancelled) {
          setError(
            err instanceof Error
              ? err.message
              : '高德地图加载失败。若已开启安全密钥，请在 .env 填写 VITE_AMAP_SECURITY_CODE',
          )
        }
      })

    return () => {
      cancelled = true
      setMapReady(false)
      if (mapRef.current) {
        mapRef.current.destroy()
        mapRef.current = null
      }
    }
  }, [])

  useEffect(() => {
    const map = mapRef.current
    if (!mapReady || !map || !window.AMap) return

    overlaysRef.current.forEach((item) => map.remove(item))
    overlaysRef.current = []

    const AMap = window.AMap
    const markers = destinations.map((d, index) => {
      const marker = new AMap.Marker({
        position: [d.lon, d.lat],
        title: d.name,
        label: {
          content: `<span class="amap-label">${index + 1}</span>`,
          direction: 'top',
        },
      })
      marker.setMap(map)
      return marker
    })
    overlaysRef.current.push(...markers)

    if (route && route.coordinates.length > 1) {
      const path = route.coordinates.map(([lat, lon]) => [lon, lat])
      const line = new AMap.Polyline({
        path,
        strokeColor: '#1a6b63',
        strokeWeight: 6,
        strokeOpacity: 0.9,
        lineJoin: 'round',
        lineCap: 'round',
      })
      map.add(line)
      overlaysRef.current.push(line)
      map.setFitView(overlaysRef.current, false, [48, 48, 48, 48])
      return
    }

    if (destinations.length === 1) {
      map.setZoomAndCenter(12, [destinations[0].lon, destinations[0].lat])
      return
    }

    if (destinations.length > 1) {
      map.setFitView(markers, false, [48, 48, 48, 48])
    }
  }, [destinations, route, mapReady])

  return (
    <div className="map-shell">
      <div ref={containerRef} className="route-map" />
      {error && <p className="map-error">{error}</p>}
    </div>
  )
}
