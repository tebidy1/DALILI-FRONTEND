import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { IconMagnifier } from '../ui/icons'
import { t } from '../i18n'

/**
 * طلب المالك 2026-09-03: البحث سطر مستقل فاصلًا بين الشريط والبطاقات — في متن
 * الشاشات الأولى (الرئيسية/أنشئ بواسطي/المحفوظات). Enter صريح بمعالج keydown:
 * بيئة الويب فيو لا تضمن الإرسال الضمني للنماذج بلا زر إرسال.
 */
export function HomeSearch() {
  const [q, setQ] = useState('')
  const navigate = useNavigate()

  const submit = () => {
    const query = q.trim()
    if (query) navigate(`/search?q=${encodeURIComponent(query)}`)
  }

  return (
    <form
      className="home-search home-search-row"
      role="search"
      onSubmit={(e) => {
        e.preventDefault()
        submit()
      }}
    >
      <button type="submit" className="home-search-btn" aria-label={t('library.searchHint')}>
        <IconMagnifier size={15} />
      </button>
      <input
        type="search"
        aria-label={t('library.searchHint')}
        placeholder={t('library.searchHintShort')}
        value={q}
        maxLength={120}
        onChange={(e) => setQ(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            submit()
          }
        }}
      />
    </form>
  )
}
