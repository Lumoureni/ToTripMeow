import 'dotenv/config'
import cors from 'cors'
import express from 'express'
import type { NextFunction, Request, Response } from 'express'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  changeOwnPassword,
  createSession,
  deleteAccount,
  destroySession,
  ensureAdminAccount,
  findAccountById,
  findAccountByUsername,
  listAccountsPublic,
  publicUserFromAccount,
  registerAccount,
  resetAccountPassword,
  resolveSession,
  setAccountDisabled,
  verifyPassword,
  type AccountRole,
} from './authStore.js'
import { withFileLock } from './fileLock.js'
import { listLanAddresses } from './net.js'
import {
  addLinkedCompanion,
  addUser,
  clearActiveTrip,
  getWorkspaceSummary,
  normalizeWorkspace,
  readWorkspace,
  removeUser,
  renameUser,
  switchUser,
  upsertActiveTrip,
  upsertActiveCarryItems,
  writeWorkspace,
} from './store.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT_DIR = join(__dirname, '..')
const DIST_DIR = join(ROOT_DIR, 'dist')

const PORT = Number(process.env.PORT || 3001)
const HOST = process.env.HOST || '0.0.0.0'
const AMAP_KEY = process.env.AMAP_KEY || process.env.VITE_AMAP_KEY || ''

function parseCorsOrigins(): string[] | undefined {
  const raw = process.env.CORS_ORIGINS?.trim()
  if (!raw) return undefined
  const origins = raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  return origins.length > 0 ? origins : undefined
}

const corsOrigins = parseCorsOrigins()

type AuthedRequest = Request & {
  accountId?: string
  account?: string
  displayName?: string
  role?: AccountRole
  token?: string
}

const app = express()
app.use(
  cors(
    corsOrigins
      ? {
          origin: corsOrigins,
          credentials: true,
        }
      : undefined,
  ),
)
app.use(express.json({ limit: '2mb' }))

ensureAdminAccount()

function extractToken(req: Request): string | null {
  const header = req.headers.authorization
  if (typeof header === 'string' && header.toLowerCase().startsWith('bearer ')) {
    return header.slice(7).trim() || null
  }
  const fromBody = typeof req.body?.token === 'string' ? req.body.token : null
  return fromBody
}

function requireAuth(req: AuthedRequest, res: Response, next: NextFunction) {
  const token = extractToken(req)
  const session = resolveSession(token)
  if (!session) {
    res.status(401).json({ error: '未登录或登录已过期，请重新登录' })
    return
  }
  req.accountId = session.accountId
  req.account = session.account
  req.displayName = session.displayName
  req.role = session.role
  req.token = token ?? undefined
  next()
}

function requireAdmin(req: AuthedRequest, res: Response, next: NextFunction) {
  requireAuth(req, res, () => {
    if (req.role !== 'admin') {
      res.status(403).json({ error: '需要管理员权限' })
      return
    }
    next()
  })
}

function workspaceLockKey(accountId: string) {
  return `workspace:${accountId}`
}

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    service: 'to-trip-api',
    amapConfigured: Boolean(AMAP_KEY),
    time: new Date().toISOString(),
  })
})

/** 公开自助注册已关闭；账号仅由管理员在后台创建 */
app.post('/api/auth/register', (_req, res) => {
  res.status(403).json({ error: '当前已关闭自助注册，请联系管理员开户' })
})

app.post('/api/admin/accounts', requireAdmin, (req: AuthedRequest, res) => {
  try {
    const displayName = typeof req.body?.displayName === 'string' ? req.body.displayName : ''
    const accountLogin =
      typeof req.body?.account === 'string'
        ? req.body.account
        : typeof req.body?.username === 'string'
          ? req.body.username
          : ''
    const password = typeof req.body?.password === 'string' ? req.body.password : ''
    const account = registerAccount(displayName, accountLogin, password)
    readWorkspace(account.id, account.displayName)
    const row = listAccountsPublic().find((a) => a.id === account.id)
    res.status(201).json({
      account: { ...(row ?? publicUserFromAccount(account)), ...getWorkspaceSummary(account.id) },
    })
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : '创建失败' })
  }
})

app.post('/api/auth/login', (req, res) => {
  const login =
    typeof req.body?.account === 'string'
      ? req.body.account
      : typeof req.body?.username === 'string'
        ? req.body.username
        : ''
  const password = typeof req.body?.password === 'string' ? req.body.password : ''
  const account = findAccountByUsername(login)
  if (!account || !verifyPassword(account, password)) {
    res.status(401).json({ error: '账号或密码错误' })
    return
  }
  if (account.disabled) {
    res.status(403).json({ error: '账号已被禁用，请联系管理员' })
    return
  }
  const token = createSession(account)
  res.json({
    token,
    user: publicUserFromAccount(account),
  })
})

app.post('/api/auth/logout', requireAuth, (req: AuthedRequest, res) => {
  if (req.token) destroySession(req.token)
  res.json({ ok: true })
})

app.get('/api/auth/me', requireAuth, (req: AuthedRequest, res) => {
  const account = findAccountById(req.accountId!)
  if (!account) {
    res.status(401).json({ error: '账号不存在' })
    return
  }
  res.json({ user: publicUserFromAccount(account) })
})

app.post('/api/auth/change-password', requireAuth, (req: AuthedRequest, res) => {
  try {
    const currentPassword = typeof req.body?.currentPassword === 'string' ? req.body.currentPassword : ''
    const newPassword = typeof req.body?.newPassword === 'string' ? req.body.newPassword : ''
    const account = changeOwnPassword(req.accountId!, currentPassword, newPassword, req.token)
    res.json({ ok: true, user: publicUserFromAccount(findAccountById(account.id)!) })
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : '修改密码失败' })
  }
})

app.get('/api/admin/accounts', requireAdmin, (_req, res) => {
  const accounts = listAccountsPublic().map((account) => {
    const summary = getWorkspaceSummary(account.id)
    return { ...account, ...summary }
  })
  res.json({ accounts })
})

app.patch('/api/admin/accounts/:id', requireAdmin, (req: AuthedRequest, res) => {
  try {
    const id = String(req.params.id)
    if (typeof req.body?.disabled === 'boolean') {
      const account = setAccountDisabled(id, req.body.disabled, req.accountId!)
      res.json({ account: { ...account, ...getWorkspaceSummary(account.id) } })
      return
    }
    if (typeof req.body?.password === 'string') {
      const account = resetAccountPassword(id, req.body.password)
      res.json({ account: { ...account, ...getWorkspaceSummary(account.id) } })
      return
    }
    res.status(400).json({ error: '请提供 disabled 或 password 字段' })
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : '操作失败' })
  }
})

app.delete('/api/admin/accounts/:id', requireAdmin, (req: AuthedRequest, res) => {
  try {
    deleteAccount(String(req.params.id), req.accountId!)
    res.json({ ok: true })
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : '删除失败' })
  }
})

app.get('/api/workspace', requireAuth, (req: AuthedRequest, res) => {
  if (req.role === 'admin') {
    res.status(403).json({ error: '管理员请进入后台管理，不使用旅客行程工作区' })
    return
  }
  const account = findAccountById(req.accountId!)
  res.json(readWorkspace(req.accountId!, account?.displayName))
})

app.put('/api/workspace', requireAuth, async (req: AuthedRequest, res) => {
  if (req.role === 'admin') {
    res.status(403).json({ error: '管理员无行程工作区' })
    return
  }
  try {
    const workspace = await withFileLock(workspaceLockKey(req.accountId!), () =>
      writeWorkspace(req.accountId!, normalizeWorkspace(req.body)),
    )
    res.json(workspace)
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : '保存失败' })
  }
})

app.post('/api/workspace/users', requireAuth, async (req: AuthedRequest, res) => {
  if (req.role === 'admin') {
    res.status(403).json({ error: '管理员无行程工作区' })
    return
  }
  try {
    const name = typeof req.body?.name === 'string' ? req.body.name : ''
    const workspace = await withFileLock(workspaceLockKey(req.accountId!), () =>
      addUser(req.accountId!, name),
    )
    res.status(201).json(workspace)
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : '添加旅客失败' })
  }
})

app.post('/api/workspace/users/link', requireAuth, async (req: AuthedRequest, res) => {
  if (req.role === 'admin') {
    res.status(403).json({ error: '管理员无行程工作区' })
    return
  }
  try {
    const username =
      typeof req.body?.account === 'string'
        ? req.body.account
        : typeof req.body?.username === 'string'
          ? req.body.username
          : ''
    const password = typeof req.body?.password === 'string' ? req.body.password : ''
    const workspace = await withFileLock(workspaceLockKey(req.accountId!), () =>
      addLinkedCompanion(req.accountId!, username, password),
    )
    res.status(201).json(workspace)
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : '同步失败' })
  }
})

app.patch('/api/workspace/users/:id', requireAuth, async (req: AuthedRequest, res) => {
  if (req.role === 'admin') {
    res.status(403).json({ error: '管理员无行程工作区' })
    return
  }
  try {
    const name = typeof req.body?.name === 'string' ? req.body.name : ''
    const workspace = await withFileLock(workspaceLockKey(req.accountId!), () =>
      renameUser(req.accountId!, String(req.params.id), name),
    )
    res.json(workspace)
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : '重命名失败' })
  }
})

app.delete('/api/workspace/users/:id', requireAuth, async (req: AuthedRequest, res) => {
  if (req.role === 'admin') {
    res.status(403).json({ error: '管理员无行程工作区' })
    return
  }
  try {
    const workspace = await withFileLock(workspaceLockKey(req.accountId!), () =>
      removeUser(req.accountId!, String(req.params.id)),
    )
    res.json(workspace)
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : '删除失败' })
  }
})

app.post('/api/workspace/switch', requireAuth, async (req: AuthedRequest, res) => {
  if (req.role === 'admin') {
    res.status(403).json({ error: '管理员无行程工作区' })
    return
  }
  try {
    const userId = typeof req.body?.userId === 'string' ? req.body.userId : ''
    const workspace = await withFileLock(workspaceLockKey(req.accountId!), () =>
      switchUser(req.accountId!, userId),
    )
    res.json(workspace)
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : '切换失败' })
  }
})

app.put('/api/workspace/active-trip', requireAuth, async (req: AuthedRequest, res) => {
  if (req.role === 'admin') {
    res.status(403).json({ error: '管理员无行程工作区' })
    return
  }
  try {
    const destinations = Array.isArray(req.body?.destinations) ? req.body.destinations : []
    const activeGuideId =
      typeof req.body?.activeGuideId === 'string' || req.body?.activeGuideId === null
        ? req.body.activeGuideId
        : null
    const workspace = await withFileLock(workspaceLockKey(req.accountId!), () =>
      upsertActiveTrip(req.accountId!, destinations, activeGuideId),
    )
    res.json(workspace)
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : '保存行程失败' })
  }
})

app.put('/api/workspace/active-carry-items', requireAuth, async (req: AuthedRequest, res) => {
  if (req.role === 'admin') {
    res.status(403).json({ error: '管理员无行程工作区' })
    return
  }
  try {
    const carryItems = Array.isArray(req.body?.carryItems) ? req.body.carryItems : []
    const workspace = await withFileLock(workspaceLockKey(req.accountId!), () =>
      upsertActiveCarryItems(req.accountId!, carryItems),
    )
    res.json(workspace)
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : '保存携带物品失败' })
  }
})

app.post('/api/workspace/active-trip/clear', requireAuth, async (req: AuthedRequest, res) => {
  if (req.role === 'admin') {
    res.status(403).json({ error: '管理员无行程工作区' })
    return
  }
  try {
    const workspace = await withFileLock(workspaceLockKey(req.accountId!), () =>
      clearActiveTrip(req.accountId!),
    )
    res.json(workspace)
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : '清除失败' })
  }
})

app.use('/api/amap', requireAuth, async (req: AuthedRequest, res) => {
  if (req.role === 'admin') {
    res.status(403).json({ status: '0', info: '管理员无需调用地图服务' })
    return
  }
  try {
    if (!AMAP_KEY) {
      res.status(500).json({ status: '0', info: '服务器未配置 AMAP_KEY' })
      return
    }
    const incoming = new URL(req.originalUrl, 'http://127.0.0.1')
    const target = new URL(
      `${incoming.pathname.replace(/^\/api\/amap/, '')}${incoming.search}`,
      'https://restapi.amap.com',
    )
    target.searchParams.set('key', AMAP_KEY)

    const upstream = await fetch(target.toString(), {
      headers: { Accept: 'application/json' },
    })
    const body = await upstream.text()
    res.status(upstream.status)
    res.setHeader('Content-Type', upstream.headers.get('content-type') || 'application/json')
    res.setHeader('Cache-Control', 'no-store')
    res.send(body)
  } catch (err) {
    res.status(502).json({
      status: '0',
      info: err instanceof Error ? err.message : '高德代理请求失败',
    })
  }
})

if (existsSync(DIST_DIR)) {
  app.use(express.static(DIST_DIR))
  app.get(/^(?!\/api).*/, (_req, res) => {
    res.sendFile(join(DIST_DIR, 'index.html'))
  })
} else {
  app.use((_req, res) => {
    res.status(404).json({ error: 'Not Found' })
  })
}

app.listen(PORT, HOST, () => {
  console.log(`To Trip running at http://127.0.0.1:${PORT}`)
  for (const ip of listLanAddresses()) {
    console.log(`  LAN: http://${ip}:${PORT}`)
  }
  if (existsSync(DIST_DIR)) {
    console.log('Serving frontend from dist/')
  } else {
    console.log('dist/ not found — API only (run npm run build for production UI)')
  }
  if (!AMAP_KEY) {
    console.warn('Warning: AMAP_KEY is missing — place/route APIs will fail')
  }
  if (corsOrigins) {
    console.log(`CORS allowed origins: ${corsOrigins.join(', ')}`)
  } else {
    console.log('CORS: all origins allowed (set CORS_ORIGINS for production)')
  }
})
