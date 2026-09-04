import { useEffect, useRef } from 'react'
import { t } from '../i18n'

interface Props {
  onClose: () => void
}

/** UX-04: قائمة اختصارات لوحة المفاتيح — تُفتح بـ؟ من أي مكان، وتُغلق بـEsc */
export function ShortcutsDialog({ onClose }: Props) {
  const closeRef = useRef<HTMLButtonElement | null>(null)

  // إدارة التركيز: يبدأ على زر الإغلاق — حوار لا يسرق دورة tab
  useEffect(() => {
    closeRef.current?.focus()
  }, [])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const rows: Array<[string, string]> = [
    ['Ctrl + K', t('shortcuts.search')],
    ['Ctrl + Z', t('shortcuts.undo')],
    ['Ctrl + Shift + Z', t('shortcuts.redo')],
    ['Esc', t('shortcuts.esc')],
    ['?', t('shortcuts.help')],
    ['Ctrl + Shift + U', t('shortcuts.capture')],
    ['Ctrl + Shift + H', t('shortcuts.hideBar')],
  ]

  return (
    <div className="palette-backdrop" onClick={onClose}>
      <div
        className="palette shortcuts"
        role="dialog"
        aria-modal="true"
        aria-label={t('shortcuts.title')}
        onClick={(e) => e.stopPropagation()}
      >
        <h2>{t('shortcuts.title')}</h2>
        <ul className="shortcut-list">
          {rows.map(([keys, desc]) => (
            <li key={keys}>
              <kbd dir="ltr">{keys}</kbd>
              <span>{desc}</span>
            </li>
          ))}
        </ul>
        <div className="palette-foot">
          <button ref={closeRef} className="btn sm ghost" onClick={onClose}>
            {t('shortcuts.close')}
          </button>
        </div>
      </div>
    </div>
  )
}
