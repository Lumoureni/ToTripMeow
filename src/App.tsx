import { useEffect, useState } from 'react'
import { fetchRoute } from './api/travel'
import { DestinationPlanner } from './components/DestinationPlanner'
import { ExportPanel } from './components/ExportPanel'
import { Hero } from './components/Hero'
import { NearbyGuides } from './components/NearbyGuides'
import { RouteMap } from './components/RouteMap'
import type { Destination, RouteInfo } from './types'
import './App.css'

function formatDuration(minutes: number) {
  if (minutes < 60) return `${Math.round(minutes)} 分钟`
  const h = Math.floor(minutes / 60)
  const m = Math.round(minutes % 60)
  return m === 0 ? `${h} 小时` : `${h} 小时 ${m} 分钟`
}

export default function App() {
  const [destinations, setDestinations] = useState<Destination[]>([])
  const [route, setRoute] = useState<RouteInfo | null>(null)
  const [routeLoading, setRouteLoading] = useState(false)
  const [routeError, setRouteError] = useState<string | null>(null)
  const [activeGuideId, setActiveGuideId] = useState<string | null>(null)

  const addDestination = (place: Destination) => {
    const next: Destination = { ...place, id: crypto.randomUUID() }
    setDestinations((prev) => {
      if (prev.some((d) => Math.abs(d.lat - place.lat) < 1e-5 && Math.abs(d.lon - place.lon) < 1e-5)) {
        return prev
      }
      return [...prev, next]
    })
    setActiveGuideId((id) => id ?? next.id)
  }

  const addDestinations = (places: Destination[]) => {
    const additions = places.map((place) => ({ ...place, id: crypto.randomUUID() }))
    setDestinations((prev) => {
      const next = [...prev]
      for (const place of additions) {
        const exists = next.some(
          (d) => Math.abs(d.lat - place.lat) < 1e-5 && Math.abs(d.lon - place.lon) < 1e-5,
        )
        if (exists) continue
        next.push(place)
      }
      return next
    })
    if (additions[0]) {
      setActiveGuideId((id) => id ?? additions[0].id)
    }
  }

  const removeDestination = (id: string) => {
    setDestinations((prev) => prev.filter((d) => d.id !== id))
    setActiveGuideId((cur) => (cur === id ? null : cur))
  }

  const reorder = (from: number, to: number) => {
    setDestinations((prev) => {
      if (to < 0 || to >= prev.length) return prev
      const next = [...prev]
      const [item] = next.splice(from, 1)
      next.splice(to, 0, item)
      return next
    })
  }

  useEffect(() => {
    if (destinations.length > 0 && !destinations.some((d) => d.id === activeGuideId)) {
      setActiveGuideId(destinations[0].id)
    }
  }, [destinations, activeGuideId])

  useEffect(() => {
    let cancelled = false
    if (destinations.length < 2) {
      setRoute(null)
      setRouteError(null)
      setRouteLoading(false)
      return
    }
    const run = async () => {
      setRouteLoading(true)
      setRouteError(null)
      try {
        const info = await fetchRoute(destinations)
        if (!cancelled) setRoute(info)
      } catch (err) {
        if (!cancelled) {
          setRoute(null)
          setRouteError(err instanceof Error ? err.message : '路线规划失败')
        }
      } finally {
        if (!cancelled) setRouteLoading(false)
      }
    }
    void run()
    return () => {
      cancelled = true
    }
  }, [destinations])

  return (
    <div id="top" className="page">
      <Hero />

      <main>
        <section className="plan" id="plan">
          <DestinationPlanner
            destinations={destinations}
            onAdd={addDestination}
            onAddMany={addDestinations}
            onRemove={removeDestination}
            onReorder={reorder}
          />

          <div className="map-panel">
            <div className="map-meta">
              <h2>路线地图</h2>
              {routeLoading && <p>正在计算路线…</p>}
              {routeError && <p className="error">{routeError}</p>}
              {route && !routeLoading && (
                <p>
                  全程约 <strong>{route.distanceKm.toFixed(1)} km</strong>
                  <span className="dot">·</span>
                  预计 <strong>{formatDuration(route.durationMin)}</strong>
                </p>
              )}
              {!route && !routeLoading && !routeError && (
                <p>{destinations.length < 2 ? '至少添加两个目的地以生成路线。' : '等待路线…'}</p>
              )}
            </div>
            <RouteMap destinations={destinations} route={route} />
            <ExportPanel destinations={destinations} route={route} />
          </div>
        </section>

        <NearbyGuides
          destinations={destinations}
          activeId={activeGuideId}
          onSelectDestination={setActiveGuideId}
        />
      </main>

      <footer className="site-footer">
        <p>To Trip · 地图与周边数据由高德地图提供</p>
      </footer>
    </div>
  )
}
