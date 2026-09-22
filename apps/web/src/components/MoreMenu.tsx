import { useRef, useState, type ReactNode } from 'react'
import { IconMoreVertical } from '../ui/icons'
import { useDismissOnOutside } from '../lib/dismiss'

export interface MoreMenuItem {
  key: string
  label: string
  icon?: ReactNode
  onSelect?: () => void
  disabled?: boolean
  /** تلميح يظهر عند الحوم على المعطّل — عادةً «قريبًا» */
  disabledHint?: string
  danger?: boolean
  /** طلب المالك 2026-09-09: عنصر تبديل (مثل «إظهار الأرقام») — وجوده يجعله
   *  مربع اختيار يعلن حالته بعلامة ✓ في آخر السطر */
  checked?: boolean
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

  useDismissOnOutside(open, rootRef, () => setOpen(false))

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
              role={it.checked === undefined ? 'menuitem' : 'menuitemcheckbox'}
              aria-checked={it.checked}
              className={`more-menu-item${it.danger ? ' danger' : ''}${it.disabled ? ' is-disabled' : ''}${it.checked ? ' is-checked' : ''}`}
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
              {it.checked !== undefined && (
                <span className="more-menu-check" aria-hidden="true">
                  {it.checked ? '✓' : ''}
                </span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
