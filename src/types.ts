export type Destination = {
  id: string
  name: string
  displayName: string
  lat: number
  lon: number
  city?: string
  address?: string
  /** 预览汇总时标注来源旅客 */
  ownerName?: string
  ownerColor?: string
}

export type RouteInfo = {
  coordinates: [number, number][]
  distanceKm: number
  durationMin: number
  strategy?: string
  label?: string
}

export type RouteOption = {
  id: string
  label: string
  sortKey: 'distance' | 'duration'
  destinations: Destination[]
  route: RouteInfo
}

/** 共用地图上的一位旅客图层 */
export type MapTravelerLayer = {
  id: string
  name: string
  color: string
  destinations: Destination[]
  route: RouteInfo | null
  emphasized?: boolean
}

export type GuideCategory = 'eat' | 'drink' | 'stay' | 'go'

export type GuidePlace = {
  id: string
  name: string
  category: GuideCategory
  lat: number
  lon: number
  distanceM?: number
  tags: string[]
  address?: string
  tel?: string
}

export type PlaceBrief = {
  title: string
  extract: string
  url: string
}
