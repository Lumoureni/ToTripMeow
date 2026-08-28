import { useEffect, useState } from 'react'
import { buildLocalBrief, fetchNearbyGuides } from '../api/travel'
import type { Destination, GuideCategory, GuidePlace, PlaceBrief } from '../types'

const TABS: { key: GuideCategory; label: string; tip: string }[] = [
  { key: 'eat', label: '吃', tip: '餐厅与美食' },
  { key: 'drink', label: '喝', tip: '咖啡与酒吧' },
  { key: 'stay', label: '住', tip: '酒店与客栈' },
  { key: 'go', label: '行', tip: '景点与交通' },
]

type Props = {
  destinations: Destination[]
  activeId: string | null
  onSelectDestination: (id: string) => void
}

export function NearbyGuides({ destinations, activeId, onSelectDestination }: Props) {
  const [category, setCategory] = useState<GuideCategory>('eat')
  const [places, setPlaces] = useState<GuidePlace[]>([])
  const [brief, setBrief] = useState<PlaceBrief | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const active = destinations.find((d) => d.id === activeId) ?? destinations[0]

  useEffect(() => {
    if (!active) {
      setPlaces([])
      setBrief(null)
      return
    }

    let cancelled = false
    const run = async () => {
      setLoading(true)
      setError(null)
      try {
        const nearby = await fetchNearbyGuides(active.lat, active.lon, category)
        if (cancelled) return
        setPlaces(nearby)
        setBrief(buildLocalBrief(active.name, nearby, category))
        if (nearby.length === 0) setError('附近暂无结果，可换个目的地或类别再试')
      } catch (err) {
        if (cancelled) return
        setPlaces([])
        setBrief(null)
        setError(err instanceof Error ? err.message : '攻略加载失败')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void run()
    return () => {
      cancelled = true
    }
  }, [active, category])

  if (destinations.length === 0) {
    return (
      <section className="guides" id="guides">
        <div className="section-head">
          <h2>周边吃喝住行</h2>
          <p>添加目的地后，将通过高德检索附近攻略与地点。</p>
        </div>
        <p className="guides-placeholder">先规划至少一站，再来看看周围有什么。</p>
      </section>
    )
  }

  return (
    <section className="guides" id="guides">
      <div className="section-head">
        <h2>周边吃喝住行</h2>
        <p>基于高德地图实时检索周边餐饮、饮品、住宿与出行点。</p>
      </div>

      <div className="dest-chips">
        {destinations.map((d) => (
          <button
            key={d.id}
            type="button"
            className={d.id === active?.id ? 'chip active' : 'chip'}
            onClick={() => onSelectDestination(d.id)}
          >
            {d.name}
          </button>
        ))}
      </div>

      {brief && (
        <article className="place-brief">
          <h3>{brief.title}</h3>
          <p>{brief.extract}</p>
          <a href={brief.url} target="_blank" rel="noreferrer">
            在高德地图继续探索 →
          </a>
        </article>
      )}

      <div className="guide-tabs" role="tablist">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            role="tab"
            aria-selected={category === tab.key}
            className={category === tab.key ? 'active' : undefined}
            onClick={() => setCategory(tab.key)}
          >
            <span>{tab.label}</span>
            <small>{tab.tip}</small>
          </button>
        ))}
      </div>

      {loading && <p className="form-hint">正在联网搜索「{active?.name}」周边…</p>}
      {error && !loading && <p className="form-hint error">{error}</p>}

      <ul className="guide-list">
        {places.map((p) => (
          <li key={p.id}>
            <div>
              <strong>{p.name}</strong>
              {p.address && <span className="meta">{p.address}</span>}
              {p.tel && <span className="meta">电话 {p.tel}</span>}
              {p.tags.length > 0 && <span className="meta tags">{p.tags.join(' · ')}</span>}
            </div>
            {p.distanceM != null && (
              <span className="distance">
                {p.distanceM < 1000
                  ? `${Math.round(p.distanceM)} m`
                  : `${(p.distanceM / 1000).toFixed(1)} km`}
              </span>
            )}
          </li>
        ))}
      </ul>
    </section>
  )
}
