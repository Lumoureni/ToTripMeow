import type { Destination } from '../types'
import type { CarryItem, Workspace } from '../utils/tripStorage'
import { saveWorkspace } from '../utils/tripStorage'
import { clearAuthSession, getAuthToken } from '../utils/authStorage'

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const token = getAuthToken()
  let res: Response
  try {
    res = await fetch(path, {
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(init?.headers || {}),
      },
      ...init,
    })
  } catch {
    throw new Error('无法连接后端，请先运行 npm run dev（需同时启动 API）')
  }
  if (res.status === 401) {
    clearAuthSession()
    throw new Error('登录已过期，请重新登录')
  }
  const text = await res.text()
  if (!res.ok) {
    let message = `请求失败 HTTP ${res.status}`
    try {
      const body = JSON.parse(text) as { error?: string }
      if (body.error) message = body.error
    } catch {
      if (text) message = text
    }
    throw new Error(message)
  }
  if (!text) return {} as T
  return JSON.parse(text) as T
}

function cache(workspace: Workspace) {
  saveWorkspace(workspace)
  return workspace
}

export async function apiHealth(): Promise<{ ok: boolean; amapConfigured: boolean }> {
  let res: Response
  try {
    res = await fetch('/api/health')
  } catch {
    throw new Error('无法连接后端，请先运行 npm run dev（需同时启动 API）')
  }
  if (!res.ok) throw new Error(`健康检查失败 HTTP ${res.status}`)
  return (await res.json()) as { ok: boolean; amapConfigured: boolean }
}

export async function apiGetWorkspace(): Promise<Workspace> {
  return cache(await request<Workspace>('/api/workspace'))
}

export async function apiPutWorkspace(workspace: Workspace): Promise<Workspace> {
  return cache(
    await request<Workspace>('/api/workspace', {
      method: 'PUT',
      body: JSON.stringify(workspace),
    }),
  )
}

export async function apiAddUser(name: string): Promise<Workspace> {
  return cache(
    await request<Workspace>('/api/workspace/users', {
      method: 'POST',
      body: JSON.stringify({ name }),
    }),
  )
}

export async function apiLinkCompanion(username: string, password: string): Promise<Workspace> {
  return cache(
    await request<Workspace>('/api/workspace/users/link', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    }),
  )
}

export async function apiRenameUser(userId: string, name: string): Promise<Workspace> {
  return cache(
    await request<Workspace>(`/api/workspace/users/${userId}`, {
      method: 'PATCH',
      body: JSON.stringify({ name }),
    }),
  )
}

export async function apiRemoveUser(userId: string): Promise<Workspace> {
  return cache(await request<Workspace>(`/api/workspace/users/${userId}`, { method: 'DELETE' }))
}

export async function apiSwitchUser(userId: string): Promise<Workspace> {
  return cache(
    await request<Workspace>('/api/workspace/switch', {
      method: 'POST',
      body: JSON.stringify({ userId }),
    }),
  )
}

export async function apiPutActiveTrip(
  destinations: Destination[],
  activeGuideId: string | null,
): Promise<Workspace> {
  return cache(
    await request<Workspace>('/api/workspace/active-trip', {
      method: 'PUT',
      body: JSON.stringify({ destinations, activeGuideId }),
    }),
  )
}

export async function apiPutActiveCarryItems(carryItems: CarryItem[]): Promise<Workspace> {
  return cache(
    await request<Workspace>('/api/workspace/active-carry-items', {
      method: 'PUT',
      body: JSON.stringify({ carryItems }),
    }),
  )
}

export async function apiClearActiveTrip(): Promise<Workspace> {
  return cache(
    await request<Workspace>('/api/workspace/active-trip/clear', {
      method: 'POST',
      body: '{}',
    }),
  )
}
