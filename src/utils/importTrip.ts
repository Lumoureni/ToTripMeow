import type { Destination } from '../types'

type ImportedDestination = {
  order?: number
  name?: string
  displayName?: string
  lat?: number | string
  lon?: number | string
  city?: string
  address?: string
}

function isFiniteNumber(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n)
}

function toDestination(item: ImportedDestination): Destination | null {
  const name = typeof item.name === 'string' ? item.name.trim() : ''
  const lat = typeof item.lat === 'string' ? Number(item.lat) : item.lat
  const lon = typeof item.lon === 'string' ? Number(item.lon) : item.lon
  if (!name || !isFiniteNumber(lat) || !isFiniteNumber(lon)) return null
  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return null

  const displayName =
    (typeof item.displayName === 'string' && item.displayName.trim()) ||
    (typeof item.address === 'string' && item.address.trim()) ||
    name

  return {
    id: crypto.randomUUID(),
    name,
    displayName,
    lat,
    lon,
    city: typeof item.city === 'string' ? item.city : undefined,
    address: typeof item.address === 'string' ? item.address : undefined,
  }
}

function parseJsonTrip(text: string): Destination[] {
  const data: unknown = JSON.parse(text)

  let list: ImportedDestination[] | null = null
  if (Array.isArray(data)) {
    list = data as ImportedDestination[]
  } else if (data && typeof data === 'object' && Array.isArray((data as { destinations?: unknown }).destinations)) {
    list = (data as { destinations: ImportedDestination[] }).destinations
  }

  if (!list) {
    throw new Error('JSON 中未找到 destinations 列表')
  }

  const withOrder = list.map((item, index) => ({
    item,
    order: typeof item.order === 'number' ? item.order : index + 1,
  }))
  withOrder.sort((a, b) => a.order - b.order)

  const destinations = withOrder
    .map(({ item }) => toDestination(item))
    .filter((d): d is Destination => Boolean(d))

  if (destinations.length === 0) {
    throw new Error('JSON 里没有可导入的有效目的地（需要 name / lat / lon）')
  }
  return destinations
}

function parseMarkdownOrTextTrip(text: string): Destination[] {
  const lines = text.split(/\r?\n/)
  const destinations: Destination[] = []

  let current: Partial<Destination> | null = null

  const flush = () => {
    if (!current?.name || !isFiniteNumber(current.lat) || !isFiniteNumber(current.lon)) {
      current = null
      return
    }
    destinations.push({
      id: crypto.randomUUID(),
      name: current.name,
      displayName: current.displayName || current.name,
      lat: current.lat,
      lon: current.lon,
      city: current.city,
      address: current.address,
    })
    current = null
  }

  for (const raw of lines) {
    const line = raw.trim()
    const title = line.match(/^\d+\.\s*\*?\*?(.+?)\*?\*?\s*$/)
    if (title) {
      flush()
      current = { name: title[1].trim() }
      continue
    }
    if (!current) continue

    const addr = line.match(/^-?\s*地址[：:]\s*(.+)$/)
    if (addr) {
      current.displayName = addr[1].trim()
      current.address = addr[1].trim()
      continue
    }
    const coords = line.match(/^-?\s*坐标[：:]\s*([-\d.]+)\s*[,，]\s*([-\d.]+)\s*$/)
    if (coords) {
      current.lat = Number(coords[1])
      current.lon = Number(coords[2])
      continue
    }
    const city = line.match(/^-?\s*城市[：:]\s*(.+)$/)
    if (city) {
      current.city = city[1].trim()
    }
  }
  flush()

  if (destinations.length === 0) {
    throw new Error('未能从文本中解析出目的地，请使用 To Trip 导出的 Markdown / TXT / JSON')
  }
  return destinations
}

export function parseTripFile(filename: string, content: string): Destination[] {
  const trimmed = content.trim()
  if (!trimmed) throw new Error('文件内容为空')

  const lower = filename.toLowerCase()
  const looksJson =
    lower.endsWith('.json') || trimmed.startsWith('{') || trimmed.startsWith('[')

  if (looksJson) {
    try {
      return parseJsonTrip(trimmed)
    } catch (err) {
      if (lower.endsWith('.json')) {
        throw err instanceof Error ? err : new Error('JSON 解析失败')
      }
      // fall through to markdown parser for ambiguous text
    }
  }

  return parseMarkdownOrTextTrip(trimmed)
}

export async function readTripFile(file: File): Promise<Destination[]> {
  const extOk = /\.(json|md|txt)$/i.test(file.name)
  if (!extOk) {
    throw new Error('请选择 .json / .md / .txt 行程文件')
  }
  const content = await file.text()
  return parseTripFile(file.name, content)
}
