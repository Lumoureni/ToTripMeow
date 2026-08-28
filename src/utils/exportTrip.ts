import type { Destination, RouteInfo } from '../types'

function formatDuration(minutes: number) {
  if (minutes < 60) return `${Math.round(minutes)} 分钟`
  const h = Math.floor(minutes / 60)
  const m = Math.round(minutes % 60)
  return m === 0 ? `${h} 小时` : `${h} 小时 ${m} 分钟`
}

function stamp() {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`
}

function downloadBlob(filename: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export function buildTripMarkdown(destinations: Destination[], route: RouteInfo | null): string {
  const title = destinations.map((d) => d.name).join(' → ') || '未命名行程'
  const lines = [
    `# To Trip 行程：${title}`,
    '',
    `导出时间：${new Date().toLocaleString('zh-CN')}`,
    '',
    '## 目的地顺序',
    '',
  ]

  destinations.forEach((d, i) => {
    lines.push(`${i + 1}. **${d.name}**`)
    lines.push(`   - 地址：${d.displayName}`)
    lines.push(`   - 坐标：${d.lat.toFixed(6)}, ${d.lon.toFixed(6)}`)
    if (d.city) lines.push(`   - 城市：${d.city}`)
    lines.push('')
  })

  lines.push('## 路线概要', '')
  if (route) {
    lines.push(`- 全程约 **${route.distanceKm.toFixed(1)} km**`)
    lines.push(`- 预计驾车 **${formatDuration(route.durationMin)}**`)
  } else if (destinations.length < 2) {
    lines.push('- 目的地不足 2 个，尚未生成路线')
  } else {
    lines.push('- 暂无路线数据')
  }

  if (destinations.length > 0) {
    const via = destinations.map((d) => `${d.lon},${d.lat}`).join(';')
    lines.push('', '## 在高德中打开', '')
    lines.push(`[查看路线](https://uri.amap.com/navigation?via=${encodeURIComponent(via)}&mode=car)`)
  }

  lines.push('', '---', '', '_由 To Trip 导出_')
  return lines.join('\n')
}

export function buildTripJson(destinations: Destination[], route: RouteInfo | null) {
  return {
    app: 'To Trip',
    exportedAt: new Date().toISOString(),
    destinations: destinations.map((d, index) => ({
      order: index + 1,
      name: d.name,
      displayName: d.displayName,
      lat: d.lat,
      lon: d.lon,
      city: d.city,
      address: d.address,
    })),
    route: route
      ? {
          distanceKm: Number(route.distanceKm.toFixed(2)),
          durationMin: Math.round(route.durationMin),
        }
      : null,
  }
}

export function exportTripMarkdown(destinations: Destination[], route: RouteInfo | null) {
  const md = buildTripMarkdown(destinations, route)
  downloadBlob(`ToTrip-行程-${stamp()}.md`, md, 'text/markdown;charset=utf-8')
}

export function exportTripJson(destinations: Destination[], route: RouteInfo | null) {
  const json = JSON.stringify(buildTripJson(destinations, route), null, 2)
  downloadBlob(`ToTrip-行程-${stamp()}.json`, json, 'application/json;charset=utf-8')
}

export function exportTripText(destinations: Destination[], route: RouteInfo | null) {
  const md = buildTripMarkdown(destinations, route)
  const text = md
    .replace(/^#+\s*/gm, '')
    .replace(/\*\*/g, '')
    .replace(/\[(.*?)\]\(.*?\)/g, '$1')
  downloadBlob(`ToTrip-行程-${stamp()}.txt`, text, 'text/plain;charset=utf-8')
}

export async function copyTripMarkdown(destinations: Destination[], route: RouteInfo | null) {
  const md = buildTripMarkdown(destinations, route)
  await navigator.clipboard.writeText(md)
}
