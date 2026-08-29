import { useState } from 'react'
import { fetchOptimizedRouteOptions } from '../api/travel'
import type { Destination, RouteOption } from '../types'

type Props = {
  destinations: Destination[]
  onApply: (option: RouteOption) => void
}

function formatDuration(minutes: number) {
  if (minutes < 60) return `${Math.round(minutes)} 分钟`
  const h = Math.floor(minutes / 60)
  const m = Math.round(minutes % 60)
  return m === 0 ? `${h} 小时` : `${h} 小时 ${m} 分钟`
}

export function RouteOptimizePanel({ destinations, onApply }: Props) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [options, setOptions] = useState<RouteOption[]>([])
  const [appliedId, setAppliedId] = useState<string | null>(null)

  const canOptimize = destinations.length >= 2

  const runOptimize = async () => {
    if (!canOptimize) return
    setLoading(true)
    setError(null)
    setOptions([])
    setAppliedId(null)
    try {
      const list = await fetchOptimizedRouteOptions(destinations)
      if (list.length === 0) {
        setError('未能生成可用路线方案，请稍后再试')
        return
      }
      setOptions(list)
    } catch (err) {
      setError(err instanceof Error ? err.message : '优化失败')
    } finally {
      setLoading(false)
    }
  }

  return (
    <section className="route-optimize">
      <div className="route-optimize-head">
        <div>
          <h3>优化路线</h3>
          <p>综合最短距离与最短用时生成去重方案；有途径点时会尝试重排中间停靠顺序。预览模式下可对全部汇总地点优化排布。</p>
        </div>
        <button type="button" className="optimize-btn" disabled={!canOptimize || loading} onClick={() => void runOptimize()}>
          {loading ? '优化中…' : '开始优化'}
        </button>
      </div>

      {!canOptimize && <p className="form-hint">至少两个目的地后可优化路线。</p>}
      {error && <p className="form-hint error">{error}</p>}

      {options.length > 0 && (
        <ul className="optimize-list">
          {options.map((opt, index) => (
            <li key={opt.id}>
              <div className="optimize-card">
                <div className="optimize-rank">#{index + 1}</div>
                <div className="optimize-body">
                  <strong>{opt.label}</strong>
                  <span>
                    {opt.route.distanceKm.toFixed(1)} km · {formatDuration(opt.route.durationMin)}
                  </span>
                  <span className="optimize-path">
                    {opt.destinations.map((d) => d.name).join(' → ')}
                  </span>
                </div>
                <button
                  type="button"
                  className={appliedId === opt.id ? 'applied' : undefined}
                  onClick={() => {
                    onApply(opt)
                    setAppliedId(opt.id)
                  }}
                >
                  {appliedId === opt.id ? '已应用' : '应用'}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
