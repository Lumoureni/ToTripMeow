export type Destination = {
  id: string
  name: string
  displayName: string
  lat: number
  lon: number
  city?: string
  address?: string
}

export type RouteInfo = {
  coordinates: [number, number][]
  distanceKm: number
  durationMin: number
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
