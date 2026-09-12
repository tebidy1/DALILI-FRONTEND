import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import type { SearchHitDto } from '@dalili/shared'
import { client } from '../api'
import { t } from '../i18n'

const DEBOUNCE_MS = 200
const TIMEOUT_MS = 5000

/**
 * لوحة البحث الفوري (SRCH-03): Ctrl+K من أي مكان.
 * قوانين صلبة: debounce 200ms · إلغاء الطلب السابق · مهلة 5 ثوانٍ برسالة صريحة —
 * لا دوّامة أبدية أبدًا (قانون لا تعليق).
 * المرحلة ٤: لا لوحة على الصفحات العامة (دخول/رابط مشاركة/هوية) — الزائر بلا حساب
 * لا أدلة له، والاختصار يبقى للمتصفح لا لنا.
 */
export function SearchPalette() {
  const navigate = useNavigate()
  const location = useLocation()
  const isPublic =
    location.pathname === '/login' ||
    location.pathname === '/brand' ||
    location.pathname.startsWith('/s/') ||
    location.pathname.startsWith('/embed/s/')
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const [hits, setHits] = useState<SearchHitDto[] | null>(null)
  const [state, setState] = useState<'idle' | 'busy' | 'error'>('idle')
  const [sel, setSel] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (isPublic) return
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setOpen((o) => !o)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [isPublic])

  useEffect(() => {
    if (open) {
      setQ('')
      setHits(null)
      setState('idle')
      setSel(0)
      // التركيز بعد رسم اللوحة
      requestAnimationFrame(() => inputRef.current?.focus())
    }
  }, [open])

  // البحث الحي: debounce + إلغاء سابق + مهلة صريحة — كله بالأحداث لا بالاستطلاع
  useEffect(() => {
    if (!open || !q.trim()) {
      setHits(null)
      setState('idle')
      return
    }
    let cancelled = false
    const ac = new AbortController()
    const killTimer = setTimeout(() => ac.abort(), TIMEOUT_MS)
    const debounceTimer = setTimeout(() => {
      setState('busy')
      client
        .searchSuggest(q, ac.signal)
        .then((r) => {
          if (cancelled) return
          setHits(r.hits)
          setSel(0)
          setState('idle')
        })
        .catch((err) => {
          if (cancelled || (err instanceof DOMException && err.name === 'AbortError')) return
          setState('error')
        })
    }, DEBOUNCE_MS)
    return () => {
      cancelled = true
      clearTimeout(debounceTimer)
      clearTimeout(killTimer)
      ac.abort()
    }
  }, [q, open])

  function go(h: SearchHitDto) {
    setOpen(false)
    navigate(h.stepId ? `/g/${h.guideId}#step-${h.stepId}` : `/g/${h.guideId}`)
  }

  function onInputKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Escape') {
      setOpen(false)
      return
    }
    if (!hits || hits.length === 0) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSel((s) => (s + 1) % hits.length)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSel((s) => (s - 1 + hits.length) % hits.length)
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const h = hits[sel]
      if (h) go(h)
    }
  }

  if (isPublic) return null
  if (!open) return null

  return (
    <div
      className="palette-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) setOpen(false)
      }}
    >
      <div className="palette" role="dialog" aria-modal="true" aria-label={t('palette.placeholder')}>
        <input
          ref={inputRef}
          type="search"
          className="palette-input"
          placeholder={t('palette.placeholder')}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={onInputKey}
          aria-label={t('palette.placeholder')}
        />
        <div className="palette-body">
          {state === 'busy' && (
            <div role="status" aria-live="polite" className="palette-msg">
              {t('palette.searching')}
            </div>
          )}
          {state === 'error' && (
            <div role="alert" className="palette-msg err">
              {t('palette.error')}
            </div>
          )}
          {state === 'idle' && !q.trim() && <div className="palette-msg muted">{t('palette.hint')}</div>}
          {state === 'idle' && q.trim() && hits !== null && hits.length === 0 && (
            <div className="palette-msg muted">{t('palette.empty')}</div>
          )}
          {state === 'idle' && hits !== null && hits.length > 0 && (
            <ul className="palette-list">
              {hits.map((h, i) => (
                <li key={`${h.guideId}:${h.stepId ?? 'g'}:${h.field}`}>
                  <button
                    type="button"
                    className={`palette-item ${i === sel ? 'sel' : ''}`}
                    onMouseEnter={() => setSel(i)}
                    onClick={() => go(h)}
                  >
                    <b>
                      <bdi>{h.guideTitle}</bdi>
                    </b>
                    <span className="muted">{h.stepNo ? t('search.stepOf', { no: h.stepNo }) : ''}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="palette-foot">
          <a
            href="#"
            onClick={(e) => {
              e.preventDefault()
              setOpen(false)
              navigate(`/search?q=${encodeURIComponent(q)}`)
            }}
          >
            {t('palette.openFull')}
          </a>
          <span className="muted">{t('palette.hint')}</span>
        </div>
      </div>
    </div>
  )
}
