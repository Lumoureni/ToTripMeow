import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { isPreviewUser, listTravelers, PREVIEW_USER_ID, type TripUser } from '../utils/tripStorage'

type Props = {
  users: TripUser[]
  activeUserId: string
  onSwitch: (userId: string) => void
  onAdd: (name: string) => void
  onRename: (userId: string, name: string) => void
  onRemove: (userId: string) => void
}

type AddMode = 'idle' | 'choose' | 'traveler'

export function UserWorkspace({
  users,
  activeUserId,
  onSwitch,
  onAdd,
  onRename,
  onRemove,
}: Props) {
  const [open, setOpen] = useState(false)
  const [addMode, setAddMode] = useState<AddMode>('idle')
  const [newName, setNewName] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const rootRef = useRef<HTMLDivElement>(null)

  const active = users.find((u) => u.id === activeUserId) ?? users[0]
  const travelers = listTravelers(users)
  const previewUser = users.find((u) => isPreviewUser(u))

  const resetAdd = () => {
    setAddMode('idle')
    setNewName('')
  }

  useEffect(() => {
    if (!open) return
    const onPointerDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) {
        setOpen(false)
        resetAdd()
        setEditingId(null)
      }
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false)
        resetAdd()
        setEditingId(null)
      }
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const submitAdd = (e: FormEvent) => {
    e.preventDefault()
    const name = newName.trim() || `旅客 ${travelers.length + 1}`
    onAdd(name)
    resetAdd()
  }

  const submitRename = (e: FormEvent) => {
    e.preventDefault()
    if (!editingId || isPreviewUser(users.find((u) => u.id === editingId))) return
    const name = editName.trim()
    if (name) onRename(editingId, name)
    setEditingId(null)
    setEditName('')
  }

  const enterPreview = () => {
    onSwitch(PREVIEW_USER_ID)
    resetAdd()
    setOpen(false)
  }

  return (
    <div className="user-menu" ref={rootRef}>
      <button
        type="button"
        className={`user-menu-trigger${open ? ' open' : ''}`}
        style={{ color: active?.color }}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-controls="user-menu-panel"
        onClick={() => setOpen((v) => !v)}
      >
        <span className="user-dot" style={{ background: active?.color }} aria-hidden="true" />
        <span className="plan-topbar-user">{active?.name ?? '旅客'}</span>
        {isPreviewUser(active) && <span className="user-preview-pill">全部</span>}
        <span className="user-menu-caret" aria-hidden="true">
          ▾
        </span>
      </button>

      {open && (
        <div className="user-menu-panel" id="user-menu-panel" role="menu" aria-label="旅客管理">
          <p className="user-menu-hint">
            每位旅客独立行程。添加时可选择「普通旅客」或「预览」（汇总全部地点）。
          </p>

          <ul className="user-menu-list">
            {users.map((user) => {
              const selected = user.id === activeUserId
              const preview = isPreviewUser(user)
              const renaming = editingId === user.id && !preview
              return (
                <li
                  key={user.id}
                  className={`${selected ? 'active' : ''}${preview ? ' preview' : ''}`.trim()}
                >
                  {renaming ? (
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
                    <div className="user-menu-row">
                      <button
                        type="button"
                        role="menuitemradio"
                        aria-checked={selected}
                        className="user-menu-pick"
                        style={{ ['--user-color' as string]: user.color }}
                        onClick={() => {
                          onSwitch(user.id)
                          setOpen(false)
                        }}
                      >
                        <span className="user-dot" aria-hidden="true" />
                        <span className="user-tab-copy">
                          <span className="user-tab-name">
                            {user.name}
                            {preview && <span className="user-preview-tag">汇总</span>}
                          </span>
                          <span className="user-tab-meta">
                            {preview
                              ? user.destinations.length > 0
                                ? `全部 ${user.destinations.length} 站`
                                : '暂无地点'
                              : user.destinations.length > 0
                                ? `${user.destinations.length} 站`
                                : '空行程'}
                          </span>
                        </span>
                        {selected && <span className="user-menu-check">当前</span>}
                      </button>
                      {!preview && (
                        <div className="user-menu-row-actions">
                          <button
                            type="button"
                            className="ghost"
                            title="重命名"
                            onClick={() => {
                              setEditingId(user.id)
                              setEditName(user.name)
                              resetAdd()
                            }}
                          >
                            重命名
                          </button>
                          <button
                            type="button"
                            className="ghost danger"
                            title="删除"
                            disabled={travelers.length <= 1}
                            onClick={() => {
                              if (travelers.length <= 1) return
                              const ok = window.confirm(`删除旅客「${user.name}」及其行程？`)
                              if (ok) onRemove(user.id)
                            }}
                          >
                            删除
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </li>
              )
            })}
          </ul>

          <div className="user-menu-footer">
            {addMode === 'idle' && (
              <button
                type="button"
                className="user-menu-add"
                onClick={() => {
                  setAddMode('choose')
                  setEditingId(null)
                }}
              >
                + 新旅客
              </button>
            )}

            {addMode === 'choose' && (
              <div className="user-add-choose">
                <p className="user-add-choose-label">请选择要添加的类型</p>
                <button
                  type="button"
                  className="user-add-option"
                  onClick={() => setAddMode('traveler')}
                >
                  <strong>普通旅客</strong>
                  <span>独立编辑自己的行程</span>
                </button>
                <button
                  type="button"
                  className="user-add-option preview"
                  onClick={enterPreview}
                >
                  <strong>预览{previewUser ? '（已有，直接进入）' : ''}</strong>
                  <span>汇总所有旅客已选地点，只读查看</span>
                </button>
                <button type="button" className="ghost user-add-cancel" onClick={resetAdd}>
                  取消
                </button>
              </div>
            )}

            {addMode === 'traveler' && (
              <form className="user-add-form" onSubmit={submitAdd}>
                <input
                  autoFocus
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="输入姓名，如 阿明"
                  maxLength={16}
                />
                <button type="submit">创建</button>
                <button type="button" className="ghost" onClick={() => setAddMode('choose')}>
                  返回
                </button>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
