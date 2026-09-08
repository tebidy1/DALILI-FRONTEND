import { useEffect, useMemo, useRef, useState } from 'react'
import type { GuideSummaryDto } from '@dalili/shared'
import { client } from '../api'
import { t } from '../i18n'
import { arDigits } from '../lib/format'

/**
 * BKL-01: منتقي الدليل المضمّن. **يرشّح الكرّاسات** — الكرّاسة لا تُضمّ داخل كرّاسة
 * (والخادم يحرس القاعدة نفسها بـE-BKL-02؛ هذا الترشيح راحةٌ للمستخدم لا حراسة).
 * الإغلاق بـEsc أو بالنقر خارجه — نفس نمط InsertStep.
 */
export function EmbedPicker({
  onPick,
  onClose,
}: {
  onPick: (guideId: string, title: string, stepCount: number) => void
  onClose: () => void
}) {
  const [items, setItems] = useState<GuideSummaryDto[] | null>(null)
  const [error, setError] = useState('')
  const [q, setQ] = useState('')
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let alive = true
    client
      .listGuides({ limit: 50 })
      .then((res) => {
        if (alive) setItems(res.items)
      })
      .catch(() => {
        if (alive) setError(t('editor.embedPickError'))
      })
    return () => {
      alive = false
    }
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('mousedown', onDoc)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('mousedown', onDoc)
    }
  }, [onClose])

  const shown = useMemo(() => {
    const guidesOnly = (items ?? []).filter((g) => g.kind !== 'booklet')
    const needle = q.trim()
    return needle ? guidesOnly.filter((g) => g.title.includes(needle)) : guidesOnly
  }, [items, q])

  return (
    <div className="embed-picker" ref={ref} role="dialog" aria-label={t('editor.embedPickTitle')}>
      <h3 className="embed-picker-title">{t('editor.embedPickTitle')}</h3>
      <input
        type="search"
        className="embed-picker-search"
        aria-label={t('editor.embedSearch')}
        placeholder={t('editor.embedSearch')}
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />
      {error && <p className="embed-picker-error">{error}</p>}
      {!error && items === null && <p className="embed-picker-empty">{t('editor.embedPickLoading')}</p>}
      {!error && items !== null && shown.length === 0 && (
        <p className="embed-picker-empty">{t('editor.embedPickNone')}</p>
      )}
      <ul className="embed-picker-list">
        {shown.map((g) => (
          <li key={g.id}>
            <button type="button" className="embed-picker-item" onClick={() => onPick(g.id, g.title, g.stepCount)}>
              <span className="embed-picker-item-title">{g.title}</span>
              <span className="embed-picker-item-count">{t('editor.embedSteps', { n: arDigits(g.stepCount) })}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
