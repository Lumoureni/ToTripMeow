import { useEffect, useRef, useState } from 'react'
import { fetchRoute } from './api/travel'
import {
  apiAddUser,
  apiClearActiveTrip,
  apiGetWorkspace,
  apiHealth,
  apiPutActiveTrip,
  apiRemoveUser,
  apiRenameUser,
  apiSwitchUser,
} from './api/workspaceApi'
import { DestinationPlanner } from './components/DestinationPlanner'
import { ExportPanel } from './components/ExportPanel'
import { Hero } from './components/Hero'
import { NearbyGuides } from './components/NearbyGuides'
import { RouteMap } from './components/RouteMap'
import { UserWorkspace } from './components/UserWorkspace'
import {
  addUser,
  clearActiveTrip,
  formatSavedAt,
  getActiveUser,
  loadWorkspace,
  removeUser,
  renameUser,
  saveWorkspace,
  switchUser,
  upsertActiveTrip,
  type Workspace,
} from './utils/tripStorage'
import type { Destination, RouteInfo } from './types'
import './App.css'

function formatDuration(minutes: number) {
  if (minutes < 60) return `${Math.round(minutes)} 分钟`
  const h = Math.floor(minutes / 60)
  const m = Math.round(minutes % 60)
  return m === 0 ? `${h} 小时` : `${h} 小时 ${m} 分钟`
}

export default function App() {
  const boot = loadWorkspace()
  const bootUser = getActiveUser(boot)

  const [workspace, setWorkspace] = useState<Workspace>(boot)
  const workspaceRef = useRef(workspace)
  workspaceRef.current = workspace

  const [destinations, setDestinations] = useState<Destination[]>(bootUser.destinations)
  const [activeGuideId, setActiveGuideId] = useState<string | null>(bootUser.activeGuideId)
  const [savedAt, setSavedAt] = useState<string | null>(bootUser.savedAt)
  const [route, setRoute] = useState<RouteInfo | null>(null)
  const [routeLoading, setRouteLoading] = useState(false)
  const [routeError, setRouteError] = useState<string | null>(null)
  const [hydrated, setHydrated] = useState(false)
  const [backendOnline, setBackendOnline] = useState(false)
  const [syncHint, setSyncHint] = useState<string | null>(null)
  const skipNextSave = useRef(false)

  const activeUser = getActiveUser(workspace)

  const applyUserTrip = (nextWorkspace: Workspace, options?: { skipSave?: boolean }) => {
    const user = getActiveUser(nextWorkspace)
    if (options?.skipSave) skipNextSave.current = true
    workspaceRef.current = nextWorkspace
    saveWorkspace(nextWorkspace)
    setWorkspace(nextWorkspace)
    setDestinations(user.destinations)
    setActiveGuideId(user.activeGuideId)
    setSavedAt(user.savedAt)
    setRoute(null)
    setRouteError(null)
  }

  useEffect(() => {
    let cancelled = false
    const bootFromServer = async () => {
      try {
        const health = await apiHealth()
        if (cancelled) return
        setBackendOnline(health.ok)
        const remote = await apiGetWorkspace()
        if (cancelled) return
        applyUserTrip(remote, { skipSave: true })
        setSyncHint('已连接后端，行程云端同步中')
      } catch {
        if (cancelled) return
        setBackendOnline(false)
        setSyncHint('后端未连接，当前使用本机缓存（请运行 npm run dev）')
      } finally {
        if (!cancelled) setHydrated(true)
      }
    }
    void bootFromServer()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!hydrated) return
    if (skipNextSave.current) {
      skipNextSave.current = false
      return
    }

    // always keep local cache warm
    const local = upsertActiveTrip(workspaceRef.current, destinations, activeGuideId)
    workspaceRef.current = local
    setWorkspace(local)
    setSavedAt(getActiveUser(local).savedAt)

    if (!backendOnline) return

    const timer = window.setTimeout(() => {
      void apiPutActiveTrip(destinations, activeGuideId)
        .then((remote) => {
          workspaceRef.current = remote
          setWorkspace(remote)
          setSavedAt(getActiveUser(remote).savedAt)
          setSyncHint('已同步到后端')
        })
        .catch(() => {
          setBackendOnline(false)
          setSyncHint('后端同步失败，已改回本机保存')
        })
    }, 450)

    return () => window.clearTimeout(timer)
  }, [destinations, activeGuideId, hydrated, backendOnline])

  const runWorkspaceAction = async (action: () => Promise<Workspace>) => {
    // flush current trip locally first
    const flushed = upsertActiveTrip(workspaceRef.current, destinations, activeGuideId)
    workspaceRef.current = flushed
    try {
      if (backendOnline) {
        await apiPutActiveTrip(destinations, activeGuideId)
      }
      const next = await action()
      applyUserTrip(next, { skipSave: true })
      setBackendOnline(true)
      setSyncHint('已同步到后端')
    } catch {
      // offline fallback with local-only mutation already applied by caller if needed
      setBackendOnline(false)
      setSyncHint('后端不可用，已使用本机数据')
      throw new Error('backend offline')
    }
  }

  const handleSwitchUser = (userId: string) => {
    void (async () => {
      try {
        await runWorkspaceAction(async () => {
          if (backendOnline) return apiSwitchUser(userId)
          return switchUser(workspaceRef.current, userId)
        })
      } catch {
        const flushed = upsertActiveTrip(workspaceRef.current, destinations, activeGuideId)
        applyUserTrip(switchUser(flushed, userId), { skipSave: true })
      }
    })()
  }

  const handleAddUser = (name: string) => {
    void (async () => {
      try {
        await runWorkspaceAction(async () => {
          if (backendOnline) return apiAddUser(name)
          return addUser(workspaceRef.current, name)
        })
      } catch {
        const flushed = upsertActiveTrip(workspaceRef.current, destinations, activeGuideId)
        applyUserTrip(addUser(flushed, name), { skipSave: true })
      }
    })()
  }

  const handleRenameUser = (userId: string, name: string) => {
    void (async () => {
      try {
        if (backendOnline) {
          const next = await apiRenameUser(userId, name)
          applyUserTrip(next, { skipSave: true })
        } else {
          applyUserTrip(renameUser(workspaceRef.current, userId, name), { skipSave: true })
        }
      } catch {
        applyUserTrip(renameUser(workspaceRef.current, userId, name), { skipSave: true })
        setBackendOnline(false)
      }
    })()
  }

  const handleRemoveUser = (userId: string) => {
    void (async () => {
      try {
        await runWorkspaceAction(async () => {
          if (backendOnline) return apiRemoveUser(userId)
          return removeUser(workspaceRef.current, userId)
        })
      } catch {
        const flushed = upsertActiveTrip(workspaceRef.current, destinations, activeGuideId)
        applyUserTrip(removeUser(flushed, userId), { skipSave: true })
      }
    })()
  }

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

  const importDestinations = (places: Destination[]) => {
    const next = places.map((place) => ({ ...place, id: crypto.randomUUID() }))
    setDestinations(next)
    setActiveGuideId(next[0]?.id ?? null)
    setRoute(null)
    setRouteError(null)
  }

  const clearLocalTrip = () => {
    void (async () => {
      try {
        if (backendOnline) {
          applyUserTrip(await apiClearActiveTrip(), { skipSave: true })
        } else {
          applyUserTrip(clearActiveTrip(workspaceRef.current), { skipSave: true })
        }
      } catch {
        applyUserTrip(clearActiveTrip(workspaceRef.current), { skipSave: true })
        setBackendOnline(false)
      }
    })()
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

  const savedLabel = formatSavedAt(savedAt)

  return (
    <div id="top" className="page">
      <Hero activeUserName={activeUser.name} />

      <main>
        <div className={`backend-banner${backendOnline ? ' online' : ' offline'}`}>
          <span>{backendOnline ? '后端已连接' : '后端离线'}</span>
          <span>{syncHint || (backendOnline ? '行程将同步到服务器' : '使用本机缓存')}</span>
        </div>

        <UserWorkspace
          users={workspace.users}
          activeUserId={workspace.activeUserId}
          onSwitch={handleSwitchUser}
          onAdd={handleAddUser}
          onRename={handleRenameUser}
          onRemove={handleRemoveUser}
        />

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
              <div className="map-meta-row">
                <h2>路线地图 · {activeUser.name}</h2>
                {savedLabel && (
                  <span className="save-badge" title="当前旅客行程保存状态">
                    {activeUser.name} · {backendOnline ? '已同步' : '本机'} {savedLabel}
                  </span>
                )}
              </div>
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
            <ExportPanel
              destinations={destinations}
              route={route}
              savedAtLabel={savedLabel}
              onImport={importDestinations}
              onClearLocal={clearLocalTrip}
            />
          </div>
        </section>

        <NearbyGuides
          destinations={destinations}
          activeId={activeGuideId}
          onSelectDestination={setActiveGuideId}
        />
      </main>

      <footer className="site-footer">
        <p>To Trip · Express 后端同步多旅客行程 · 高德地图 Web 服务由服务端代理</p>
      </footer>
    </div>
  )
}
