import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import type { LibraryOverviewDto } from '@dalili/shared'
import { client } from '../api'
import { applyServerTheme } from '../lib/theme'
import { applyServerLocale } from '../lib/locale'

/**
 * المرحلة ب: نظرة المساحة المشتركة — نداء واحد /api/library/overview يغذي
 * الشريط الجانبي (اسم المساحة والدور والعدادات) وشريط إحصاءات الهوم وفلتر الموقع.
 * reload بعد كل كتابة تؤثر في العدادات (إنشاء/حذف/بوكمارك…).
 */

interface OverviewState {
  overview: LibraryOverviewDto | null
  reload: () => void
}

const Ctx = createContext<OverviewState>({ overview: null, reload: () => {} })

export function OverviewProvider({ children }: { children: ReactNode }) {
  const [overview, setOverview] = useState<LibraryOverviewDto | null>(null)
  const [seq, setSeq] = useState(0)

  useEffect(() => {
    const ac = new AbortController()
    client
      .libraryOverview(ac.signal)
      .then((ov) => {
        setOverview(ov)
        // مزامنة الثيم: قيمة الخادم هي الحقيقة — إن اختلفت عن المحلي طُبِّقت فورًا
        if (ov.myTheme) applyServerTheme(ov.myTheme)
        // مزامنة اللغة (I18N-01): مرآة الثيم بالضبط
        if (ov.myLocale) applyServerLocale(ov.myLocale)
      })
      .catch(() => {})
    return () => ac.abort()
  }, [seq])

  const reload = useCallback(() => setSeq((s) => s + 1), [])

  return <Ctx.Provider value={{ overview, reload }}>{children}</Ctx.Provider>
}

export function useOverview(): OverviewState {
  return useContext(Ctx)
}
