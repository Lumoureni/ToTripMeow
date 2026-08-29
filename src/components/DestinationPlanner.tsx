import { useEffect, useId, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { resolvePlacesFromText, searchPlaces, type ResolvedPlace } from '../api/travel'
import type { Destination } from '../types'

type Props = {
  destinations: Destination[]
  onAdd: (place: Destination) => void
  onAddMany: (places: Destination[]) => void
  onRemove: (id: string) => void
  onReorder: (from: number, to: number) => void
  /** 预览模式：只读展示汇总地点 */
  readOnly?: boolean
  /** 预览下允许上下调整顺序（不可增删） */
  allowArrange?: boolean
  /** 同步同行：只读，可勾选途径点加入本人行程 */
  companionPick?: boolean
  companionName?: string
  onAddCompanionWaypoints?: (places: Destination[]) => void
}

export function DestinationPlanner({
  destinations,
  onAdd,
  onAddMany,
  onRemove,
  onReorder,
  readOnly = false,
  allowArrange = false,
  companionPick = false,
  companionName,
  onAddCompanionWaypoints,
}: Props) {
  const inputId = useId()
  const pasteId = useId()
  const [query, setQuery] = useState('')
  const [suggestions, setSuggestions] = useState<Destination[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLFormElement>(null)
  const debounceRef = useRef<number | null>(null)

  const [pasteText, setPasteText] = useState('')
  const [parsing, setParsing] = useState(false)
  const [parseError, setParseError] = useState<string | null>(null)
  const [resolved, setResolved] = useState<ResolvedPlace[]>([])
  const [selected, setSelected] = useState<Record<string, boolean>>({})
  const [pickedIds, setPickedIds] = useState<Record<string, boolean>>({})

  useEffect(() => {
    setPickedIds({})
  }, [destinations])

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [])

  useEffect(() => {
    if (readOnly || companionPick) return
    if (debounceRef.current) window.clearTimeout(debounceRef.current)
    const q = query.trim()
    if (q.length < 2) {
      setSuggestions([])
      setError(null)
      return
    }
    debounceRef.current = window.setTimeout(async () => {
      setLoading(true)
      setError(null)
      try {
        const results = await searchPlaces(q)
        setSuggestions(results)
        setOpen(true)
        if (results.length === 0) setError('未找到匹配地点，换个关键词试试')
      } catch (err) {
        setError(err instanceof Error ? err.message : '搜索失败')
        setSuggestions([])
      } finally {
        setLoading(false)
      }
    }, 400)
    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current)
    }
  }, [query, readOnly, companionPick])

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    if (suggestions[0]) pick(suggestions[0])
  }

  const pick = (place: Destination) => {
    onAdd(place)
    setQuery('')
    setSuggestions([])
    setOpen(false)
  }

  const handleParse = async () => {
    const text = pasteText.trim()
    if (!text) {
      setParseError('请先粘贴一段行程文字')
      return
    }
    setParsing(true)
    setParseError(null)
    try {
      const items = await resolvePlacesFromText(text)
      setResolved(items)
      const next: Record<string, boolean> = {}
      items.forEach((item, index) => {
        next[`${item.query}-${index}`] = Boolean(item.place)
      })
      setSelected(next)
      if (items.length === 0) setParseError('没有识别到地点名称，试试更具体的写法')
    } catch (err) {
      setParseError(err instanceof Error ? err.message : '识别失败')
      setResolved([])
    } finally {
      setParsing(false)
    }
  }

  const handleAddResolved = () => {
    const places = resolved
      .map((item, index) => {
        const key = `${item.query}-${index}`
        if (!selected[key] || !item.place) return null
        return item.place
      })
      .filter((p): p is Destination => Boolean(p))
    if (places.length === 0) return
    onAddMany(places)
    setPasteText('')
    setResolved([])
    setSelected({})
    setParseError(null)
  }

  const matchedCount = resolved.filter((r) => r.place).length
  const pickedCount = Object.values(pickedIds).filter(Boolean).length
  const locked = readOnly || companionPick

  const title = companionPick
    ? `${companionName || '同行'}的行程`
    : readOnly
      ? '全部地点预览'
      : '添加目的地'

  const lead = companionPick
    ? '对方路径只读。勾选途径点后可加入你自己的行程，不能修改或优化对方路线。'
    : readOnly
      ? allowArrange
        ? '汇总所有旅客地点。可用「优化路线」或上下箭头重排顺序（不改写各旅客原行程）。'
        : '汇总所有旅客已选地点（按坐标去重）。预览模式不可编辑，请切换到具体旅客后再修改。'
      : '粘贴行程文字自动识别地点，也可单独搜索添加；系统会按顺序规划驾车路线。'

  return (
    <div className={`planner${locked ? ' read-only' : ''}${companionPick ? ' companion-pick' : ''}`}>
      <div className="section-head">
        <h2>{title}</h2>
        <p>{lead}</p>
      </div>

      {!locked && (
        <div className="paste-panel">
          <label htmlFor={pasteId}>粘贴行程 / 攻略片段</label>
          <textarea
            id={pasteId}
            value={pasteText}
            onChange={(e) => setPasteText(e.target.value)}
            rows={5}
            placeholder={
              '例如：\n第一天杭州西湖、雷峰塔，晚上河坊街。\n第二天去灵隐寺，下午到宋城。\n或直接：西湖 → 灵隐寺 → 西溪湿地'
            }
          />
          <div className="paste-actions">
            <button type="button" className="btn-parse" onClick={() => void handleParse()} disabled={parsing}>
              {parsing ? '识别中…' : '识别地点'}
            </button>
            {resolved.length > 0 && (
              <button type="button" className="btn-parse secondary" onClick={handleAddResolved}>
                添加勾选（{Object.values(selected).filter(Boolean).length}/{matchedCount}）
              </button>
            )}
          </div>
          {parseError && <p className="form-hint error">{parseError}</p>}
          {resolved.length > 0 && (
            <ul className="resolved-list">
              {resolved.map((item, index) => {
                const key = `${item.query}-${index}`
                return (
                  <li key={key} className={item.place ? undefined : 'miss'}>
                    <label>
                      <input
                        type="checkbox"
                        disabled={!item.place}
                        checked={Boolean(selected[key])}
                        onChange={(e) =>
                          setSelected((prev) => ({ ...prev, [key]: e.target.checked }))
                        }
                      />
                      <span className="resolved-query">{item.query}</span>
                      {item.place ? (
                        <span className="resolved-match">
                          → {item.place.name}
                          <small>{item.place.displayName}</small>
                        </span>
                      ) : (
                        <span className="resolved-match miss-text">未匹配到地点</span>
                      )}
                    </label>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      )}

      {!locked && (
        <form className="search-form" onSubmit={handleSubmit} ref={wrapRef}>
          <p className="search-label">或单独搜索添加</p>
          <label htmlFor={inputId} className="sr-only">
            搜索目的地
          </label>
          <div className="search-field">
            <input
              id={inputId}
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onFocus={() => suggestions.length > 0 && setOpen(true)}
              placeholder="输入城市、景点或地址…"
              autoComplete="off"
            />
            <button type="submit" disabled={!suggestions[0]}>
              {loading ? '搜索中' : '添加'}
            </button>
          </div>
          {open && suggestions.length > 0 && (
            <ul className="suggestions" role="listbox">
              {suggestions.map((s) => (
                <li key={s.id}>
                  <button type="button" onClick={() => pick(s)}>
                    <span className="sug-name">{s.name}</span>
                    <span className="sug-full">{s.displayName}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {error && <p className="form-hint error">{error}</p>}
        </form>
      )}

      {companionPick && destinations.length > 0 && (
        <div className="companion-pick-bar">
          <button
            type="button"
            className="btn-parse"
            disabled={pickedCount === 0 || !onAddCompanionWaypoints}
            onClick={() => {
              const places = destinations.filter((d) => pickedIds[d.id])
              onAddCompanionWaypoints?.(places)
              setPickedIds({})
            }}
          >
            添加到我的行程（{pickedCount}）
          </button>
          <button
            type="button"
            className="btn-parse secondary"
            onClick={() => {
              const next: Record<string, boolean> = {}
              for (const d of destinations) next[d.id] = true
              setPickedIds(next)
            }}
          >
            全选
          </button>
        </div>
      )}

      <ol className="dest-list">
        {destinations.length === 0 && (
          <li className="dest-empty">
            {companionPick
              ? '对方尚未添加地点。'
              : readOnly
                ? '各旅客尚未添加地点。'
                : '还没有目的地，粘贴一段行程或搜索添加第一站吧。'}
          </li>
        )}
        {destinations.map((d, index) => (
          <li key={d.id} className="dest-item">
            {companionPick ? (
              <label className="dest-pick">
                <input
                  type="checkbox"
                  checked={Boolean(pickedIds[d.id])}
                  onChange={(e) =>
                    setPickedIds((prev) => ({ ...prev, [d.id]: e.target.checked }))
                  }
                />
                <span className="dest-index">{index + 1}</span>
                <span className="dest-body">
                  <strong>{d.name}</strong>
                  <span>{d.displayName}</span>
                </span>
              </label>
            ) : (
              <>
                <span className="dest-index">{index + 1}</span>
                <div className="dest-body">
                  <strong>{d.name}</strong>
                  <span>{d.displayName}</span>
                  {readOnly && d.ownerName && (
                    <span className="dest-owner" style={{ color: d.ownerColor || undefined }}>
                      来自 {d.ownerName}
                    </span>
                  )}
                </div>
                {(!readOnly || allowArrange) && (
                  <div className="dest-actions">
                    <button
                      type="button"
                      aria-label="上移"
                      disabled={index === 0}
                      onClick={() => onReorder(index, index - 1)}
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      aria-label="下移"
                      disabled={index === destinations.length - 1}
                      onClick={() => onReorder(index, index + 1)}
                    >
                      ↓
                    </button>
                    {!readOnly && (
                      <button type="button" className="danger" onClick={() => onRemove(d.id)}>
                        移除
                      </button>
                    )}
                  </div>
                )}
              </>
            )}
          </li>
        ))}
      </ol>
    </div>
  )
}
