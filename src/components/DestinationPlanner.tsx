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
}

export function DestinationPlanner({
  destinations,
  onAdd,
  onAddMany,
  onRemove,
  onReorder,
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

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [])

  useEffect(() => {
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
  }, [query])

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    if (suggestions[0]) {
      onAdd(suggestions[0])
      setQuery('')
      setSuggestions([])
      setOpen(false)
    }
  }

  const pick = (place: Destination) => {
    onAdd(place)
    setQuery('')
    setSuggestions([])
    setOpen(false)
  }

  const handleParse = async () => {
    const text = pasteText.trim()
    if (text.length < 2) {
      setParseError('请先粘贴包含地点的行程或攻略文本')
      return
    }
    setParsing(true)
    setParseError(null)
    setResolved([])
    try {
      const results = await resolvePlacesFromText(text)
      if (results.length === 0) {
        setParseError('未能识别出地点，可试试写清地名，例如「杭州西湖 → 灵隐寺 → 宋城」')
        return
      }
      setResolved(results)
      const nextSelected: Record<string, boolean> = {}
      results.forEach((item, index) => {
        nextSelected[`${item.query}-${index}`] = Boolean(item.place)
      })
      setSelected(nextSelected)
      if (results.every((r) => !r.place)) {
        setParseError('识别到候选词，但高德未能匹配到具体地点，请改写后再试')
      }
    } catch (err) {
      setParseError(err instanceof Error ? err.message : '识别失败')
    } finally {
      setParsing(false)
    }
  }

  const handleAddResolved = () => {
    const places = resolved.flatMap((item, index) => {
      const key = `${item.query}-${index}`
      if (!selected[key] || !item.place) return []
      return [item.place]
    })
    if (places.length === 0) {
      setParseError('请至少勾选一个已匹配的地点')
      return
    }
    onAddMany(places)
    setResolved([])
    setSelected({})
    setParseError(null)
  }

  const matchedCount = resolved.filter((r) => r.place).length

  return (
    <div className="planner">
      <div className="section-head">
        <h2>添加目的地</h2>
        <p>粘贴行程文字自动识别地点，也可单独搜索添加；系统会按顺序规划驾车路线。</p>
      </div>

      <div className="paste-panel">
        <label htmlFor={pasteId}>粘贴行程 / 攻略片段</label>
        <textarea
          id={pasteId}
          value={pasteText}
          onChange={(e) => setPasteText(e.target.value)}
          rows={5}
          placeholder={'例如：\n第一天杭州西湖、雷峰塔，晚上河坊街。\n第二天去灵隐寺，下午到宋城。\n或直接：西湖 → 灵隐寺 → 西溪湿地'}
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

      <ol className="dest-list">
        {destinations.length === 0 && (
          <li className="dest-empty">还没有目的地，粘贴一段行程或搜索添加第一站吧。</li>
        )}
        {destinations.map((d, index) => (
          <li key={d.id} className="dest-item">
            <span className="dest-index">{index + 1}</span>
            <div className="dest-body">
              <strong>{d.name}</strong>
              <span>{d.displayName}</span>
            </div>
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
              <button type="button" className="danger" onClick={() => onRemove(d.id)}>
                移除
              </button>
            </div>
          </li>
        ))}
      </ol>
    </div>
  )
}
