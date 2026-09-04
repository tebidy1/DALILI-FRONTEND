import { useCallback, useRef, useState } from 'react'
import { t } from '../i18n'
import { requestTrainStart } from '../lib/append-capture'

/**
 * زر «دربني» (GM-01) — ثابت في الركن الأعلى من شاشة العارض: اقرأ الدليل أولًا
 * ثم ادخل التدريب، أو درّب مباشرة. يظهر فقط حين تحمل بعض الخطوات بطاقة تعريف
 * (AUTO-01). النقر يجسر إلى الامتداد عبر نفس أنبوب append-capture؛
 * غيابه أو فشله = رسالة عربية صادقة. ackTimeoutMs قابل للحقن للاختبار.
 */
export function TrainButton({ token, ackTimeoutMs }: { token: string; ackTimeoutMs?: number }) {
  const [error, setError] = useState('')
  const busy = useRef(false)

  const startTraining = useCallback(async () => {
    if (busy.current) return
    busy.current = true
    setError('')
    const res = await requestTrainStart(token, ackTimeoutMs)
    busy.current = false
    if (!res.ok) setError(res.errorAr || t('viewer.trainNoExt'))
  }, [token, ackTimeoutMs])

  return (
    <div className="train-fab-wrap no-print">
      <button type="button" className="train-fab" onClick={startTraining} aria-label={t('viewer.train')}>
        <span aria-hidden="true">🏃</span>
        <span>{t('viewer.train')}</span>
      </button>
      {error && (
        <p className="train-fab-error" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}
