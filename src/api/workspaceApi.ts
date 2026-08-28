import type { Destination } from '../types'
import type { Workspace } from '../utils/tripStorage'
import { saveWorkspace } from '../utils/tripStorage'

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response
  try {
    res = await fetch(path, {
      headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) },
      ...init,
    })
  } catch {
    throw new Error('无法连接后端，请先运行 npm run dev（需同时启动 API）')
  }
  if (!res.ok) {
    const text = await res.text()
    throw new Error(text || `请求失败 HTTP ${res.status}`)
  }
  return (await res.json()) as T
}

function cache(workspace: Workspace) {
  saveWorkspace(workspace)
  return workspace
}

export async function apiHealth(): Promise<{ ok: boolean; amapConfigured: boolean }> {
  return request('/api/health')
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

export async function apiClearActiveTrip(): Promise<Workspace> {
  return cache(
    await request<Workspace>('/api/workspace/active-trip/clear', {
      method: 'POST',
      body: '{}',
    }),
  )
}
