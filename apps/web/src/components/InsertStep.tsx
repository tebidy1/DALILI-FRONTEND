import { useEffect, useRef, useState } from 'react'
import { t } from '../i18n'

/** BLK-01 + BKL-01: أنواع ما يُدرجه زر «+» — الالتقاط يذهب لتدفّق الامتداد، والبقية كتل عميل */
export type InsertKind =
  | 'step'
  | 'tip'
  | 'alert'
  | 'header'
  | 'capture'
  | 'text'
  | 'embed'
  | 'divider'
  | 'link'
  | 'image'
  | 'video'

interface MenuItem {
  kind: InsertKind
  key: Parameters<typeof t>[0]
  /** رمز البطاقة — محارف بسيطة لا صور: تُرسم بأي خط ولا تحتاج تحميلًا */
  glyph: string
}

const GUIDE_ITEMS: MenuItem[] = [
  { kind: 'step', key: 'editor.addStepManual', glyph: '١' },
  { kind: 'tip', key: 'editor.addTip', glyph: '✦' },
  { kind: 'alert', key: 'editor.addAlert', glyph: '!' },
  { kind: 'header', key: 'editor.addHeader', glyph: 'ع' },
  { kind: 'capture', key: 'editor.addCaptureItem', glyph: '◉' },
]

/** BKL-01: لا «التقاط» في الكرّاسة بقصد — الكرّاسة تجمع الأدلة ولا تلتقطها */
const BOOKLET_ITEMS: MenuItem[] = [
  { kind: 'text', key: 'editor.addText', glyph: '¶' },
  { kind: 'header', key: 'editor.addHeader', glyph: 'ع' },
  { kind: 'tip', key: 'editor.addTip', glyph: '✦' },
  { kind: 'alert', key: 'editor.addAlert', glyph: '!' },
  { kind: 'embed', key: 'editor.addEmbed', glyph: '⧉' },
  { kind: 'image', key: 'editor.addImage', glyph: '▣' },
  { kind: 'video', key: 'editor.addVideo', glyph: '▶' },
  { kind: 'link', key: 'editor.addLink', glyph: '↗' },
  { kind: 'divider', key: 'editor.addDivider', glyph: '—' },
]

/**
 * CAP-17 + BLK-01: موضع إدراج «+» بين الشرائح — صار منبثقةً بأنواع الكتل.
 * الاسم المتاح للزر «أضف كتلة»، والعنوان الكامل يوضح موضع الإدراج.
 * تُغلق المنبثقة بـEsc أو بالنقر خارجها (وصولية شرط قبول).
 */
export function InsertStep({ label, insertAt, onInsert, busy, docKind = 'guide' }: {
  label: string
  insertAt: number
  onInsert: (kind: InsertKind, insertAt: number) => void
  busy?: boolean
  /** BKL-01: نوع المستند يحدد القائمة — غيابه دليل (المسار القائم بلا تغيير) */
  docKind?: 'guide' | 'booklet'
}) {
  const ITEMS = docKind === 'booklet' ? BOOKLET_ITEMS : GUIDE_ITEMS
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
        <div className={`insert-menu insert-menu-${docKind}`} role="menu">
          {ITEMS.map(({ kind, key, glyph }) => (
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
              <span className="insert-menu-glyph" aria-hidden="true">
                {glyph}
              </span>
              <span className="insert-menu-label">{t(key)}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
