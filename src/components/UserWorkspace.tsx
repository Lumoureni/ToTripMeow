import { useState } from 'react'
import type { FormEvent } from 'react'
import type { TripUser } from '../utils/tripStorage'

type Props = {
  users: TripUser[]
  activeUserId: string
  onSwitch: (userId: string) => void
  onAdd: (name: string) => void
  onRename: (userId: string, name: string) => void
  onRemove: (userId: string) => void
}

export function UserWorkspace({
  users,
  activeUserId,
  onSwitch,
  onAdd,
  onRename,
  onRemove,
}: Props) {
  const [adding, setAdding] = useState(false)
  const [newName, setNewName] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')

  const active = users.find((u) => u.id === activeUserId) ?? users[0]

  const submitAdd = (e: FormEvent) => {
    e.preventDefault()
    const name = newName.trim() || `旅客 ${users.length + 1}`
    onAdd(name)
    setNewName('')
    setAdding(false)
  }

  const submitRename = (e: FormEvent) => {
    e.preventDefault()
    if (!editingId) return
    const name = editName.trim()
    if (name) onRename(editingId, name)
    setEditingId(null)
    setEditName('')
  }

  return (
    <section className="user-workspace" id="users" aria-label="多用户行程">
      <div className="section-head">
        <h2>多用户规划</h2>
        <p>每位旅客拥有独立行程，切换即可分别规划，互不影响；同一浏览器可多人轮流使用。</p>
      </div>

      <div className="user-tabs" role="tablist" aria-label="选择旅客">
        {users.map((user) => {
          const selected = user.id === activeUserId
          return (
            <button
              key={user.id}
              type="button"
              role="tab"
              aria-selected={selected}
              className={`user-tab${selected ? ' active' : ''}`}
              style={{ ['--user-color' as string]: user.color }}
              onClick={() => onSwitch(user.id)}
            >
              <span className="user-dot" aria-hidden="true" />
              <span className="user-tab-copy">
                <span className="user-tab-name">{user.name}</span>
                <span className="user-tab-meta">
                  {user.destinations.length > 0 ? `${user.destinations.length} 站` : '空行程'}
                </span>
              </span>
            </button>
          )
        })}

        {!adding ? (
          <button type="button" className="user-tab add" onClick={() => setAdding(true)}>
            <span className="user-tab-name">+ 新旅客</span>
          </button>
        ) : (
          <form className="user-add-form" onSubmit={submitAdd}>
            <input
              autoFocus
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="输入姓名，如 阿明"
              maxLength={16}
            />
            <button type="submit">创建</button>
            <button type="button" className="ghost" onClick={() => setAdding(false)}>
              取消
            </button>
          </form>
        )}
      </div>

      {active && (
        <div className="user-active-bar">
          <p>
            当前规划：<strong style={{ color: active.color }}>{active.name}</strong>
            <span className="user-active-hint">的行程草稿</span>
          </p>
          <div className="user-active-actions">
            {editingId === active.id ? (
              <form className="user-rename-form" onSubmit={submitRename}>
                <input
                  autoFocus
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  maxLength={16}
                />
                <button type="submit">保存</button>
                <button type="button" className="ghost" onClick={() => setEditingId(null)}>
                  取消
                </button>
              </form>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => {
                    setEditingId(active.id)
                    setEditName(active.name)
                  }}
                >
                  重命名
                </button>
                <button
                  type="button"
                  className="danger"
                  disabled={users.length <= 1}
                  onClick={() => {
                    if (users.length <= 1) return
                    const ok = window.confirm(`删除旅客「${active.name}」及其行程？`)
                    if (ok) onRemove(active.id)
                  }}
                >
                  删除旅客
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </section>
  )
}
