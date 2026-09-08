import { useEffect, useRef, useState, type ReactNode } from 'react'
import { IconMoreVertical } from '../ui/icons'

export interface MoreMenuItem {
  key: string
  label: string
  icon?: ReactNode
  onSelect?: () => void
  disabled?: boolean
  /** تلميح يظهر عند الحوم على المعطّل — عادةً «قريبًا» */
  disabledHint?: string
  danger?: boolean
}

interface Props {
  items: MoreMenuItem[]
  ariaLabel: string
}

/**
 * VER-02: زر ثلاث نقاط + قائمة منسدلة. مكوّن تقديمي صرف بلا منطق دليل —
 * الفتح/الإغلاق (نقرة خارجية + Escape) هما كامل ذكائه.
 */
export function MoreMenu({ items, ariaLabel }: Props) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    function onDown(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('mousedown', onDown)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('mousedown', onDown)
    }
  }, [open])

  return (
    <div className="more-menu-root" ref={rootRef}>
      <button
        type="button"
        className="btn ghost more-menu-btn"
        aria-label={ariaLabel}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <IconMoreVertical size={18} />
      </button>
      {open && (
        <div className="more-menu-popover" role="menu">
          {items.map((it) => (
            <button
              key={it.key}
              type="button"
              role="menuitem"
              className={`more-menu-item${it.danger ? ' danger' : ''}${it.disabled ? ' is-disabled' : ''}`}
              aria-disabled={it.disabled ? 'true' : undefined}
              title={it.disabled ? it.disabledHint : undefined}
              onClick={() => {
                if (it.disabled) return
                setOpen(false)
                it.onSelect?.()
              }}
            >
              {it.icon && <span className="more-menu-item-icon">{it.icon}</span>}
              <span>{it.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
