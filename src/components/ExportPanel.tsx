import { useId, useRef, useState } from 'react'
import {
  copyTripMarkdown,
  exportTripJson,
  exportTripMarkdown,
  exportTripText,
} from '../utils/exportTrip'
import { readTripFile } from '../utils/importTrip'
import type { Destination, RouteInfo } from '../types'

type Props = {
  destinations: Destination[]
  route: RouteInfo | null
  savedAtLabel: string | null
  onImport: (places: Destination[]) => void
  onClearLocal: () => void
}

const ACTIONS = [
  {
    id: 'md',
    label: 'Markdown',
    desc: '适合笔记与文档',
    accent: 'md',
    run: exportTripMarkdown,
    ok: '已下载 Markdown',
  },
  {
    id: 'txt',
    label: '纯文本',
    desc: '通用 TXT 文件',
    accent: 'txt',
    run: exportTripText,
    ok: '已下载文本',
  },
  {
    id: 'json',
    label: 'JSON',
    desc: '结构化备份',
    accent: 'json',
    run: exportTripJson,
    ok: '已下载 JSON',
  },
  {
    id: 'copy',
    label: '复制行程',
    desc: '写入剪贴板',
    accent: 'copy',
    run: copyTripMarkdown,
    ok: '已复制到剪贴板',
  },
] as const

function FormatIcon({ kind }: { kind: (typeof ACTIONS)[number]['accent'] | 'import' }) {
  if (kind === 'copy') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <rect x="8" y="8" width="11" height="13" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.6" />
        <path
          d="M6 16H5a1.5 1.5 0 0 1-1.5-1.5v-11A1.5 1.5 0 0 1 5 2h11A1.5 1.5 0 0 1 17.5 3.5V5"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
        />
      </svg>
    )
  }
  if (kind === 'import') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path
          d="M12 3v11"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
        />
        <path
          d="M8 10l4 4 4-4"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M5 18.5h14"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
        />
      </svg>
    )
  }
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M14 3H7.5A1.5 1.5 0 0 0 6 4.5v15A1.5 1.5 0 0 0 7.5 21h9a1.5 1.5 0 0 0 1.5-1.5V8l-4-5z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path d="M14 3v5h5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M9 13h6M9 16.5h4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  )
}

export function ExportPanel({
  destinations,
  route,
  savedAtLabel,
  onImport,
  onClearLocal,
}: Props) {
  const inputId = useId()
  const fileRef = useRef<HTMLInputElement>(null)
  const [hint, setHint] = useState<string | null>(null)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [importing, setImporting] = useState(false)
  const exportDisabled = destinations.length === 0
  const hasLocal = destinations.length > 0 || Boolean(savedAtLabel)

  const flash = (id: string | null, message: string, ok = true) => {
    setActiveId(id)
    setHint(message)
    window.setTimeout(() => {
      setHint(null)
      setActiveId(null)
    }, ok ? 2200 : 3200)
  }

  const runExport = async (
    id: string,
    action: () => void | Promise<void>,
    okMsg: string,
  ) => {
    try {
      setActiveId(id)
      await action()
      flash(id, okMsg)
    } catch (err) {
      setActiveId(null)
      setHint(err instanceof Error ? err.message : '导出失败')
    }
  }

  const handleImportFile = async (file: File | undefined) => {
    if (!file) return
    if (destinations.length > 0) {
      const ok = window.confirm('导入将替换当前行程目的地，是否继续？')
      if (!ok) {
        if (fileRef.current) fileRef.current.value = ''
        return
      }
    }

    setImporting(true)
    try {
      const places = await readTripFile(file)
      onImport(places)
      flash('import', `已导入 ${places.length} 个目的地`)
    } catch (err) {
      flash(null, err instanceof Error ? err.message : '导入失败', false)
    } finally {
      setImporting(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const handleClearLocal = () => {
    const ok = window.confirm('确定清除当前旅客的本机行程吗？其他旅客不受影响。')
    if (!ok) return
    onClearLocal()
    flash('clear', '已清除当前旅客行程')
  }

  return (
    <div className="export-panel">
      <div className="export-head">
        <h3>导入 / 导出行程</h3>
        <p>
          当前旅客行程会自动保存在本浏览器。也可导入导出 JSON / Markdown / TXT。
          {savedAtLabel ? ` 最近保存：${savedAtLabel}` : ''}
        </p>
      </div>

      <input
        id={inputId}
        ref={fileRef}
        className="sr-only"
        type="file"
        accept=".json,.md,.txt,application/json,text/markdown,text/plain"
        onChange={(e) => void handleImportFile(e.target.files?.[0])}
      />

      <div className="export-grid" role="group" aria-label="导入导出">
        <button
          type="button"
          className={`export-tile accent-import${activeId === 'import' ? ' is-done' : ''}`}
          disabled={importing}
          onClick={() => fileRef.current?.click()}
        >
          <span className="export-tile-icon">
            <FormatIcon kind="import" />
          </span>
          <span className="export-tile-copy">
            <span className="export-tile-label">{importing ? '导入中…' : '导入行程'}</span>
            <span className="export-tile-desc">选择 JSON / MD / TXT</span>
          </span>
          <span className="export-tile-arrow" aria-hidden="true">
            ↓
          </span>
        </button>

        <button
          type="button"
          className={`export-tile accent-clear${activeId === 'clear' ? ' is-done' : ''}`}
          disabled={!hasLocal}
          onClick={handleClearLocal}
        >
          <span className="export-tile-icon">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path
                d="M5 7h14"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
              />
              <path
                d="M10 7V5.5A1.5 1.5 0 0 1 11.5 4h1A1.5 1.5 0 0 1 14 5.5V7"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
              />
              <path
                d="M8 7l.6 12.2A1.5 1.5 0 0 0 10.1 20.5h3.8a1.5 1.5 0 0 0 1.5-1.3L16 7"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinejoin="round"
              />
            </svg>
          </span>
          <span className="export-tile-copy">
            <span className="export-tile-label">清除本机</span>
            <span className="export-tile-desc">仅清除当前旅客</span>
          </span>
          <span className="export-tile-arrow" aria-hidden="true">
            ×
          </span>
        </button>

        {ACTIONS.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`export-tile accent-${item.accent}${activeId === item.id ? ' is-done' : ''}`}
            disabled={exportDisabled}
            onClick={() =>
              void runExport(item.id, () => item.run(destinations, route), item.ok)
            }
          >
            <span className="export-tile-icon">
              <FormatIcon kind={item.accent} />
            </span>
            <span className="export-tile-copy">
              <span className="export-tile-label">{item.label}</span>
              <span className="export-tile-desc">{item.desc}</span>
            </span>
            <span className="export-tile-arrow" aria-hidden="true">
              →
            </span>
          </button>
        ))}
      </div>

      {exportDisabled && (
        <p className="form-hint">还没有目的地时仍可先导入行程；导出需至少一个地点。修改会自动写入本机。</p>
      )}
      {hint && (
        <p className="form-hint export-hint" role="status">
          {hint}
        </p>
      )}
    </div>
  )
}
