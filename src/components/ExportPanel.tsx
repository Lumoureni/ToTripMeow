import { useState } from 'react'
import {
  copyTripMarkdown,
  exportTripJson,
  exportTripMarkdown,
  exportTripText,
} from '../utils/exportTrip'
import type { Destination, RouteInfo } from '../types'

type Props = {
  destinations: Destination[]
  route: RouteInfo | null
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

function FormatIcon({ kind }: { kind: (typeof ACTIONS)[number]['accent'] }) {
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

export function ExportPanel({ destinations, route }: Props) {
  const [hint, setHint] = useState<string | null>(null)
  const [activeId, setActiveId] = useState<string | null>(null)
  const disabled = destinations.length === 0

  const run = async (
    id: string,
    action: () => void | Promise<void>,
    okMsg: string,
  ) => {
    try {
      setActiveId(id)
      await action()
      setHint(okMsg)
      window.setTimeout(() => {
        setHint(null)
        setActiveId(null)
      }, 2200)
    } catch (err) {
      setActiveId(null)
      setHint(err instanceof Error ? err.message : '导出失败')
    }
  }

  return (
    <div className="export-panel">
      <div className="export-head">
        <h3>导出行程</h3>
        <p>保存当前目的地与路线概要，或一键复制分享。</p>
      </div>

      <div className="export-grid" role="group" aria-label="导出方式">
        {ACTIONS.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`export-tile accent-${item.accent}${activeId === item.id ? ' is-done' : ''}`}
            disabled={disabled}
            onClick={() =>
              void run(item.id, () => item.run(destinations, route), item.ok)
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

      {disabled && <p className="form-hint">添加至少一个目的地后即可导出。</p>}
      {hint && (
        <p className="form-hint export-hint" role="status">
          {hint}
        </p>
      )}
    </div>
  )
}
