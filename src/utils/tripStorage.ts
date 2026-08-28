import type { Destination } from '../types'

export const TRIP_STORAGE_KEY = 'to-trip:workspace-v2'
const LEGACY_DRAFT_KEY = 'to-trip:draft-v1'

export type TripUser = {
  id: string
  name: string
  color: string
  savedAt: string
  destinations: Destination[]
  activeGuideId: string | null
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

function sanitizeUser(raw: Partial<TripUser>, index: number): TripUser | null {
  if (!raw || typeof raw.id !== 'string' || typeof raw.name !== 'string') return null
  const destinations = Array.isArray(raw.destinations) ? raw.destinations.filter(isDestination) : []
  const activeGuideId =
    typeof raw.activeGuideId === 'string' && destinations.some((d) => d.id === raw.activeGuideId)
      ? raw.activeGuideId
      : destinations[0]?.id ?? null
  return {
    id: raw.id,
    name: raw.name.trim() || `旅客 ${index + 1}`,
    color: typeof raw.color === 'string' ? raw.color : USER_COLORS[index % USER_COLORS.length],
    savedAt: typeof raw.savedAt === 'string' ? raw.savedAt : new Date().toISOString(),
    destinations,
    activeGuideId,
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
  }
}

function defaultWorkspace(): Workspace {
  const user = createUser('旅客 1', 0)
  return { version: 2, activeUserId: user.id, users: [user] }
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
    return { version: 2, activeUserId: user.id, users: [user] }
  } catch {
    return null
  }
}

export function loadWorkspace(): Workspace {
  try {
    const raw = localStorage.getItem(TRIP_STORAGE_KEY)
    if (raw) {
      const data = JSON.parse(raw) as Partial<Workspace>
      if (data.version === 2 && Array.isArray(data.users)) {
        const users = data.users
          .map((u, i) => sanitizeUser(u, i))
          .filter((u): u is TripUser => Boolean(u))
        if (users.length > 0) {
          const activeUserId =
            typeof data.activeUserId === 'string' && users.some((u) => u.id === data.activeUserId)
              ? data.activeUserId
              : users[0].id
          return { version: 2, activeUserId, users }
        }
      }
    }
  } catch {
    // fall through
  }
  return migrateLegacyDraft() ?? defaultWorkspace()
}

export function saveWorkspace(workspace: Workspace) {
  localStorage.setItem(TRIP_STORAGE_KEY, JSON.stringify(workspace))
}

export function getActiveUser(workspace: Workspace): TripUser {
  return workspace.users.find((u) => u.id === workspace.activeUserId) ?? workspace.users[0]
}

export function upsertActiveTrip(
  workspace: Workspace,
  destinations: Destination[],
  activeGuideId: string | null,
): Workspace {
  const savedAt = new Date().toISOString()
  const users = workspace.users.map((u) =>
    u.id === workspace.activeUserId
      ? { ...u, destinations, activeGuideId, savedAt }
      : u,
  )
  const next = { ...workspace, users }
  saveWorkspace(next)
  return next
}

export function switchUser(workspace: Workspace, userId: string): Workspace {
  if (!workspace.users.some((u) => u.id === userId)) return workspace
  const next = { ...workspace, activeUserId: userId }
  saveWorkspace(next)
  return next
}

export function addUser(workspace: Workspace, name: string): Workspace {
  const user = createUser(name, workspace.users.length)
  const next = {
    ...workspace,
    activeUserId: user.id,
    users: [...workspace.users, user],
  }
  saveWorkspace(next)
  return next
}

export function renameUser(workspace: Workspace, userId: string, name: string): Workspace {
  const trimmed = name.trim()
  if (!trimmed) return workspace
  const next = {
    ...workspace,
    users: workspace.users.map((u) => (u.id === userId ? { ...u, name: trimmed } : u)),
  }
  saveWorkspace(next)
  return next
}

export function removeUser(workspace: Workspace, userId: string): Workspace {
  if (workspace.users.length <= 1) return workspace
  const users = workspace.users.filter((u) => u.id !== userId)
  const activeUserId =
    workspace.activeUserId === userId ? users[0].id : workspace.activeUserId
  const next = { version: 2 as const, activeUserId, users }
  saveWorkspace(next)
  return next
}

export function clearActiveTrip(workspace: Workspace): Workspace {
  return upsertActiveTrip(workspace, [], null)
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
