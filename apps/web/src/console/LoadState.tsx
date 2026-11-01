import type { ReactNode } from 'react'
import { t } from '../i18n'
import { Button } from '../ui/Button'

/** م٢: عرض الحالات الأربع لقائمة (القانون ٤) — يحمّل، وخطأ، وفارغ، ونتائج */
export function LoadState<T>({
  data,
  failed,
  onRetry,
  empty,
  children,
}: {
  data: T[] | T | null
  failed: boolean
  onRetry: () => void
  empty?: string
  children: (data: T[] | T) => ReactNode
}) {
  if (failed)
    return (
      <div className="err" role="alert">
        {t('common.loadError')} <Button size="sm" variant="ghost" onClick={onRetry}>{t('common.retry')}</Button>
      </div>
    )
  if (data === null) return <div className="muted">{t('console.loading')}</div>
  if (empty && Array.isArray(data) && data.length === 0) return <p className="muted">{empty}</p>
  return <>{children(data)}</>
}
