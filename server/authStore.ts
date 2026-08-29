import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DATA_DIR = join(__dirname, '..', 'data')
const ACCOUNTS_FILE = join(DATA_DIR, 'accounts.json')
const SESSIONS_FILE = join(DATA_DIR, 'sessions.json')
const WORKSPACES_DIR = join(DATA_DIR, 'workspaces')

export type AccountRole = 'admin' | 'user'

export type Account = {
  id: string
  /** 登录依据 */
  account: string
  /** 仅显示用的用户名 */
  displayName: string
  passwordHash: string
  salt: string
  createdAt: string
  role: AccountRole
  disabled?: boolean
}

export type PublicAccount = {
  id: string
  account: string
  displayName: string
  createdAt: string
  role: AccountRole
  disabled: boolean
}

type AccountsFile = { version: 1; accounts: Account[] }
type SessionsFile = {
  version: 1
  sessions: Record<
    string,
    {
      accountId: string
      account: string
      displayName: string
      role: AccountRole
      expiresAt: number
    }
  >
}

const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 14 // 14 days

function ensureDataDir() {
  mkdirSync(DATA_DIR, { recursive: true })
}

function normalizeAccount(login: string) {
  return login.trim().toLowerCase()
}

function normalizeDisplayName(name: string) {
  return name.trim()
}

/** 兼容旧数据：username → account + displayName */
function migrateAccount(raw: Partial<Account> & { username?: string }): Account | null {
  if (!raw || typeof raw.id !== 'string') return null
  const account =
    typeof raw.account === 'string' && raw.account.trim()
      ? normalizeAccount(raw.account)
      : typeof raw.username === 'string' && raw.username.trim()
        ? normalizeAccount(raw.username)
        : ''
  if (!account || typeof raw.passwordHash !== 'string' || typeof raw.salt !== 'string') return null
  const displayName =
    typeof raw.displayName === 'string' && raw.displayName.trim()
      ? normalizeDisplayName(raw.displayName)
      : account
  return {
    id: raw.id,
    account,
    displayName,
    passwordHash: raw.passwordHash,
    salt: raw.salt,
    createdAt: typeof raw.createdAt === 'string' ? raw.createdAt : new Date().toISOString(),
    role: raw.role === 'admin' ? 'admin' : 'user',
    disabled: Boolean(raw.disabled),
  }
}

function readAccounts(): AccountsFile {
  try {
    if (!existsSync(ACCOUNTS_FILE)) return { version: 1, accounts: [] }
    const raw = JSON.parse(readFileSync(ACCOUNTS_FILE, 'utf-8')) as Partial<AccountsFile>
    const accounts = Array.isArray(raw.accounts)
      ? raw.accounts.map((a) => migrateAccount(a)).filter((a): a is Account => Boolean(a))
      : []
    return { version: 1, accounts }
  } catch {
    return { version: 1, accounts: [] }
  }
}

function writeAccounts(data: AccountsFile) {
  ensureDataDir()
  writeFileSync(ACCOUNTS_FILE, JSON.stringify(data, null, 2), 'utf-8')
}

function readSessions(): SessionsFile {
  try {
    if (!existsSync(SESSIONS_FILE)) return { version: 1, sessions: {} }
    const raw = JSON.parse(readFileSync(SESSIONS_FILE, 'utf-8')) as {
      version?: number
      sessions?: Record<string, Partial<SessionsFile['sessions'][string]> & { username?: string }>
    }
    const sessions: SessionsFile['sessions'] = {}
    if (raw.sessions && typeof raw.sessions === 'object') {
      for (const [token, s] of Object.entries(raw.sessions)) {
        if (!s || typeof s.accountId !== 'string' || typeof s.expiresAt !== 'number') continue
        sessions[token] = {
          accountId: s.accountId,
          account:
            typeof s.account === 'string'
              ? s.account
              : typeof s.username === 'string'
                ? s.username
                : '',
          displayName:
            typeof s.displayName === 'string'
              ? s.displayName
              : typeof s.username === 'string'
                ? s.username
                : '',
          role: s.role === 'admin' ? 'admin' : 'user',
          expiresAt: s.expiresAt,
        }
      }
    }
    return { version: 1, sessions }
  } catch {
    return { version: 1, sessions: {} }
  }
}

function writeSessions(data: SessionsFile) {
  ensureDataDir()
  const now = Date.now()
  const sessions: SessionsFile['sessions'] = {}
  for (const [token, session] of Object.entries(data.sessions)) {
    if (session.expiresAt > now) sessions[token] = session
  }
  writeFileSync(SESSIONS_FILE, JSON.stringify({ version: 1, sessions }, null, 2), 'utf-8')
}

function hashPassword(password: string, salt: string) {
  return scryptSync(password, salt, 64).toString('hex')
}

function toPublic(account: Account): PublicAccount {
  return {
    id: account.id,
    account: account.account,
    displayName: account.displayName,
    createdAt: account.createdAt,
    role: account.role,
    disabled: Boolean(account.disabled),
  }
}

export function findAccountByLogin(login: string): Account | null {
  const key = normalizeAccount(login)
  return readAccounts().accounts.find((a) => a.account === key) ?? null
}

/** @deprecated 使用 findAccountByLogin */
export function findAccountByUsername(username: string): Account | null {
  return findAccountByLogin(username)
}

export function findAccountById(id: string): Account | null {
  return readAccounts().accounts.find((a) => a.id === id) ?? null
}

/** 启动时确保存在管理员账号（可用环境变量覆盖） */
export function ensureAdminAccount() {
  const login = normalizeAccount(process.env.ADMIN_USERNAME || 'admin')
  const password = process.env.ADMIN_PASSWORD || 'admin123'
  const displayName = normalizeDisplayName(process.env.ADMIN_DISPLAY_NAME || '管理员')
  const file = readAccounts()
  const existing = file.accounts.find((a) => a.account === login || a.role === 'admin')
  if (existing) {
    let dirty = false
    if (existing.role !== 'admin') {
      existing.role = 'admin'
      dirty = true
    }
    if (existing.disabled) {
      existing.disabled = false
      dirty = true
    }
    if (!existing.displayName) {
      existing.displayName = displayName
      dirty = true
    }
    if (dirty) writeAccounts(file)
    return toPublic(existing)
  }
  const salt = randomBytes(16).toString('hex')
  const account: Account = {
    id: randomBytes(16).toString('hex'),
    account: login,
    displayName,
    passwordHash: hashPassword(password, salt),
    salt,
    createdAt: new Date().toISOString(),
    role: 'admin',
    disabled: false,
  }
  file.accounts.push(account)
  writeAccounts(file)
  console.log(`Admin account ready: account=${login} (default password from ADMIN_PASSWORD or admin123)`)
  return toPublic(account)
}

export function registerAccount(displayName: string, account: string, password: string): Account {
  const name = normalizeDisplayName(displayName)
  const login = normalizeAccount(account)
  if (!/^[\u4e00-\u9fffa-zA-Z0-9_·\s]{1,20}$/.test(name)) {
    throw new Error('用户名需为 1–20 个字符（中文、字母、数字、下划线）')
  }
  if (!/^[a-z0-9_]{3,20}$/.test(login)) {
    throw new Error('账号需为 3–20 位小写字母、数字或下划线')
  }
  if (login === 'admin') {
    throw new Error('该账号为系统保留，请换一个')
  }
  if (password.length < 4) {
    throw new Error('密码至少 4 位')
  }
  const file = readAccounts()
  if (file.accounts.some((a) => a.account === login)) {
    throw new Error('该账号已被占用')
  }
  const salt = randomBytes(16).toString('hex')
  const row: Account = {
    id: randomBytes(16).toString('hex'),
    account: login,
    displayName: name,
    passwordHash: hashPassword(password, salt),
    salt,
    createdAt: new Date().toISOString(),
    role: 'user',
    disabled: false,
  }
  file.accounts.push(row)
  writeAccounts(file)
  return row
}

export function verifyPassword(account: Account, password: string): boolean {
  const hash = hashPassword(password, account.salt)
  try {
    return timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(account.passwordHash, 'hex'))
  } catch {
    return false
  }
}

export function createSession(account: Account): string {
  const token = randomBytes(32).toString('hex')
  const file = readSessions()
  file.sessions[token] = {
    accountId: account.id,
    account: account.account,
    displayName: account.displayName,
    role: account.role,
    expiresAt: Date.now() + SESSION_TTL_MS,
  }
  writeSessions(file)
  return token
}

export function destroySession(token: string) {
  const file = readSessions()
  delete file.sessions[token]
  writeSessions(file)
}

export function destroySessionsForAccount(accountId: string) {
  const file = readSessions()
  for (const [token, session] of Object.entries(file.sessions)) {
    if (session.accountId === accountId) delete file.sessions[token]
  }
  writeSessions(file)
}

export function resolveSession(token: string | null | undefined): {
  accountId: string
  account: string
  displayName: string
  role: AccountRole
} | null {
  if (!token) return null
  const file = readSessions()
  const session = file.sessions[token]
  if (!session) return null
  if (session.expiresAt <= Date.now()) {
    delete file.sessions[token]
    writeSessions(file)
    return null
  }
  const row = findAccountById(session.accountId)
  if (!row || row.disabled) {
    delete file.sessions[token]
    writeSessions(file)
    return null
  }
  session.role = row.role
  session.account = row.account
  session.displayName = row.displayName
  session.expiresAt = Date.now() + SESSION_TTL_MS
  writeSessions(file)
  return {
    accountId: session.accountId,
    account: session.account,
    displayName: session.displayName,
    role: row.role,
  }
}

export function listAccountsPublic(): PublicAccount[] {
  return readAccounts().accounts.map(toPublic)
}

export function setAccountDisabled(accountId: string, disabled: boolean, actorId: string): PublicAccount {
  const file = readAccounts()
  const account = file.accounts.find((a) => a.id === accountId)
  if (!account) throw new Error('账号不存在')
  if (account.id === actorId) throw new Error('不能禁用当前登录账号')
  if (account.role === 'admin' && disabled) {
    const admins = file.accounts.filter((a) => a.role === 'admin' && !a.disabled)
    if (admins.length <= 1) throw new Error('不能禁用唯一的管理员')
  }
  account.disabled = disabled
  writeAccounts(file)
  if (disabled) destroySessionsForAccount(accountId)
  return toPublic(account)
}

export function resetAccountPassword(accountId: string, newPassword: string): PublicAccount {
  if (newPassword.length < 4) throw new Error('密码至少 4 位')
  const file = readAccounts()
  const account = file.accounts.find((a) => a.id === accountId)
  if (!account) throw new Error('账号不存在')
  account.salt = randomBytes(16).toString('hex')
  account.passwordHash = hashPassword(newPassword, account.salt)
  writeAccounts(file)
  destroySessionsForAccount(accountId)
  return toPublic(account)
}

/** 当前登录用户修改自己的密码；可保留本次会话 token */
export function changeOwnPassword(
  accountId: string,
  currentPassword: string,
  newPassword: string,
  keepToken?: string | null,
): PublicAccount {
  if (newPassword.length < 4) throw new Error('新密码至少 4 位')
  if (currentPassword === newPassword) throw new Error('新密码不能与当前密码相同')
  const file = readAccounts()
  const account = file.accounts.find((a) => a.id === accountId)
  if (!account) throw new Error('账号不存在')
  if (!verifyPassword(account, currentPassword)) throw new Error('当前密码不正确')
  account.salt = randomBytes(16).toString('hex')
  account.passwordHash = hashPassword(newPassword, account.salt)
  writeAccounts(file)

  const sessions = readSessions()
  for (const [token, session] of Object.entries(sessions.sessions)) {
    if (session.accountId === accountId && token !== keepToken) {
      delete sessions.sessions[token]
    }
  }
  writeSessions(sessions)
  return toPublic(account)
}

export function deleteAccount(accountId: string, actorId: string): void {
  const file = readAccounts()
  const account = file.accounts.find((a) => a.id === accountId)
  if (!account) throw new Error('账号不存在')
  if (account.id === actorId) throw new Error('不能删除当前登录账号')
  if (account.role === 'admin') {
    const admins = file.accounts.filter((a) => a.role === 'admin' && !a.disabled)
    if (admins.length <= 1) throw new Error('不能删除唯一的管理员')
  }
  file.accounts = file.accounts.filter((a) => a.id !== accountId)
  writeAccounts(file)
  destroySessionsForAccount(accountId)
  const ws = join(WORKSPACES_DIR, `${accountId}.json`)
  if (existsSync(ws)) rmSync(ws, { force: true })
}

export function publicUserFromAccount(account: Account) {
  return {
    id: account.id,
    account: account.account,
    displayName: account.displayName,
    /** 兼容旧前端：展示名 */
    username: account.displayName,
    role: account.role,
  }
}
