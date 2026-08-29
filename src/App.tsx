import { useEffect, useRef, useState } from 'react'
import { fetchRoute } from './api/travel'
import {
  apiAddUser,
  apiClearActiveTrip,
  apiGetWorkspace,
  apiHealth,
  apiLinkCompanion,
  apiPutActiveTrip,
  apiPutWorkspace,
  apiRemoveUser,
  apiRenameUser,
  apiSwitchUser,
} from './api/workspaceApi'
import { apiLogout, apiMe } from './api/authApi'
import { AdminPage } from './components/AdminPage'
import { DestinationPlanner } from './components/DestinationPlanner'
import { ExportPanel } from './components/ExportPanel'
import { Hero } from './components/Hero'
import { LoginPage } from './components/LoginPage'
import { NearbyGuides } from './components/NearbyGuides'
import { RouteMap } from './components/RouteMap'
import { RouteOptimizePanel } from './components/RouteOptimizePanel'
import { UserWorkspace } from './components/UserWorkspace'
import {
  addUser,
  aggregateTravelerDestinations,
  clearActiveTrip,
  formatSavedAt,
  getActiveUser,
  isPreviewUser,
  listTravelers,
  loadWorkspace,
  PREVIEW_COLOR,
  PREVIEW_USER_ID,
  removeUser,
  renameUser,
  saveWorkspace,
  setStorageAccountId,
  switchUser,
  upsertActiveTrip,
  withPreviewUser,
  getSelfTraveler,
  isLinkedCompanion,
  type Workspace,
} from './utils/tripStorage'
import {
  clearAuthSession,
  loadAuthSession,
  type AuthSession,
} from './utils/authStorage'
import type { Destination, GuidePlace, MapTravelerLayer, RouteInfo, RouteOption } from './types'
import './App.css'

function formatDuration(minutes: number) {
  if (minutes < 60) return `${Math.round(minutes)} 分钟`
  const h = Math.floor(minutes / 60)
  const m = Math.round(minutes % 60)
  return m === 0 ? `${h} 小时` : `${h} 小时 ${m} 分钟`
}

export default function App() {
  const [auth, setAuth] = useState<AuthSession | null>(() => {
    const session = loadAuthSession()
    if (session?.user.role === 'user') setStorageAccountId(session.user.id)
    else setStorageAccountId(null)
    return session
  })
  const boot = loadWorkspace()
  const bootUser = getActiveUser(boot)

  const [view, setView] = useState<'home' | 'login' | 'plan' | 'admin'>(() =>
    loadAuthSession()?.user.role === 'admin' ? 'admin' : 'home',
  )
  const [planTab, setPlanTab] = useState<'route' | 'guides'>('route')
  const [workspace, setWorkspace] = useState<Workspace>(boot)
  const workspaceRef = useRef(workspace)
  workspaceRef.current = workspace

  const [destinations, setDestinations] = useState<Destination[]>(bootUser.destinations)
  const [activeGuideId, setActiveGuideId] = useState<string | null>(bootUser.activeGuideId)
  const [savedAt, setSavedAt] = useState<string | null>(bootUser.savedAt)
  const [route, setRoute] = useState<RouteInfo | null>(null)
  const [routeLoading, setRouteLoading] = useState(false)
  const [routeError, setRouteError] = useState<string | null>(null)
  const [peerRoutes, setPeerRoutes] = useState<Record<string, RouteInfo | null>>({})
  const [peerRoutesLoading, setPeerRoutesLoading] = useState(false)
  const [hydrated, setHydrated] = useState(false)
  const [backendOnline, setBackendOnline] = useState(false)
  const [syncHint, setSyncHint] = useState<string | null>(null)
  const skipNextSave = useRef(false)
  const skipRouteFetch = useRef(false)
  const routeStrategy = useRef('0')
  /** 丢弃过期后端响应，避免切换旅客/预览后被旧请求打回 */
  const workspaceEpoch = useRef(0)
  /** 预览下已优化/手动重排后，不再被汇总列表覆盖 */
  const previewLayoutLocked = useRef(false)

  const activeUser = getActiveUser(workspace)
  const previewMode = isPreviewUser(activeUser)
  const linkedMode = isLinkedCompanion(activeUser)

  const applyUserTrip = (nextWorkspace: Workspace, options?: { skipSave?: boolean }) => {
    const normalized = withPreviewUser(nextWorkspace)
    const user = getActiveUser(normalized)
    workspaceEpoch.current += 1
    if (options?.skipSave) skipNextSave.current = true
    workspaceRef.current = normalized
    saveWorkspace(normalized)
    setWorkspace(normalized)
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
        const session = loadAuthSession()
        if (!session) {
          setSyncHint('请先登录后同步行程')
          return
        }
        try {
          const me = await apiMe()
          if (cancelled) return
          setAuth({ token: session.token, user: me })
          if (me.role === 'admin') {
            setStorageAccountId(null)
            setView('admin')
            setSyncHint('管理员已登录')
            return
          }
          setStorageAccountId(me.id)
          const remote = await apiGetWorkspace()
          if (cancelled) return
          applyUserTrip(remote, { skipSave: true })
          setSyncHint('已连接后端，行程云端同步中')
        } catch {
          if (cancelled) return
          clearAuthSession()
          setAuth(null)
          setStorageAccountId(null)
          setSyncHint('登录已失效，请重新登录')
        }
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
    if (previewMode || linkedMode) return

    // always keep local cache warm
    const local = upsertActiveTrip(workspaceRef.current, destinations, activeGuideId)
    workspaceRef.current = local
    setWorkspace(withPreviewUser(local))
    setSavedAt(getActiveUser(local).savedAt)

    if (!backendOnline) return

    const epochAtStart = workspaceEpoch.current
    const activeIdAtStart = workspaceRef.current.activeUserId
    const timer = window.setTimeout(() => {
      void apiPutActiveTrip(destinations, activeGuideId)
        .then((remote) => {
          // 切换旅客后丢弃过期响应，防止把 activeUser 打回上一个用户
          if (epochAtStart !== workspaceEpoch.current) return
          if (workspaceRef.current.activeUserId !== activeIdAtStart) return
          const normalized = withPreviewUser({
            ...remote,
            activeUserId: activeIdAtStart,
          })
          workspaceRef.current = normalized
          setWorkspace(normalized)
          setSavedAt(getActiveUser(normalized).savedAt)
          setSyncHint('已同步到后端')
        })
        .catch(() => {
          if (epochAtStart !== workspaceEpoch.current) return
          setBackendOnline(false)
          setSyncHint('后端同步失败，已改回本机保存')
        })
    }, 450)

    return () => window.clearTimeout(timer)
  }, [destinations, activeGuideId, hydrated, backendOnline, previewMode, linkedMode])

  // 预览模式：进入时用汇总填充；优化/重排后锁定，离开预览时解锁
  useEffect(() => {
    if (!previewMode) {
      previewLayoutLocked.current = false
      return
    }
    if (previewLayoutLocked.current) return
    const aggregated = aggregateTravelerDestinations(workspace.users)
    setDestinations(aggregated)
    setActiveGuideId((cur) =>
      aggregated.some((d) => d.id === cur) ? cur : aggregated[0]?.id ?? null,
    )
  }, [previewMode, workspace.users])

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
    // 先本地切换，保证顶栏/侧栏立刻更新
    const flushed = upsertActiveTrip(workspaceRef.current, destinations, activeGuideId)
    const localNext = switchUser(flushed, userId)
    applyUserTrip(localNext, { skipSave: true })
    const epoch = workspaceEpoch.current

    void (async () => {
      if (!backendOnline) return
      try {
        // 先把含预览用户的本地工作区推到后端，再切换，避免服务端无预览 ID 导致打回
        await apiPutWorkspace(localNext)
        if (epoch !== workspaceEpoch.current) return
        const remote = await apiSwitchUser(userId)
        if (epoch !== workspaceEpoch.current) return
        applyUserTrip(withPreviewUser({ ...remote, activeUserId: userId }), { skipSave: true })
        setBackendOnline(true)
        setSyncHint('已同步到后端')
      } catch {
        // 保持本地已切换的状态
        setBackendOnline(false)
        setSyncHint('后端不可用，已使用本机数据')
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

  const handleLinkCompanion = async (username: string, password: string) => {
    if (!backendOnline) {
      throw new Error('需要连接后端才能同步同行行程')
    }
    const flushed = upsertActiveTrip(workspaceRef.current, destinations, activeGuideId)
    workspaceRef.current = flushed
    try {
      await apiPutActiveTrip(destinations, activeGuideId)
      const next = await apiLinkCompanion(username, password)
      applyUserTrip(next, { skipSave: true })
      setBackendOnline(true)
      setSyncHint(`已同步同行「${username}」的行程`)
    } catch (err) {
      const message = err instanceof Error ? err.message : '同步失败'
      if (message.includes('无法连接') || message.includes('登录已过期')) {
        setBackendOnline(false)
      }
      throw new Error(message)
    }
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
    if (previewMode || linkedMode) return
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
    if (previewMode || linkedMode) return
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

  /** 从周边攻略加入途径点：插在当前选中站之后；若选中为最后一站则插在倒数第二（保持终点） */
  const addWaypointFromGuide = (place: GuidePlace) => {
    if (previewMode || linkedMode) return
    const point: Destination = {
      id: crypto.randomUUID(),
      name: place.name,
      displayName: place.address || place.name,
      lat: place.lat,
      lon: place.lon,
      address: place.address,
    }
    setDestinations((prev) => {
      if (prev.some((d) => Math.abs(d.lat - point.lat) < 1e-5 && Math.abs(d.lon - point.lon) < 1e-5)) {
        return prev
      }
      if (prev.length === 0) return [point]
      const activeIndex = Math.max(
        0,
        prev.findIndex((d) => d.id === activeGuideId),
      )
      let insertAt = activeIndex + 1
      if (prev.length >= 2 && activeIndex === prev.length - 1) {
        insertAt = prev.length - 1
      }
      const next = [...prev]
      next.splice(insertAt, 0, point)
      return next
    })
  }

  /** 将同步同行的勾选途径点并入本人行程 */
  const addCompanionWaypointsToSelf = (places: Destination[]) => {
    if (!linkedMode || places.length === 0) return
    const current = withPreviewUser(workspaceRef.current)
    const self = getSelfTraveler(current)
    if (!self) {
      setSyncHint('未找到本人旅客，无法添加途径点')
      return
    }
    const additions = places.map((place) => ({
      ...place,
      id: crypto.randomUUID(),
      ownerName: undefined,
      ownerColor: undefined,
    }))
    let nextDest = [...self.destinations]
    let added = 0
    for (const place of additions) {
      const exists = nextDest.some(
        (d) => Math.abs(d.lat - place.lat) < 1e-5 && Math.abs(d.lon - place.lon) < 1e-5,
      )
      if (exists) continue
      nextDest.push(place)
      added += 1
    }
    if (added === 0) {
      setSyncHint('所选途径点已在你的行程中')
      return
    }
    const savedAt = new Date().toISOString()
    const users = current.users.map((u) =>
      u.id === self.id
        ? {
            ...u,
            destinations: nextDest,
            activeGuideId: u.activeGuideId ?? nextDest[0]?.id ?? null,
            savedAt,
          }
        : u,
    )
    const nextWorkspace = withPreviewUser({
      ...current,
      activeUserId: self.id,
      users,
    })
    applyUserTrip(nextWorkspace, { skipSave: true })
    setSyncHint(`已将 ${added} 个途径点加入「${self.name}」的行程`)
    void (async () => {
      if (!backendOnline) return
      try {
        const remote = await apiPutWorkspace(nextWorkspace)
        applyUserTrip(withPreviewUser({ ...remote, activeUserId: self.id }), { skipSave: true })
      } catch {
        setBackendOnline(false)
      }
    })()
  }

  const applyRouteOption = (option: RouteOption) => {
    if (linkedMode) return
    if (previewMode) previewLayoutLocked.current = true
    skipRouteFetch.current = true
    routeStrategy.current = option.route.strategy || '0'
    setDestinations(option.destinations)
    setRoute(option.route)
    setRouteError(null)
    setActiveGuideId(option.destinations[0]?.id ?? null)
    setPlanTab('route')
  }

  const importDestinations = (places: Destination[]) => {
    if (previewMode || linkedMode) return
    const next = places.map((place) => ({ ...place, id: crypto.randomUUID() }))
    setDestinations(next)
    setActiveGuideId(next[0]?.id ?? null)
    setRoute(null)
    setRouteError(null)
  }

  const clearLocalTrip = () => {
    if (previewMode || linkedMode) return
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
    if (previewMode || linkedMode) return
    setDestinations((prev) => prev.filter((d) => d.id !== id))
    setActiveGuideId((cur) => (cur === id ? null : cur))
  }

  const reorder = (from: number, to: number) => {
    if (linkedMode) return
    setDestinations((prev) => {
      if (to < 0 || to >= prev.length) return prev
      const next = [...prev]
      const [item] = next.splice(from, 1)
      next.splice(to, 0, item)
      return next
    })
    if (previewMode) previewLayoutLocked.current = true
  }

  useEffect(() => {
    if (destinations.length > 0 && !destinations.some((d) => d.id === activeGuideId)) {
      setActiveGuideId(destinations[0].id)
    }
  }, [destinations, activeGuideId])

  useEffect(() => {
    let cancelled = false
    if (skipRouteFetch.current) {
      skipRouteFetch.current = false
      return
    }
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
        const info = await fetchRoute(destinations, routeStrategy.current)
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

  // 其他旅客路线：共用地图叠加；预览模式下仍拉各旅客路线作对照
  const travelers = listTravelers(workspace.users)
  const peersKey = travelers
    .filter((u) => previewMode || u.id !== activeUser.id)
    .map((u) => `${u.id}:${u.destinations.map((d) => `${d.id}@${d.lat},${d.lon}`).join('>')}`)
    .join('|')

  useEffect(() => {
    let cancelled = false
    const peers = travelers.filter((u) => previewMode || u.id !== activeUser.id)

    const run = async () => {
      if (peers.length === 0) {
        setPeerRoutes({})
        setPeerRoutesLoading(false)
        return
      }
      setPeerRoutesLoading(true)
      const next: Record<string, RouteInfo | null> = {}
      for (const user of peers) {
        if (user.destinations.length < 2) {
          next[user.id] = null
          continue
        }
        try {
          next[user.id] = await fetchRoute(user.destinations, '0')
        } catch {
          next[user.id] = null
        }
        if (cancelled) return
        await new Promise((r) => setTimeout(r, 100))
      }
      if (!cancelled) {
        setPeerRoutes(next)
        setPeerRoutesLoading(false)
      }
    }
    void run()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [peersKey, activeUser.id, previewMode])

  const mapLayers: MapTravelerLayer[] = previewMode
    ? [
        ...travelers.map((user) => ({
          id: user.id,
          name: user.name,
          color: user.color,
          destinations: user.destinations,
          route: peerRoutes[user.id] ?? null,
          emphasized: false,
        })),
        {
          id: PREVIEW_USER_ID,
          name: '预览路线',
          color: PREVIEW_COLOR,
          destinations,
          route,
          emphasized: true,
        },
      ]
    : travelers.map((user) => {
        const isActive = user.id === activeUser.id
        return {
          id: user.id,
          name: user.name,
          color: user.color,
          destinations: isActive ? destinations : user.destinations,
          route: isActive ? route : (peerRoutes[user.id] ?? null),
          emphasized: isActive,
        }
      })

  const sharedStats = mapLayers
    .filter((layer) => layer.route)
    .map((layer) => ({
      name: layer.name,
      color: layer.color,
      distanceKm: layer.route!.distanceKm,
      durationMin: layer.route!.durationMin,
      emphasized: layer.emphasized,
    }))

  const savedLabel = formatSavedAt(savedAt)

  const enterPlan = () => {
    if (!auth) {
      setView('login')
      return
    }
    if (auth.user.role === 'admin') {
      setView('admin')
      return
    }
    setPlanTab('route')
    setView('plan')
  }

  const handleAuthSuccess = async (session: AuthSession) => {
    setAuth(session)
    if (session.user.role === 'admin') {
      setStorageAccountId(null)
      setView('admin')
      setSyncHint('管理员已登录')
      return
    }
    setStorageAccountId(session.user.id)
    skipNextSave.current = true
    try {
      const remote = await apiGetWorkspace()
      applyUserTrip(remote, { skipSave: true })
      setBackendOnline(true)
      setSyncHint('登录成功，行程已同步')
    } catch {
      applyUserTrip(loadWorkspace(), { skipSave: true })
      setSyncHint('已登录，云端工作区暂不可用，使用本机缓存')
    }
    setPlanTab('route')
    setView('plan')
  }

  const handleLogout = () => {
    void (async () => {
      try {
        await apiLogout()
      } catch {
        clearAuthSession()
      }
      setAuth(null)
      setStorageAccountId(null)
      applyUserTrip(loadWorkspace(), { skipSave: true })
      setBackendOnline(false)
      setView('home')
      setSyncHint('已退出登录')
    })()
  }

  if (view === 'login') {
    return (
      <LoginPage
        onBack={() => setView('home')}
        onSuccess={(session) => {
          void handleAuthSuccess(session)
        }}
      />
    )
  }

  if (view === 'admin' && auth?.user.role === 'admin') {
    return <AdminPage adminName={auth.user.displayName} onLogout={handleLogout} />
  }

  if (view === 'home') {
    return (
      <div id="top" className="page home-page">
        <Hero
          loggedIn={Boolean(auth)}
          displayName={auth?.user.displayName}
          isAdmin={auth?.user.role === 'admin'}
          onLogin={() => setView('login')}
          onStartPlan={enterPlan}
        />
      </div>
    )
  }

  if (!auth || auth.user.role === 'admin') {
    return (
      <div id="top" className="page home-page">
        <Hero
          loggedIn={Boolean(auth)}
          displayName={auth?.user.displayName}
          isAdmin={auth?.user.role === 'admin'}
          onLogin={() => setView('login')}
          onStartPlan={enterPlan}
        />
      </div>
    )
  }

  return (
    <div id="top" className="page plan-page">
      <header className="plan-topbar">
        <div className="plan-topbar-left">
          <button type="button" className="brand-mark dark" onClick={() => setView('home')}>
            To Trip
          </button>
          <span className="plan-topbar-sep" aria-hidden="true">
            /
          </span>
          <UserWorkspace
            users={workspace.users}
            activeUserId={workspace.activeUserId}
            onSwitch={handleSwitchUser}
            onAdd={handleAddUser}
            onLinkCompanion={handleLinkCompanion}
            onRename={handleRenameUser}
            onRemove={handleRemoveUser}
          />
        </div>
        <div className="plan-topbar-right">
          {auth && <span className="plan-topbar-chip plan-account-chip">{auth.user.displayName}</span>}
          <div
            className={`plan-topbar-chip backend-pill${backendOnline ? ' online' : ' offline'}`}
            title={syncHint || undefined}
          >
            {backendOnline ? '后端已连接' : '后端离线'}
          </div>
          {auth && (
            <button type="button" className="plan-topbar-chip plan-home-btn" onClick={handleLogout}>
              退出登录
            </button>
          )}
        </div>
      </header>

      <div className="plan-shell">
        <aside className="plan-sidebar">
          <DestinationPlanner
            destinations={destinations}
            onAdd={addDestination}
            onAddMany={addDestinations}
            onRemove={removeDestination}
            onReorder={reorder}
            readOnly={previewMode}
            allowArrange={previewMode}
            companionPick={linkedMode}
            companionName={activeUser.name}
            onAddCompanionWaypoints={addCompanionWaypointsToSelf}
          />
        </aside>

        <section className="plan-main" id="plan">
          <div className="plan-main-tabs" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={planTab === 'route'}
              className={planTab === 'route' ? 'active' : undefined}
              onClick={() => setPlanTab('route')}
            >
              路线地图
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={planTab === 'guides'}
              className={planTab === 'guides' ? 'active' : undefined}
              onClick={() => setPlanTab('guides')}
            >
              周边攻略
            </button>
          </div>

          {planTab === 'route' ? (
            <div className="plan-route-stack">
              <div className="map-panel plan-map-panel">
                <div className="map-meta">
                  <div className="map-meta-row">
                    <h2>共用路线地图</h2>
                    {savedLabel && (
                      <span className="save-badge" title="当前旅客行程保存状态">
                        {activeUser.name} · {backendOnline ? '已同步' : '本机'} {savedLabel}
                      </span>
                    )}
                  </div>
                  <p className="map-shared-hint">
                    {previewMode
                      ? '预览模式：可优化并重排全部汇总地点；粗线为预览路线，细线为各旅客原路线。'
                      : linkedMode
                        ? `正在查看同步同行「${activeUser.name}」：路径只读，请在左侧勾选途径点加入你的行程。`
                        : `所有旅客的行程会叠在同一张地图上；粗线与高亮标记为当前旅客「${activeUser.name}」。`}
                  </p>
                  {(routeLoading || peerRoutesLoading) && <p>正在计算路线…</p>}
                  {routeError && (
                    <p className="error">
                      {previewMode ? '预览' : activeUser.name}：{routeError}
                    </p>
                  )}
                  {route && !routeLoading && previewMode && (
                    <p>
                      预览全程约 <strong>{route.distanceKm.toFixed(1)} km</strong>
                      <span className="dot">·</span>
                      预计 <strong>{formatDuration(route.durationMin)}</strong>
                    </p>
                  )}
                  {sharedStats.length > 0 && (
                    <ul className="map-legend">
                      {sharedStats.map((item) => (
                        <li key={item.name + item.distanceKm} className={item.emphasized ? 'active' : undefined}>
                          <span className="map-legend-swatch" style={{ background: item.color }} />
                          <span className="map-legend-name">{item.name}</span>
                          <span className="map-legend-meta">
                            {item.distanceKm.toFixed(1)} km · {formatDuration(item.durationMin)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                  {sharedStats.length === 0 && !routeLoading && !peerRoutesLoading && !routeError && (
                    <p>
                      {mapLayers.every((l) => l.destinations.length === 0)
                        ? '任意旅客添加目的地后，将在此共用地图显示。'
                        : '至少两位目的地的旅客会生成驾车路线并显示在地图上。'}
                    </p>
                  )}
                </div>
                <RouteMap layers={mapLayers} />
              </div>
              {!linkedMode && (
                <RouteOptimizePanel destinations={destinations} onApply={applyRouteOption} />
              )}
              {!linkedMode && (
                <ExportPanel
                  destinations={destinations}
                  route={route}
                  savedAtLabel={savedLabel}
                  onImport={importDestinations}
                  onClearLocal={clearLocalTrip}
                />
              )}
            </div>
          ) : linkedMode ? (
            <div className="plan-guides-panel">
              <p className="map-shared-hint">
                同步同行的行程为只读。请切换到本人旅客后再查看周边攻略；或在左侧勾选对方途径点加入自己的行程。
              </p>
            </div>
          ) : (
            <div className="plan-guides-panel">
              <NearbyGuides
                destinations={destinations}
                activeId={activeGuideId}
                onSelectDestination={setActiveGuideId}
                onAddWaypoint={addWaypointFromGuide}
              />
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
