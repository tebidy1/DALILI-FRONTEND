import { useRef, useState } from 'react'
import { t } from '../i18n'
import { useDismissOnOutside } from '../lib/dismiss'
import { getLocale } from '../lib/locale'

/**
 * BKL-01 + قرار المالك 2026-09-10: ما يُدرجه زر «+» كلّه كتل عميل — خطوة يدوية
 * تُرفق صورتُها ويُكتب تعليقُها هنا. الالتقاط الحقيقي للامتداد وحده، ومن لوحته
 * الجانبية لا من المحرر.
 */
export type InsertKind =
  | 'step'
  | 'tip'
  | 'alert'
  | 'header'
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
  /** اللاتيني للوضع الإنجليزي (I18N-01) — غيابه يعني الرمز عالمي */
  glyphEn?: string
}

const GUIDE_ITEMS: MenuItem[] = [
  { kind: 'step', key: 'editor.addStepManual', glyph: '١', glyphEn: '1' },
  { kind: 'tip', key: 'editor.addTip', glyph: '✦' },
  { kind: 'alert', key: 'editor.addAlert', glyph: '!' },
  { kind: 'header', key: 'editor.addHeader', glyph: 'ع', glyphEn: 'H' },
]

/** BKL-01: لا «التقاط» في الكرّاسة بقصد — الكرّاسة تجمع الأدلة ولا تلتقطها */
const BOOKLET_ITEMS: MenuItem[] = [
  { kind: 'text', key: 'editor.addText', glyph: '¶' },
  { kind: 'header', key: 'editor.addHeader', glyph: 'ع', glyphEn: 'H' },
  { kind: 'tip', key: 'editor.addTip', glyph: '✦' },
  { kind: 'alert', key: 'editor.addAlert', glyph: '!' },
  { kind: 'embed', key: 'editor.addEmbed', glyph: '⧉' },
  { kind: 'image', key: 'editor.addImage', glyph: '▣' },
  { kind: 'video', key: 'editor.addVideo', glyph: '▶' },
  { kind: 'link', key: 'editor.addLink', glyph: '↗' },
  { kind: 'divider', key: 'editor.addDivider', glyph: '—' },
]

/**
 * CAP-17→BKL-01 (قرار المالك 2026-09-10): موضع إدراج «+» بين الشرائح — منبثقة
 * بأنواع الكتل، وتسميتها حسب نوع المستند: «أضف خطوات» للدليل و«أضف كتلة» للكرّاسة
 * (الزر نفسه لا نصّان لمقصدين). تُغلق بـEsc أو بالنقر خارجها.
 */
export function InsertStep({ label, insertAt, onInsert, busy, docKind = 'guide' }: {
  label: string
  insertAt: number
  onInsert: (kind: InsertKind, insertAt: number) => void
  busy?: boolean
  /** BKL-01: نوع المستند يحدد القائمة والتسمية — غيابه دليل */
  docKind?: 'guide' | 'booklet'
}) {
  const ITEMS = docKind === 'booklet' ? BOOKLET_ITEMS : GUIDE_ITEMS
  const addLabel = docKind === 'booklet' ? t('editor.blockMenuOpen') : t('editor.addStepsShort')
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useDismissOnOutside(open, ref, () => setOpen(false), document)
  return (
    <div className="insert-step no-print" ref={ref}>
      <button
        type="button"
        className="insert-step-btn"
        aria-label={addLabel}
        title={label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        disabled={busy}
      >
        <span aria-hidden>+</span> {addLabel}
      </button>
      {open && (
        <div className={`insert-menu insert-menu-${docKind}`} role="menu">
          {ITEMS.map(({ kind, key, glyph, glyphEn }) => (
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
                {(getLocale() === 'en' ? glyphEn : undefined) ?? glyph}
              </span>
              <span className="insert-menu-label">{t(key)}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
