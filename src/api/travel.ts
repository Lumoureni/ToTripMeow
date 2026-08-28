import type { Destination, GuideCategory, GuidePlace, PlaceBrief, RouteInfo } from '../types'
import { extractPlaceCandidates } from '../utils/extractPlaces'

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
  let res: Response
  try {
    res = await fetch(`/api/amap${path}?${qs}`)
  } catch {
    throw new Error('网络请求失败：请确认已运行 npm run dev，并通过 http://127.0.0.1:5173 访问')
  }
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

export async function fetchRoute(destinations: Destination[]): Promise<RouteInfo | null> {
  if (destinations.length < 2) return null

  const origin = `${destinations[0].lon},${destinations[0].lat}`
  const destination = `${destinations[destinations.length - 1].lon},${destinations[destinations.length - 1].lat}`
  const middle = destinations.slice(1, -1)
  const params: Record<string, string> = {
    origin,
    destination,
    extensions: 'all',
    strategy: '0',
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
    // fallback: straight lines between destinations
    destinations.forEach((d) => coordinates.push([d.lat, d.lon]))
  }

  return {
    coordinates,
    distanceKm: Number(path.distance) / 1000,
    durationMin: Number(path.duration) / 60,
  }
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
