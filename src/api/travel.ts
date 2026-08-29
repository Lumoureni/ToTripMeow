import type {
  Destination,
  GuideCategory,
  GuidePlace,
  PlaceBrief,
  RouteInfo,
  RouteOption,
} from '../types'
import { extractPlaceCandidates } from '../utils/extractPlaces'
import { getAuthToken } from '../utils/authStorage'

type AmapStatus = { status: string; info: string; infocode?: string }

type AmapPoi = {
  id: string
  name: string
  address?: string
  location: string
  pname?: string
  cityname?: string
  adname?: string
  type?: string
  tel?: string
  distance?: string
}

type SearchResponse = AmapStatus & { pois?: AmapPoi[]; count?: string }

type DriveResponse = AmapStatus & {
  route?: {
    paths?: Array<{
      distance: string
      duration: string
      steps?: Array<{ polyline: string }>
    }>
  }
}

const CATEGORY_TYPES: Record<GuideCategory, string> = {
  eat: '050000',
  drink: '050500|050700|141201',
  stay: '100000',
  go: '110000|150500|150700',
}

const CATEGORY_KEYWORDS: Record<GuideCategory, string> = {
  eat: '美食',
  drink: '咖啡',
  stay: '酒店',
  go: '景点',
}

function assertOk<T extends AmapStatus>(data: T, fallback: string): T {
  if (data.status === '1') return data
  const detail = data.info || fallback
  if (detail.includes('INVALID_USER_KEY') || detail.includes('USERKEY_PLAT_NOMATCH')) {
    throw new Error('高德 Key 无效或类型不匹配：请确认已开通「Web服务」且 Key 正确')
  }
  if (detail.includes('DAILY_QUERY_OVER_LIMIT')) {
    throw new Error('今日高德调用次数已用尽，请稍后再试')
  }
  throw new Error(detail || fallback)
}

function parseLocation(location: string): { lon: number; lat: number } | null {
  const [lon, lat] = location.split(',').map(Number)
  if (!Number.isFinite(lon) || !Number.isFinite(lat)) return null
  return { lon, lat }
}

function parsePolyline(polyline: string): [number, number][] {
  return polyline.split(';').flatMap((pair) => {
    const [lon, lat] = pair.split(',').map(Number)
    if (!Number.isFinite(lon) || !Number.isFinite(lat)) return []
    return [[lat, lon] as [number, number]]
  })
}

async function amapGet<T extends AmapStatus>(path: string, params: Record<string, string>): Promise<T> {
  const qs = new URLSearchParams(params)
  const token = getAuthToken()
  let res: Response
  try {
    res = await fetch(`/api/amap${path}?${qs}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    })
  } catch {
    throw new Error('网络请求失败：请确认已运行 npm run dev（前端 + 后端）')
  }
  if (res.status === 401) throw new Error('请先登录后再使用地图与地点服务')
  if (!res.ok) throw new Error(`高德接口请求失败（HTTP ${res.status}）`)
  return (await res.json()) as T
}

export async function searchPlaces(query: string): Promise<Destination[]> {
  const data = assertOk(
    await amapGet<SearchResponse>('/v3/place/text', {
      keywords: query,
      offset: '8',
      page: '1',
      extensions: 'base',
    }),
    '地点搜索失败',
  )

  return (data.pois || []).flatMap((poi) => {
    const loc = parseLocation(poi.location)
    if (!loc) return []
    const displayName = [poi.address, poi.adname, poi.cityname, poi.pname]
      .filter(Boolean)
      .join(' · ')
    return [
      {
        id: poi.id || `${loc.lon},${loc.lat}`,
        name: poi.name,
        displayName: displayName || poi.name,
        lat: loc.lat,
        lon: loc.lon,
        city: poi.cityname,
        address: poi.address,
      },
    ]
  })
}

export type ResolvedPlace = {
  query: string
  place: Destination | null
}

function pickBestMatch(query: string, places: Destination[]): Destination | null {
  if (places.length === 0) return null
  const scored = places.map((p) => {
    let score = 0
    if (p.name === query) score += 100
    if (p.name.includes(query) || query.includes(p.name)) score += 50
    if (p.displayName.includes(query)) score += 20
    return { p, score }
  })
  scored.sort((a, b) => b.score - a.score)
  return scored[0]?.p ?? places[0]
}

/** 从粘贴文本识别地点，并用高德逐个解析坐标 */
export async function resolvePlacesFromText(text: string): Promise<ResolvedPlace[]> {
  const candidates = extractPlaceCandidates(text)
  if (candidates.length === 0) return []

  const results: ResolvedPlace[] = []
  for (const query of candidates) {
    try {
      const places = await searchPlaces(query)
      results.push({ query, place: pickBestMatch(query, places) })
    } catch (err) {
      if (results.length === 0 && err instanceof Error) throw err
      results.push({ query, place: null })
    }
    await new Promise((r) => setTimeout(r, 100))
  }
  return results
}

export async function fetchRoute(
  destinations: Destination[],
  strategy: string = '0',
): Promise<RouteInfo | null> {
  if (destinations.length < 2) return null

  const origin = `${destinations[0].lon},${destinations[0].lat}`
  const destination = `${destinations[destinations.length - 1].lon},${destinations[destinations.length - 1].lat}`
  const middle = destinations.slice(1, -1)
  const params: Record<string, string> = {
    origin,
    destination,
    extensions: 'all',
    strategy,
  }
  if (middle.length > 0) {
    params.waypoints = middle.map((d) => `${d.lon},${d.lat}`).join(';')
  }

  const data = assertOk(
    await amapGet<DriveResponse>('/v3/direction/driving', params),
    '路线规划失败',
  )

  const path = data.route?.paths?.[0]
  if (!path) throw new Error('未找到可行驾车路线')

  const coordinates = (path.steps || []).flatMap((step) => parsePolyline(step.polyline))
  if (coordinates.length === 0) {
    destinations.forEach((d) => coordinates.push([d.lat, d.lon]))
  }

  return {
    coordinates,
    distanceKm: Number(path.distance) / 1000,
    durationMin: Number(path.duration) / 60,
    strategy,
  }
}

function haversineKm(a: Destination, b: Destination) {
  const R = 6371
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(b.lat - a.lat)
  const dLon = toRad(b.lon - a.lon)
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(x))
}

function pathLengthKm(order: Destination[]) {
  let sum = 0
  for (let i = 0; i < order.length - 1; i += 1) {
    sum += haversineKm(order[i], order[i + 1])
  }
  return sum
}

function permute<T>(items: T[]): T[][] {
  if (items.length <= 1) return [items]
  const result: T[][] = []
  for (let i = 0; i < items.length; i += 1) {
    const rest = [...items.slice(0, i), ...items.slice(i + 1)]
    for (const p of permute(rest)) {
      result.push([items[i], ...p])
    }
  }
  return result
}

/** 固定首尾，按直线距离搜索更优的途径点顺序 */
export function optimizeWaypointOrderByDistance(destinations: Destination[]): Destination[] {
  if (destinations.length <= 3) return destinations
  const start = destinations[0]
  const end = destinations[destinations.length - 1]
  const middle = destinations.slice(1, -1)
  if (middle.length > 5) {
    // 贪心：每次选距当前点最近的未访问途径点
    const remaining = [...middle]
    const ordered: Destination[] = [start]
    while (remaining.length > 0) {
      const cur = ordered[ordered.length - 1]
      let bestIdx = 0
      let bestDist = Infinity
      remaining.forEach((p, i) => {
        const d = haversineKm(cur, p)
        if (d < bestDist) {
          bestDist = d
          bestIdx = i
        }
      })
      ordered.push(remaining.splice(bestIdx, 1)[0])
    }
    ordered.push(end)
    return ordered
  }

  let best = destinations
  let bestLen = pathLengthKm(destinations)
  for (const mid of permute(middle)) {
    const candidate = [start, ...mid, end]
    const len = pathLengthKm(candidate)
    if (len < bestLen) {
      bestLen = len
      best = candidate
    }
  }
  return best
}

function sameOrder(a: Destination[], b: Destination[]) {
  if (a.length !== b.length) return false
  return a.every((d, i) => d.id === b[i].id)
}

/** 生成多套路线方案：当前顺序/重排途径点 × 最短用时/最短距离 */
export async function fetchOptimizedRouteOptions(
  destinations: Destination[],
): Promise<RouteOption[]> {
  if (destinations.length < 2) return []

  const jobs: Array<{
    id: string
    label: string
    sortKey: 'distance' | 'duration'
    order: Destination[]
    strategy: string
  }> = [
    {
      id: 'current-time',
      label: '当前顺序 · 最短用时',
      sortKey: 'duration',
      order: destinations,
      strategy: '0',
    },
    {
      id: 'current-distance',
      label: '当前顺序 · 最短距离',
      sortKey: 'distance',
      order: destinations,
      strategy: '2',
    },
  ]

  if (destinations.length >= 3) {
    const reordered = optimizeWaypointOrderByDistance(destinations)
    if (!sameOrder(reordered, destinations)) {
      jobs.push(
        {
          id: 'reorder-time',
          label: '重排途径点 · 最短用时',
          sortKey: 'duration',
          order: reordered,
          strategy: '0',
        },
        {
          id: 'reorder-distance',
          label: '重排途径点 · 最短距离',
          sortKey: 'distance',
          order: reordered,
          strategy: '2',
        },
      )
    }
  }

  const options: RouteOption[] = []
  for (const job of jobs) {
    try {
      const route = await fetchRoute(job.order, job.strategy)
      if (!route) continue
      options.push({
        id: job.id,
        label: job.label,
        sortKey: job.sortKey,
        destinations: job.order,
        route: { ...route, label: job.label },
      })
      await new Promise((r) => setTimeout(r, 120))
    } catch {
      // skip failed strategy
    }
  }

  // 相同停靠顺序且距离/用时几乎一致时去重（高德不同策略常返回相同结果）
  const unique: RouteOption[] = []
  for (const opt of options) {
    const twin = unique.find(
      (u) =>
        sameOrder(u.destinations, opt.destinations) &&
        Math.abs(u.route.distanceKm - opt.route.distanceKm) < 0.15 &&
        Math.abs(u.route.durationMin - opt.route.durationMin) < 1.5,
    )
    if (twin) {
      if (opt.sortKey === 'distance' && twin.sortKey === 'duration') {
        twin.label = twin.label.replace(/ · 最短用时$/, ' · 距离/用时最优')
        twin.route.label = twin.label
      } else if (opt.sortKey === 'duration' && twin.sortKey === 'distance') {
        twin.label = twin.label.replace(/ · 最短距离$/, ' · 距离/用时最优')
        twin.route.label = twin.label
      }
      continue
    }
    unique.push(opt)
  }

  return unique.sort((a, b) => {
    const d = a.route.distanceKm - b.route.distanceKm
    if (Math.abs(d) > 0.05) return d
    return a.route.durationMin - b.route.durationMin
  })
}

export async function fetchNearbyGuides(
  lat: number,
  lon: number,
  category: GuideCategory,
  radius = 3000,
): Promise<GuidePlace[]> {
  const data = assertOk(
    await amapGet<SearchResponse>('/v3/place/around', {
      location: `${lon},${lat}`,
      types: CATEGORY_TYPES[category],
      keywords: CATEGORY_KEYWORDS[category],
      radius: String(radius),
      offset: '20',
      page: '1',
      extensions: 'base',
      sortrule: 'distance',
    }),
    '周边搜索失败',
  )

  return (data.pois || []).flatMap((poi) => {
    const loc = parseLocation(poi.location)
    if (!loc) return []
    const tags = (poi.type || '')
      .split(';')
      .map((t) => t.trim())
      .filter(Boolean)
      .slice(0, 3)
    return [
      {
        id: poi.id || `${poi.name}-${loc.lon},${loc.lat}`,
        name: poi.name,
        category,
        lat: loc.lat,
        lon: loc.lon,
        distanceM: poi.distance ? Number(poi.distance) : undefined,
        tags,
        address: [poi.address, poi.adname].filter(Boolean).join(' · ') || undefined,
        tel: poi.tel && poi.tel !== '[]' ? poi.tel : undefined,
      },
    ]
  })
}

export function buildLocalBrief(
  name: string,
  places: GuidePlace[],
  category: GuideCategory,
): PlaceBrief {
  const labels: Record<GuideCategory, string> = {
    eat: '餐饮',
    drink: '饮品',
    stay: '住宿',
    go: '出行与景点',
  }
  const sample = places
    .slice(0, 3)
    .map((p) => p.name)
    .join('、')
  const extract =
    places.length > 0
      ? `高德地图在「${name}」周边约 3 公里内找到 ${places.length} 处${labels[category]}相关地点。可优先考虑：${sample}。出行前建议再确认营业时间与实时路况。`
      : `暂时没有检索到「${name}」附近的${labels[category]}数据，可换个目的地或类别再试。`

  return {
    title: `${name} · ${labels[category]}速览`,
    extract,
    url: `https://uri.amap.com/search?keyword=${encodeURIComponent(name)}`,
  }
}
