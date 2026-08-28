import AMapLoader from '@amap/amap-jsapi-loader'

export type AMapNamespace = typeof window.AMap

let loading: Promise<AMapNamespace> | null = null

declare global {
  interface Window {
    AMap: any
    _AMapSecurityConfig?: { securityJsCode?: string }
  }
}

export function loadAMap(): Promise<AMapNamespace> {
  if (window.AMap) return Promise.resolve(window.AMap)
  if (loading) return loading

  const key = import.meta.env.VITE_AMAP_KEY as string | undefined
  const securityCode = import.meta.env.VITE_AMAP_SECURITY_CODE as string | undefined

  if (!key) {
    return Promise.reject(new Error('未配置 VITE_AMAP_KEY，请在 .env 中填写高德 Key'))
  }

  if (securityCode) {
    window._AMapSecurityConfig = { securityJsCode: securityCode }
  }

  loading = AMapLoader.load({
    key,
    version: '2.0',
    plugins: ['AMap.ToolBar', 'AMap.Scale'],
  }).then((AMap) => {
    window.AMap = AMap
    return AMap
  }).catch((err) => {
    loading = null
    throw err
  })

  return loading
}
