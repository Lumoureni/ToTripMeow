import { useState } from 'react'
import type { FormEvent } from 'react'
import type { CarryItem } from '../utils/tripStorage'

type Props = {
  carryItems: CarryItem[]
  onChange: (items: CarryItem[]) => void
  readOnly?: boolean
  linkedMode?: boolean
  companionName?: string
  othersShared?: CarryItem[]
}

function formatItemMeta(item: CarryItem): string {
  const parts: string[] = []
  if (typeof item.quantity === 'number' && item.quantity > 0) {
    parts.push(`×${item.quantity}`)
  }
  if (item.note) parts.push(item.note)
  return parts.join(' · ')
}

export function CarryItemsPanel({
  carryItems,
  onChange,
  readOnly = false,
  linkedMode = false,
  companionName,
  othersShared = [],
}: Props) {
  const [name, setName] = useState('')
  const [quantity, setQuantity] = useState('')
  const [note, setNote] = useState('')
  const [shared, setShared] = useState(false)

  const locked = readOnly || linkedMode
  const title = linkedMode
    ? `${companionName ?? '同行'}的携带物品`
    : readOnly
      ? '共享携带物品'
      : '携带物品'
  const lead = linkedMode
    ? '同步同行的物品清单为只读。'
    : readOnly
      ? '汇总所有旅客标记为共享的物品。'
      : '记录行李与随身物品，勾选「共享」后同行可见。'

  const submitAdd = (e: FormEvent) => {
    e.preventDefault()
    const trimmed = name.trim()
    if (!trimmed || locked) return
    const qty = quantity.trim() ? Number(quantity) : undefined
    const next: CarryItem = {
      id: crypto.randomUUID(),
      name: trimmed,
      ...(qty && Number.isFinite(qty) && qty > 0 ? { quantity: Math.floor(qty) } : {}),
      ...(note.trim() ? { note: note.trim() } : {}),
      ...(shared ? { shared: true } : {}),
    }
    onChange([...carryItems, next])
    setName('')
    setQuantity('')
    setNote('')
    setShared(false)
  }

  const toggleShared = (id: string) => {
    if (locked) return
    onChange(
      carryItems.map((item) => (item.id === id ? { ...item, shared: !item.shared } : item)),
    )
  }

  const removeItem = (id: string) => {
    if (locked) return
    onChange(carryItems.filter((item) => item.id !== id))
  }

  return (
    <div className={`carry-panel${locked ? ' read-only' : ''}${linkedMode ? ' linked' : ''}`}>
      <div className="section-head">
        <h2>{title}</h2>
        <p>{lead}</p>
      </div>

      {!locked && (
        <form className="carry-add-form" onSubmit={submitAdd}>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="物品名称，如 充电宝"
            maxLength={40}
            required
          />
          <div className="carry-add-row">
            <input
              type="number"
              min={1}
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              placeholder="数量"
            />
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="备注（可选）"
              maxLength={60}
            />
          </div>
          <div className="carry-add-actions">
            <label className="carry-share-toggle">
              <input type="checkbox" checked={shared} onChange={(e) => setShared(e.target.checked)} />
              共享给同行
            </label>
            <button type="submit" disabled={!name.trim()}>
              添加
            </button>
          </div>
        </form>
      )}

      {carryItems.length === 0 ? (
        <p className="carry-empty">{locked ? '暂无物品记录' : '还没有物品，可在上方添加'}</p>
      ) : (
        <ul className="carry-list">
          {carryItems.map((item) => {
            const meta = formatItemMeta(item)
            return (
              <li key={item.id} className="carry-item">
                <div className="carry-item-main">
                  <span className="carry-item-name">{item.name}</span>
                  {meta && <span className="carry-item-meta">{meta}</span>}
                  {item.ownerName && (
                    <span className="carry-item-owner" style={{ color: item.ownerColor }}>
                      {item.ownerName}
                    </span>
                  )}
                </div>
                {!locked && (
                  <div className="carry-item-actions">
                    <label className="carry-share-toggle compact" title="共享给同行">
                      <input
                        type="checkbox"
                        checked={Boolean(item.shared)}
                        onChange={() => toggleShared(item.id)}
                      />
                      共享
                    </label>
                    <button type="button" className="ghost danger" onClick={() => removeItem(item.id)}>
                      删除
                    </button>
                  </div>
                )}
                {locked && item.shared && <span className="carry-shared-badge">已共享</span>}
              </li>
            )
          })}
        </ul>
      )}

      {!locked && !readOnly && othersShared.length > 0 && (
        <div className="carry-others">
          <h3>同行共享</h3>
          <ul className="carry-list others">
            {othersShared.map((item) => {
              const meta = formatItemMeta(item)
              return (
                <li key={`${item.ownerName}-${item.id}`} className="carry-item">
                  <div className="carry-item-main">
                    <span className="carry-item-name">{item.name}</span>
                    {meta && <span className="carry-item-meta">{meta}</span>}
                    {item.ownerName && (
                      <span className="carry-item-owner" style={{ color: item.ownerColor }}>
                        {item.ownerName}
                      </span>
                    )}
                  </div>
                  <span className="carry-shared-badge">共享</span>
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </div>
  )
}
