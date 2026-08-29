export type Destination = {
  id: string
  name: string
  displayName: string
  lat: number
  lon: number
  city?: string
  address?: string
  ownerName?: string
  ownerColor?: string
}

export const PREVIEW_USER_ID = 'preview-all'
export const PREVIEW_COLOR = '#4a5d78'

export type TripUser = {
  id: string
  name: string
  color: string
  savedAt: string
  destinations: Destination[]
  activeGuideId: string | null
  role?: 'traveler' | 'preview'
}

export type Workspace = {
  version: 2
  activeUserId: string
  users: TripUser[]
}

export const USER_COLORS = ['#1a6b63', '#8a5a18', '#3d5a5c', '#9b3b2e', '#2f6b5a', '#6b5a3d']
