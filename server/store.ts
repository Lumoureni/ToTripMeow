import { randomUUID } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Destination, TripUser, Workspace } from './types.js'
import { PREVIEW_COLOR, PREVIEW_USER_ID, USER_COLORS } from './types.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DATA_DIR = join(__dirname, '..', 'data')
const DATA_FILE = join(DATA_DIR, 'workspace.json')

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

function isPreviewUser(user: Pick<TripUser, 'id' | 'role'>): boolean {
  return user.id === PREVIEW_USER_ID || user.role === 'preview'
}

function listTravelers(users: TripUser[]): TripUser[] {
  return users.filter((u) => !isPreviewUser(u))
}

function aggregateTravelerDestinations(users: TripUser[]): Destination[] {
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

function createUser(name: string, index: number): TripUser {
  return {
    id: randomUUID(),
    name: name.trim() || `旅客 ${index + 1}`,
    color: USER_COLORS[index % USER_COLORS.length],
    savedAt: new Date().toISOString(),
    destinations: [],
    activeGuideId: null,
    role: 'traveler',
  }
}

function withPreviewUser(workspace: Workspace): Workspace {
  const travelers = listTravelers(workspace.users)
  const ensuredTravelers = travelers.length > 0 ? travelers : [createUser('旅客 1', 0)]
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
  }
}

export function defaultWorkspace(): Workspace {
  return withPreviewUser({
    version: 2,
    activeUserId: '',
    users: [createUser('旅客 1', 0)],
  })
}

export function normalizeWorkspace(raw: unknown): Workspace {
  if (!raw || typeof raw !== 'object') return defaultWorkspace()
  const data = raw as Partial<Workspace>
  if (data.version !== 2 || !Array.isArray(data.users)) return defaultWorkspace()
  const users = data.users
    .map((u, i) => sanitizeUser(u, i))
    .filter((u): u is TripUser => Boolean(u))
  if (users.length === 0) return defaultWorkspace()
  return withPreviewUser({
    version: 2,
    activeUserId: typeof data.activeUserId === 'string' ? data.activeUserId : users[0].id,
    users,
  })
}

export function readWorkspace(): Workspace {
  try {
    if (!existsSync(DATA_FILE)) return defaultWorkspace()
    const raw = JSON.parse(readFileSync(DATA_FILE, 'utf-8'))
    return normalizeWorkspace(raw)
  } catch {
    return defaultWorkspace()
  }
}

export function writeWorkspace(workspace: Workspace): Workspace {
  const normalized = normalizeWorkspace(workspace)
  mkdirSync(DATA_DIR, { recursive: true })
  writeFileSync(DATA_FILE, JSON.stringify(normalized, null, 2), 'utf-8')
  return normalized
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
    return writeWorkspace(current)
  }
  const savedAt = new Date().toISOString()
  const users = current.users.map((u) =>
    u.id === current.activeUserId ? { ...u, destinations, activeGuideId, savedAt } : u,
  )
  return writeWorkspace({ ...current, users })
}

export function switchUser(workspace: Workspace, userId: string): Workspace {
  const current = withPreviewUser(workspace)
  if (!current.users.some((u) => u.id === userId)) return current
  return writeWorkspace({ ...current, activeUserId: userId })
}

export function addUser(workspace: Workspace, name: string): Workspace {
  const current = withPreviewUser(workspace)
  const travelers = listTravelers(current.users)
  const user = createUser(name, travelers.length)
  return writeWorkspace({
    ...current,
    activeUserId: user.id,
    users: [...current.users, user],
  })
}

export function renameUser(workspace: Workspace, userId: string, name: string): Workspace {
  const current = withPreviewUser(workspace)
  if (userId === PREVIEW_USER_ID) return current
  const trimmed = name.trim()
  if (!trimmed) return current
  return writeWorkspace({
    ...current,
    users: current.users.map((u) => (u.id === userId ? { ...u, name: trimmed } : u)),
  })
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
  return writeWorkspace({ version: 2, activeUserId, users })
}

export function clearActiveTrip(workspace: Workspace): Workspace {
  const current = withPreviewUser(workspace)
  if (isPreviewUser(getActiveUser(current))) return current
  return upsertActiveTrip(current, [], null)
}
