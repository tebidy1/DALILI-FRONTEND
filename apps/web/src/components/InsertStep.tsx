import { useEffect, useRef, useState } from 'react'
import { t } from '../i18n'

/** BLK-01: أنواع ما يُدرجه زر «+» — الالتقاط يذهب لتدفّق الامتداد، والبقية كتل عميل */
export type InsertKind = 'step' | 'tip' | 'alert' | 'header' | 'capture'

const ITEMS: { kind: InsertKind; key: Parameters<typeof t>[0] }[] = [
  { kind: 'step', key: 'editor.addStepManual' },
  { kind: 'tip', key: 'editor.addTip' },
  { kind: 'alert', key: 'editor.addAlert' },
  { kind: 'header', key: 'editor.addHeader' },
  { kind: 'capture', key: 'editor.addCaptureItem' },
]

/**
 * CAP-17 + BLK-01: موضع إدراج «+» بين الشرائح — صار منبثقةً بأنواع الكتل.
 * الاسم المتاح للزر «أضف كتلة»، والعنوان الكامل يوضح موضع الإدراج.
 * تُغلق المنبثقة بـEsc أو بالنقر خارجها (وصولية شرط قبول).
 */
export function InsertStep({ label, insertAt, onInsert, busy }: {
  label: string
  insertAt: number
  onInsert: (kind: InsertKind, insertAt: number) => void
  busy?: boolean
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])
  return (
    <div className="insert-step no-print" ref={ref}>
      <button
        type="button"
        className="insert-step-btn"
        aria-label={t('editor.blockMenuOpen')}
        title={label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        disabled={busy}
      >
        <span aria-hidden>+</span> {t('editor.addStepsShort')}
      </button>
      {open && (
        <div className="insert-menu" role="menu">
          {ITEMS.map(({ kind, key }) => (
            <button
              key={kind}
              type="button"
              role="menuitem"
              className={`insert-menu-item block-${kind}`}
              onClick={() => {
                setOpen(false)
                onInsert(kind, insertAt)
              }}
            >
              {t(key)}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
