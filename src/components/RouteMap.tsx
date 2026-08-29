import { useEffect, useRef, useState } from 'react'
import { loadAMap } from '../api/amap'
import type { MapTravelerLayer } from '../types'

type Props = {
  layers: MapTravelerLayer[]
}

export function RouteMap({ layers }: Props) {
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
    const visible = layers.filter((layer) => layer.destinations.length > 0)
    // 当前旅客最后绘制，压在最上层
    const ordered = [...visible].sort((a, b) => Number(Boolean(a.emphasized)) - Number(Boolean(b.emphasized)))

    for (const layer of ordered) {
      const weight = layer.emphasized ? 7 : 5
      const opacity = layer.emphasized ? 0.95 : 0.72

      const markers = layer.destinations.map((d, index) => {
        const marker = new AMap.Marker({
          position: [d.lon, d.lat],
          title: `${layer.name} · ${d.name}`,
          label: {
            content: `<span class="amap-stop-label" style="--stop-color:${layer.color}">${index + 1}</span>`,
            direction: 'top',
            offset: new AMap.Pixel(0, -4),
          },
        })
        marker.setMap(map)
        return marker
      })
      overlaysRef.current.push(...markers)

      if (layer.route && layer.route.coordinates.length > 1) {
        const path = layer.route.coordinates.map(([lat, lon]) => [lon, lat])
        const line = new AMap.Polyline({
          path,
          strokeColor: layer.color,
          strokeWeight: weight,
          strokeOpacity: opacity,
          lineJoin: 'round',
          lineCap: 'round',
          zIndex: layer.emphasized ? 120 : 80,
        })
        map.add(line)
        overlaysRef.current.push(line)
      }
    }

    if (overlaysRef.current.length === 0) {
      map.setZoomAndCenter(5, [104.195397, 35.86166])
      return
    }

    if (overlaysRef.current.length === 1 && visible.length === 1 && visible[0].destinations.length === 1) {
      const only = visible[0].destinations[0]
      map.setZoomAndCenter(12, [only.lon, only.lat])
      return
    }

    map.setFitView(overlaysRef.current, false, [48, 48, 48, 48])
  }, [layers, mapReady])

  return (
    <div className="map-shell">
      <div ref={containerRef} className="route-map" />
      {error && <p className="map-error">{error}</p>}
    </div>
  )
}
