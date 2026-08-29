import 'dotenv/config'
import cors from 'cors'
import express from 'express'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { withFileLock } from './fileLock.js'
import { listLanAddresses } from './net.js'
import {
  addUser,
  clearActiveTrip,
  normalizeWorkspace,
  readWorkspace,
  removeUser,
  renameUser,
  switchUser,
  upsertActiveTrip,
  writeWorkspace,
} from './store.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT_DIR = join(__dirname, '..')
const DIST_DIR = join(ROOT_DIR, 'dist')
const WORKSPACE_LOCK = 'workspace'

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

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    service: 'to-trip-api',
    amapConfigured: Boolean(AMAP_KEY),
    time: new Date().toISOString(),
  })
})

app.get('/api/workspace', (_req, res) => {
  res.json(readWorkspace())
})

app.put('/api/workspace', async (req, res) => {
  try {
    const workspace = await withFileLock(WORKSPACE_LOCK, () =>
      writeWorkspace(normalizeWorkspace(req.body)),
    )
    res.json(workspace)
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : '保存失败' })
  }
})

app.post('/api/workspace/users', async (req, res) => {
  try {
    const name = typeof req.body?.name === 'string' ? req.body.name : ''
    const workspace = await withFileLock(WORKSPACE_LOCK, () => addUser(readWorkspace(), name))
    res.status(201).json(workspace)
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : '添加旅客失败' })
  }
})

app.patch('/api/workspace/users/:id', async (req, res) => {
  try {
    const name = typeof req.body?.name === 'string' ? req.body.name : ''
    const workspace = await withFileLock(WORKSPACE_LOCK, () =>
      renameUser(readWorkspace(), req.params.id, name),
    )
    res.json(workspace)
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : '重命名失败' })
  }
})

app.delete('/api/workspace/users/:id', async (req, res) => {
  try {
    const workspace = await withFileLock(WORKSPACE_LOCK, () =>
      removeUser(readWorkspace(), req.params.id),
    )
    res.json(workspace)
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : '删除失败' })
  }
})

app.post('/api/workspace/switch', async (req, res) => {
  try {
    const userId = typeof req.body?.userId === 'string' ? req.body.userId : ''
    const workspace = await withFileLock(WORKSPACE_LOCK, () => switchUser(readWorkspace(), userId))
    res.json(workspace)
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : '切换失败' })
  }
})

app.put('/api/workspace/active-trip', async (req, res) => {
  try {
    const destinations = Array.isArray(req.body?.destinations) ? req.body.destinations : []
    const activeGuideId =
      typeof req.body?.activeGuideId === 'string' || req.body?.activeGuideId === null
        ? req.body.activeGuideId
        : null
    const workspace = await withFileLock(WORKSPACE_LOCK, () =>
      upsertActiveTrip(readWorkspace(), destinations, activeGuideId),
    )
    res.json(workspace)
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : '保存行程失败' })
  }
})

app.post('/api/workspace/active-trip/clear', async (_req, res) => {
  try {
    const workspace = await withFileLock(WORKSPACE_LOCK, () => clearActiveTrip(readWorkspace()))
    res.json(workspace)
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : '清除失败' })
  }
})

app.use('/api/amap', async (req, res) => {
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
