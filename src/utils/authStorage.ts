const AUTH_KEY = 'to-trip:auth-v1'

export type AccountRole = 'admin' | 'user'

export type AuthUser = {
  id: string
  /** 登录账号 */
  account: string
  /** 显示用用户名 */
  displayName: string
  role: AccountRole
}

export type AuthSession = {
  token: string
  user: AuthUser
}

export function loadAuthSession(): AuthSession | null {
  try {
    const raw = localStorage.getItem(AUTH_KEY)
    if (!raw) return null
    const data = JSON.parse(raw) as Partial<AuthSession> & {
      user?: Partial<AuthUser> & { username?: string }
    }
    if (typeof data.token !== 'string' || !data.user || typeof data.user.id !== 'string') {
      return null
    }
    const displayName =
      typeof data.user.displayName === 'string' && data.user.displayName.trim()
        ? data.user.displayName
        : typeof data.user.username === 'string'
          ? data.user.username
          : ''
    const account =
      typeof data.user.account === 'string' && data.user.account.trim()
        ? data.user.account
        : typeof data.user.username === 'string'
          ? data.user.username
          : displayName
    if (!displayName) return null
    return {
      token: data.token,
      user: {
        id: data.user.id,
        account,
        displayName,
        role: data.user.role === 'admin' ? 'admin' : 'user',
      },
    }
  } catch {
    // ignore
  }
  return null
}

export function saveAuthSession(session: AuthSession) {
  localStorage.setItem(AUTH_KEY, JSON.stringify(session))
}

export function clearAuthSession() {
  localStorage.removeItem(AUTH_KEY)
}

export function getAuthToken(): string | null {
  return loadAuthSession()?.token ?? null
}
