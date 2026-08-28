import { randomUUID } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Destination, TripUser, Workspace } from './types.js'
import { USER_COLORS } from './types.js'

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
    id: randomUUID(),
    name: name.trim() || `旅客 ${index + 1}`,
    color: USER_COLORS[index % USER_COLORS.length],
    savedAt: new Date().toISOString(),
    destinations: [],
    activeGuideId: null,
  }
}

export function defaultWorkspace(): Workspace {
  const user = createUser('旅客 1', 0)
  return { version: 2, activeUserId: user.id, users: [user] }
}

export function normalizeWorkspace(raw: unknown): Workspace {
  if (!raw || typeof raw !== 'object') return defaultWorkspace()
  const data = raw as Partial<Workspace>
  if (data.version !== 2 || !Array.isArray(data.users)) return defaultWorkspace()
  const users = data.users
    .map((u, i) => sanitizeUser(u, i))
    .filter((u): u is TripUser => Boolean(u))
  if (users.length === 0) return defaultWorkspace()
  const activeUserId =
    typeof data.activeUserId === 'string' && users.some((u) => u.id === data.activeUserId)
      ? data.activeUserId
      : users[0].id
  return { version: 2, activeUserId, users }
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
  return workspace.users.find((u) => u.id === workspace.activeUserId) ?? workspace.users[0]
}

export function upsertActiveTrip(
  workspace: Workspace,
  destinations: Destination[],
  activeGuideId: string | null,
): Workspace {
  const savedAt = new Date().toISOString()
  const users = workspace.users.map((u) =>
    u.id === workspace.activeUserId ? { ...u, destinations, activeGuideId, savedAt } : u,
  )
  return writeWorkspace({ ...workspace, users })
}

export function switchUser(workspace: Workspace, userId: string): Workspace {
  if (!workspace.users.some((u) => u.id === userId)) return workspace
  return writeWorkspace({ ...workspace, activeUserId: userId })
}

export function addUser(workspace: Workspace, name: string): Workspace {
  const user = createUser(name, workspace.users.length)
  return writeWorkspace({
    ...workspace,
    activeUserId: user.id,
    users: [...workspace.users, user],
  })
}

export function renameUser(workspace: Workspace, userId: string, name: string): Workspace {
  const trimmed = name.trim()
  if (!trimmed) return workspace
  return writeWorkspace({
    ...workspace,
    users: workspace.users.map((u) => (u.id === userId ? { ...u, name: trimmed } : u)),
  })
}

export function removeUser(workspace: Workspace, userId: string): Workspace {
  if (workspace.users.length <= 1) return workspace
  const users = workspace.users.filter((u) => u.id !== userId)
  const activeUserId = workspace.activeUserId === userId ? users[0].id : workspace.activeUserId
  return writeWorkspace({ version: 2, activeUserId, users })
}

export function clearActiveTrip(workspace: Workspace): Workspace {
  return upsertActiveTrip(workspace, [], null)
}
