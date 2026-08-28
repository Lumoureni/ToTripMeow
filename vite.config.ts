import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv, type Plugin } from 'vite'

function amapProxyPlugin(amapKey: string): Plugin {
  return {
    name: 'amap-proxy',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (!req.url?.startsWith('/api/amap')) return next()
        try {
          const incoming = new URL(req.url, 'http://127.0.0.1')
          const target = new URL(
            `${incoming.pathname.replace(/^\/api\/amap/, '')}${incoming.search}`,
            'https://restapi.amap.com',
          )
          if (amapKey) target.searchParams.set('key', amapKey)

          const upstream = await fetch(target.toString(), {
            headers: { Accept: 'application/json' },
          })
          const body = await upstream.text()
          res.statusCode = upstream.status
          res.setHeader('Content-Type', upstream.headers.get('content-type') || 'application/json')
          res.setHeader('Cache-Control', 'no-store')
          res.end(body)
        } catch (err) {
          res.statusCode = 502
          res.setHeader('Content-Type', 'application/json')
          res.end(
            JSON.stringify({
              status: '0',
              info: err instanceof Error ? err.message : '高德代理请求失败',
            }),
          )
        }
      })
    },
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const amapKey = env.AMAP_KEY || env.VITE_AMAP_KEY || ''

  return {
    plugins: [react(), amapProxyPlugin(amapKey)],
  }
})
