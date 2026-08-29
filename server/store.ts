import { randomUUID } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  findAccountByUsername,
  verifyPassword,
} from './authStore.js'
import type { Destination, TripUser, Workspace } from './types.js'
import { PREVIEW_COLOR, PREVIEW_USER_ID, USER_COLORS } from './types.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DATA_DIR = join(__dirname, '..', 'data')
const WORKSPACES_DIR = join(DATA_DIR, 'workspaces')

function workspaceFile(accountId: string) {
  return join(WORKSPACES_DIR, `${accountId}.json`)
}

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
  // 仅一人时不挂载「预览」，界面只保留用户本人
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

export function defaultWorkspace(ownerName = '旅客 1'): Workspace {
  const user = createUser(ownerName, 0)
  return {
    version: 2,
    activeUserId: user.id,
    users: [user],
  }
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

export function readWorkspace(accountId: string, ownerName?: string): Workspace {
  const fallbackName = ownerName?.trim() || '旅客 1'
  try {
    const file = workspaceFile(accountId)
    if (existsSync(file)) {
      const raw = JSON.parse(readFileSync(file, 'utf-8'))
      const normalized = normalizeWorkspace(raw)
      const travelers = listTravelers(normalized.users)
      const stops = travelers.reduce((sum, u) => sum + u.destinations.length, 0)
      // 空行程却有多名旅客：多为旧版全局数据误拷贝，收敛为账号本人
      if (travelers.length > 1 && stops === 0 && ownerName?.trim()) {
        return writeWorkspace(accountId, defaultWorkspace(fallbackName))
      }
      return normalized
    }
    // 新账号独立空行程，不再继承旧版全局 workspace.json
    return writeWorkspace(accountId, defaultWorkspace(fallbackName))
  } catch {
    return writeWorkspace(accountId, defaultWorkspace(fallbackName))
  }
}

/** 管理后台用：账号行程摘要（不存在则返回空） */
export function getWorkspaceSummary(accountId: string): {
  travelers: number
  stops: number
  hasWorkspace: boolean
} {
  const file = workspaceFile(accountId)
  if (!existsSync(file)) {
    return { travelers: 0, stops: 0, hasWorkspace: false }
  }
  try {
    const ws = normalizeWorkspace(JSON.parse(readFileSync(file, 'utf-8')))
    const travelers = listTravelers(ws.users)
    const stops = travelers.reduce((sum, u) => sum + u.destinations.length, 0)
    return { travelers: travelers.length, stops, hasWorkspace: true }
  } catch {
    return { travelers: 0, stops: 0, hasWorkspace: false }
  }
}

export function writeWorkspace(accountId: string, workspace: Workspace): Workspace {
  const normalized = normalizeWorkspace(workspace)
  mkdirSync(WORKSPACES_DIR, { recursive: true })
  writeFileSync(workspaceFile(accountId), JSON.stringify(normalized, null, 2), 'utf-8')
  return normalized
}

export function getActiveUser(workspace: Workspace): TripUser {
  const normalized = withPreviewUser(workspace)
  return normalized.users.find((u) => u.id === normalized.activeUserId) ?? normalized.users[0]
}

export function upsertActiveTrip(
  accountId: string,
  destinations: Destination[],
  activeGuideId: string | null,
): Workspace {
  const current = withPreviewUser(readWorkspace(accountId))
  const active = getActiveUser(current)
  if (isPreviewUser(active)) {
    return writeWorkspace(accountId, current)
  }
  const savedAt = new Date().toISOString()
  const users = current.users.map((u) =>
    u.id === current.activeUserId ? { ...u, destinations, activeGuideId, savedAt } : u,
  )
  return writeWorkspace(accountId, { ...current, users })
}

export function switchUser(accountId: string, userId: string): Workspace {
  const current = withPreviewUser(readWorkspace(accountId))
  if (!current.users.some((u) => u.id === userId)) return current
  return writeWorkspace(accountId, { ...current, activeUserId: userId })
}

export function addUser(accountId: string, name: string): Workspace {
  const current = withPreviewUser(readWorkspace(accountId))
  const travelers = listTravelers(current.users)
  const user = createUser(name, travelers.length)
  return writeWorkspace(accountId, {
    ...current,
    activeUserId: user.id,
    users: [...current.users, user],
  })
}

export function renameUser(accountId: string, userId: string, name: string): Workspace {
  const current = withPreviewUser(readWorkspace(accountId))
  if (userId === PREVIEW_USER_ID) return current
  const trimmed = name.trim()
  if (!trimmed) return current
  return writeWorkspace(accountId, {
    ...current,
    users: current.users.map((u) => (u.id === userId ? { ...u, name: trimmed } : u)),
  })
}

export function removeUser(accountId: string, userId: string): Workspace {
  const current = withPreviewUser(readWorkspace(accountId))
  if (userId === PREVIEW_USER_ID) return current
  const travelers = listTravelers(current.users)
  if (travelers.length <= 1) return current
  const users = current.users.filter((u) => u.id !== userId)
  const activeUserId =
    current.activeUserId === userId
      ? listTravelers(users)[0]?.id ?? PREVIEW_USER_ID
      : current.activeUserId
  return writeWorkspace(accountId, { version: 2, activeUserId, users })
}

export function clearActiveTrip(accountId: string): Workspace {
  const current = withPreviewUser(readWorkspace(accountId))
  if (isPreviewUser(getActiveUser(current))) return current
  return upsertActiveTrip(accountId, [], null)
}

function cloneDestinations(destinations: Destination[]): Destination[] {
  return destinations.map((d) => ({
    ...d,
    id: randomUUID(),
    ownerName: undefined,
    ownerColor: undefined,
  }))
}

/** 校验同行账号密码，将其本人行程拷贝为当前工作区的一名旅客 */
export function addLinkedCompanion(
  hostAccountId: string,
  peerUsername: string,
  peerPassword: string,
): Workspace {
  const peer = findAccountByUsername(peerUsername)
  if (!peer || !verifyPassword(peer, peerPassword)) {
    throw new Error('同行人账号或密码错误')
  }
  if (peer.disabled) throw new Error('该账号已被禁用')
  if (peer.role === 'admin') throw new Error('不能添加管理员账号为旅客')
  if (peer.id === hostAccountId) throw new Error('不能添加自己的账号')

  const peerWs = readWorkspace(peer.id, peer.displayName)
  const peerTravelers = listTravelers(peerWs.users)
  const source =
    peerTravelers.find((t) => t.name === peer.displayName || t.name === peer.account) ??
    peerTravelers[0] ??
    null
  const destinations = source ? cloneDestinations(source.destinations) : []
  const activeGuideId = destinations[0]?.id ?? null
  const savedAt = new Date().toISOString()

  const current = withPreviewUser(readWorkspace(hostAccountId))
  const travelers = listTravelers(current.users)
  const existing = travelers.find((u) => u.linkedAccountId === peer.id)

  if (existing) {
    const users = current.users.map((u) =>
      u.id === existing.id
        ? {
            ...u,
            name: peer.displayName,
            destinations,
            activeGuideId,
            savedAt,
            linkedAccountId: peer.id,
          }
        : u,
    )
    return writeWorkspace(hostAccountId, {
      ...current,
      activeUserId: existing.id,
      users,
    })
  }

  const user: TripUser = {
    id: randomUUID(),
    name: peer.displayName,
    color: USER_COLORS[travelers.length % USER_COLORS.length],
    savedAt,
    destinations,
    activeGuideId,
    role: 'traveler',
    linkedAccountId: peer.id,
  }
  return writeWorkspace(hostAccountId, {
    ...current,
    activeUserId: user.id,
    users: [...current.users, user],
  })
}
