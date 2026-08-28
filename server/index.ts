import 'dotenv/config'
import cors from 'cors'
import express from 'express'
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

const PORT = Number(process.env.PORT || 3001)
const AMAP_KEY = process.env.AMAP_KEY || process.env.VITE_AMAP_KEY || ''

const app = express()
app.use(cors())
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

app.put('/api/workspace', (req, res) => {
  const workspace = writeWorkspace(normalizeWorkspace(req.body))
  res.json(workspace)
})

app.post('/api/workspace/users', (req, res) => {
  const name = typeof req.body?.name === 'string' ? req.body.name : ''
  const workspace = addUser(readWorkspace(), name)
  res.status(201).json(workspace)
})

app.patch('/api/workspace/users/:id', (req, res) => {
  const name = typeof req.body?.name === 'string' ? req.body.name : ''
  const workspace = renameUser(readWorkspace(), req.params.id, name)
  res.json(workspace)
})

app.delete('/api/workspace/users/:id', (req, res) => {
  const workspace = removeUser(readWorkspace(), req.params.id)
  res.json(workspace)
})

app.post('/api/workspace/switch', (req, res) => {
  const userId = typeof req.body?.userId === 'string' ? req.body.userId : ''
  const workspace = switchUser(readWorkspace(), userId)
  res.json(workspace)
})

app.put('/api/workspace/active-trip', (req, res) => {
  const destinations = Array.isArray(req.body?.destinations) ? req.body.destinations : []
  const activeGuideId =
    typeof req.body?.activeGuideId === 'string' || req.body?.activeGuideId === null
      ? req.body.activeGuideId
      : null
  const workspace = upsertActiveTrip(readWorkspace(), destinations, activeGuideId)
  res.json(workspace)
})

app.post('/api/workspace/active-trip/clear', (_req, res) => {
  res.json(clearActiveTrip(readWorkspace()))
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

app.use((_req, res) => {
  res.status(404).json({ error: 'Not Found' })
})

app.listen(PORT, () => {
  console.log(`To Trip API running at http://127.0.0.1:${PORT}`)
  if (!AMAP_KEY) {
    console.warn('Warning: AMAP_KEY is missing — place/route APIs will fail')
  }
})
