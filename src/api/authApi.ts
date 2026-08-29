import { clearAuthSession, getAuthToken, loadAuthSession, saveAuthSession, type AuthSession, type AuthUser } from '../utils/authStorage'

export type AdminAccountRow = {
  id: string
  account: string
  displayName: string
  createdAt: string
  role: 'admin' | 'user'
  disabled: boolean
  travelers: number
  stops: number
  hasWorkspace: boolean
}

function normalizeUser(raw: Partial<AuthUser> & { username?: string }): AuthUser {
  const displayName =
    typeof raw.displayName === 'string' && raw.displayName.trim()
      ? raw.displayName
      : typeof raw.username === 'string'
        ? raw.username
        : ''
  const account =
    typeof raw.account === 'string' && raw.account.trim()
      ? raw.account
      : typeof raw.username === 'string'
        ? raw.username
        : displayName
  return {
    id: String(raw.id || ''),
    account,
    displayName,
    role: raw.role === 'admin' ? 'admin' : 'user',
  }
}

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
    throw new Error('无法连接后端，请先运行 npm run dev')
  }
  if (res.status === 401) {
    clearAuthSession()
    throw new Error('登录已过期，请重新登录')
  }
  if (!res.ok) {
    let message = `请求失败 HTTP ${res.status}`
    try {
      const body = (await res.json()) as { error?: string }
      if (body.error) message = body.error
    } catch {
      // ignore
    }
    throw new Error(message)
  }
  return (await res.json()) as T
}

export async function apiLogin(account: string, password: string): Promise<AuthSession> {
  const data = await request<{ token: string; user: AuthUser & { username?: string } }>(
    '/api/auth/login',
    {
      method: 'POST',
      body: JSON.stringify({ account, password }),
    },
  )
  const session: AuthSession = { token: data.token, user: normalizeUser(data.user) }
  saveAuthSession(session)
  return session
}

export async function apiLogout(): Promise<void> {
  const session = loadAuthSession()
  if (!session) return
  try {
    await request('/api/auth/logout', {
      method: 'POST',
      body: '{}',
    })
  } finally {
    clearAuthSession()
  }
}

export async function apiMe(): Promise<AuthSession['user']> {
  const session = loadAuthSession()
  if (!session) throw new Error('未登录')
  const data = await request<{ user: AuthUser & { username?: string } }>('/api/auth/me')
  const user = normalizeUser(data.user)
  saveAuthSession({ token: session.token, user })
  return user
}

export async function apiChangePassword(currentPassword: string, newPassword: string): Promise<void> {
  await request<{ ok: boolean }>('/api/auth/change-password', {
    method: 'POST',
    body: JSON.stringify({ currentPassword, newPassword }),
  })
}

export async function apiAdminListAccounts(): Promise<AdminAccountRow[]> {
  const data = await request<{ accounts: AdminAccountRow[] }>('/api/admin/accounts')
  return data.accounts
}

export async function apiAdminCreateAccount(
  displayName: string,
  account: string,
  password: string,
): Promise<AdminAccountRow> {
  const data = await request<{ account: AdminAccountRow }>('/api/admin/accounts', {
    method: 'POST',
    body: JSON.stringify({ displayName, account, password }),
  })
  return data.account
}

export async function apiAdminSetDisabled(id: string, disabled: boolean): Promise<AdminAccountRow> {
  const data = await request<{ account: AdminAccountRow }>(`/api/admin/accounts/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ disabled }),
  })
  return data.account
}

export async function apiAdminResetPassword(id: string, password: string): Promise<AdminAccountRow> {
  const data = await request<{ account: AdminAccountRow }>(`/api/admin/accounts/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ password }),
  })
  return data.account
}

export async function apiAdminDeleteAccount(id: string): Promise<void> {
  await request(`/api/admin/accounts/${id}`, { method: 'DELETE' })
}
