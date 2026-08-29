import type { Destination } from '../types'

export const TRIP_STORAGE_KEY = 'to-trip:workspace-v2'
const LEGACY_DRAFT_KEY = 'to-trip:draft-v1'

let storageAccountId: string | null = null

/** 按登录账号隔离本机缓存 */
export function setStorageAccountId(accountId: string | null) {
  storageAccountId = accountId
}

function storageKey() {
  return storageAccountId ? `${TRIP_STORAGE_KEY}:${storageAccountId}` : TRIP_STORAGE_KEY
}

export const PREVIEW_USER_ID = 'preview-all'
export const PREVIEW_COLOR = '#4a5d78'

export type TripUser = {
  id: string
  name: string
  color: string
  savedAt: string
  destinations: Destination[]
  activeGuideId: string | null
  /** 预览用户：只读汇总所有旅客地点 */
  role?: 'traveler' | 'preview'
  /** 已通过账号密码同步的同行账号 id */
  linkedAccountId?: string
}

export type Workspace = {
  version: 2
  activeUserId: string
  users: TripUser[]
}

const USER_COLORS = ['#1a6b63', '#8a5a18', '#3d5a5c', '#9b3b2e', '#2f6b5a', '#6b5a3d']

function isDestination(value: unknown): value is Destination {
  if (!value || typeof value !== 'object') return false
  const d = value as Destination
  return (
    typeof d.id === 'string' &&
    typeof d.name === 'string' &&
    typeof d.displayName === 'string' &&
    typeof d.lat === 'number' &&
    typeof d.lon === 'number' &&
    Number.isFinite(d.lat) &&
    Number.isFinite(d.lon)
  )
}

export function isPreviewUser(user: Pick<TripUser, 'id' | 'role'> | null | undefined): boolean {
  if (!user) return false
  return user.id === PREVIEW_USER_ID || user.role === 'preview'
}

/** 通过账号同步加入的同行旅客（只读，不可改对方路径） */
export function isLinkedCompanion(user: Pick<TripUser, 'linkedAccountId' | 'role'> | null | undefined): boolean {
  if (!user || user.role === 'preview') return false
  return Boolean(user.linkedAccountId)
}

export function listTravelers(users: TripUser[]): TripUser[] {
  return users.filter((u) => !isPreviewUser(u))
}

/** 当前账号本人旅客（非同步同行） */
export function getSelfTraveler(workspace: Workspace): TripUser | null {
  return listTravelers(workspace.users).find((u) => !isLinkedCompanion(u)) ?? null
}

/** 合并所有旅客地点（按坐标去重，保留首次出现顺序，并标注来源） */
export function aggregateTravelerDestinations(users: TripUser[]): Destination[] {
  const seen = new Set<string>()
  const out: Destination[] = []
  for (const user of listTravelers(users)) {
    for (const d of user.destinations) {
      const key = `${d.lat.toFixed(5)},${d.lon.toFixed(5)}`
      if (seen.has(key)) continue
      seen.add(key)
      out.push({
        ...d,
        ownerName: user.name,
        ownerColor: user.color,
      })
    }
  }
  return out
}

function createPreviewUser(destinations: Destination[]): TripUser {
  return {
    id: PREVIEW_USER_ID,
    name: '预览',
    role: 'preview',
    color: PREVIEW_COLOR,
    savedAt: new Date().toISOString(),
    destinations,
    activeGuideId: destinations[0]?.id ?? null,
  }
}

/** 保证多旅客时存在预览用户；单旅客时仅保留本人 */
export function withPreviewUser(workspace: Workspace): Workspace {
  const travelers = listTravelers(workspace.users)
  const ensuredTravelers =
    travelers.length > 0 ? travelers : [createUser('旅客 1', 0)]
  if (ensuredTravelers.length < 2) {
    const activeUserId =
      typeof workspace.activeUserId === 'string' &&
      ensuredTravelers.some((u) => u.id === workspace.activeUserId)
        ? workspace.activeUserId
        : ensuredTravelers[0].id
    return { version: 2, activeUserId, users: ensuredTravelers }
  }
  const destinations = aggregateTravelerDestinations(ensuredTravelers)
  const preview = createPreviewUser(destinations)
  const users = [preview, ...ensuredTravelers]
  const activeUserId =
    typeof workspace.activeUserId === 'string' && users.some((u) => u.id === workspace.activeUserId)
      ? workspace.activeUserId
      : ensuredTravelers[0].id
  return { version: 2, activeUserId, users }
}

function sanitizeUser(raw: Partial<TripUser>, index: number): TripUser | null {
  if (!raw || typeof raw.id !== 'string' || typeof raw.name !== 'string') return null
  const destinations = Array.isArray(raw.destinations) ? raw.destinations.filter(isDestination) : []
  const activeGuideId =
    typeof raw.activeGuideId === 'string' && destinations.some((d) => d.id === raw.activeGuideId)
      ? raw.activeGuideId
      : destinations[0]?.id ?? null
  const role = raw.role === 'preview' || raw.id === PREVIEW_USER_ID ? 'preview' : 'traveler'
  return {
    id: role === 'preview' ? PREVIEW_USER_ID : raw.id,
    name: role === 'preview' ? '预览' : raw.name.trim() || `旅客 ${index + 1}`,
    color:
      role === 'preview'
        ? PREVIEW_COLOR
        : typeof raw.color === 'string'
          ? raw.color
          : USER_COLORS[index % USER_COLORS.length],
    savedAt: typeof raw.savedAt === 'string' ? raw.savedAt : new Date().toISOString(),
    destinations: role === 'preview' ? [] : destinations,
    activeGuideId: role === 'preview' ? null : activeGuideId,
    role,
    ...(role !== 'preview' && typeof raw.linkedAccountId === 'string'
      ? { linkedAccountId: raw.linkedAccountId }
      : {}),
  }
}

function createUser(name: string, index: number): TripUser {
  return {
    id: crypto.randomUUID(),
    name: name.trim() || `旅客 ${index + 1}`,
    color: USER_COLORS[index % USER_COLORS.length],
    savedAt: new Date().toISOString(),
    destinations: [],
    activeGuideId: null,
    role: 'traveler',
  }
}

function defaultWorkspace(ownerName = '旅客 1'): Workspace {
  const user = createUser(ownerName, 0)
  return {
    version: 2,
    activeUserId: user.id,
    users: [user],
  }
}

function migrateLegacyDraft(): Workspace | null {
  try {
    const raw = localStorage.getItem(LEGACY_DRAFT_KEY)
    if (!raw) return null
    const data = JSON.parse(raw) as {
      destinations?: Destination[]
      activeGuideId?: string | null
      savedAt?: string
    }
    const destinations = Array.isArray(data.destinations)
      ? data.destinations.filter(isDestination)
      : []
    const user = createUser('旅客 1', 0)
    user.destinations = destinations
    user.activeGuideId =
      typeof data.activeGuideId === 'string' &&
      destinations.some((d) => d.id === data.activeGuideId)
        ? data.activeGuideId
        : destinations[0]?.id ?? null
    user.savedAt = typeof data.savedAt === 'string' ? data.savedAt : user.savedAt
    localStorage.removeItem(LEGACY_DRAFT_KEY)
    return withPreviewUser({ version: 2, activeUserId: user.id, users: [user] })
  } catch {
    return null
  }
}

export function loadWorkspace(): Workspace {
  try {
    const raw = localStorage.getItem(storageKey())
    if (raw) {
      const data = JSON.parse(raw) as Partial<Workspace>
      if (data.version === 2 && Array.isArray(data.users)) {
        const users = data.users
          .map((u, i) => sanitizeUser(u, i))
          .filter((u): u is TripUser => Boolean(u))
        if (users.length > 0) {
          return withPreviewUser({
            version: 2,
            activeUserId: typeof data.activeUserId === 'string' ? data.activeUserId : users[0].id,
            users,
          })
        }
      }
    }
  } catch {
    // fall through
  }
  if (!storageAccountId) {
    return migrateLegacyDraft() ?? defaultWorkspace()
  }
  return defaultWorkspace()
}

export function saveWorkspace(workspace: Workspace) {
  localStorage.setItem(storageKey(), JSON.stringify(withPreviewUser(workspace)))
}

export function getActiveUser(workspace: Workspace): TripUser {
  const normalized = withPreviewUser(workspace)
  return normalized.users.find((u) => u.id === normalized.activeUserId) ?? normalized.users[0]
}

export function upsertActiveTrip(
  workspace: Workspace,
  destinations: Destination[],
  activeGuideId: string | null,
): Workspace {
  const current = withPreviewUser(workspace)
  const active = getActiveUser(current)
  if (isPreviewUser(active)) {
    // 预览只读：不写回地点，仅刷新汇总
    const next = withPreviewUser(current)
    saveWorkspace(next)
    return next
  }
  const savedAt = new Date().toISOString()
  const users = current.users.map((u) =>
    u.id === current.activeUserId ? { ...u, destinations, activeGuideId, savedAt } : u,
  )
  const next = withPreviewUser({ ...current, users })
  saveWorkspace(next)
  return next
}

export function switchUser(workspace: Workspace, userId: string): Workspace {
  const current = withPreviewUser(workspace)
  if (!current.users.some((u) => u.id === userId)) return current
  const next = withPreviewUser({ ...current, activeUserId: userId })
  saveWorkspace(next)
  return next
}

export function addUser(workspace: Workspace, name: string): Workspace {
  const current = withPreviewUser(workspace)
  const travelers = listTravelers(current.users)
  const user = createUser(name, travelers.length)
  const next = withPreviewUser({
    ...current,
    activeUserId: user.id,
    users: [...current.users, user],
  })
  saveWorkspace(next)
  return next
}

export function renameUser(workspace: Workspace, userId: string, name: string): Workspace {
  const current = withPreviewUser(workspace)
  if (userId === PREVIEW_USER_ID) return current
  const trimmed = name.trim()
  if (!trimmed) return current
  const next = withPreviewUser({
    ...current,
    users: current.users.map((u) => (u.id === userId ? { ...u, name: trimmed } : u)),
  })
  saveWorkspace(next)
  return next
}

export function removeUser(workspace: Workspace, userId: string): Workspace {
  const current = withPreviewUser(workspace)
  if (userId === PREVIEW_USER_ID) return current
  const travelers = listTravelers(current.users)
  if (travelers.length <= 1) return current
  const users = current.users.filter((u) => u.id !== userId)
  const activeUserId =
    current.activeUserId === userId
      ? listTravelers(users)[0]?.id ?? PREVIEW_USER_ID
      : current.activeUserId
  const next = withPreviewUser({ version: 2, activeUserId, users })
  saveWorkspace(next)
  return next
}

export function clearActiveTrip(workspace: Workspace): Workspace {
  const current = withPreviewUser(workspace)
  if (isPreviewUser(getActiveUser(current))) return current
  return upsertActiveTrip(current, [], null)
}

export function formatSavedAt(iso: string | null): string | null {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  return d.toLocaleString('zh-CN', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}
