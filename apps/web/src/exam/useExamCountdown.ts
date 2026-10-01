import { useEffect, useState } from 'react'
import { getLocale } from '../lib/locale'

/**
 * عدّاد تنازلي حتى الموعد النهائي القادم من الخادم (deadlineAt) — دقة الثانية كافية
 * لمحاكاة 150 دقيقة. ملاحظة معمارية: قانون «لا استطلاع» موجّه لحلقات الالتقاط؛
 * هذه نبضة واجهة واحدة (1Hz) في شاشة الاختبار حصرًا والخادم هو حاكم الوقت أصلًا.
 */
export function useExamCountdown(deadlineIso: string, onExpire?: () => void): number {
  const [secondsLeft, setSecondsLeft] = useState(() => Math.max(0, Math.round((new Date(deadlineIso).getTime() - Date.now()) / 1000)))

  useEffect(() => {
    const deadline = new Date(deadlineIso).getTime()
    let expired = Date.now() >= deadline
    setSecondsLeft(Math.max(0, Math.round((deadline - Date.now()) / 1000)))
    const id = window.setInterval(() => {
      const left = Math.max(0, Math.round((deadline - Date.now()) / 1000))
      setSecondsLeft(left)
      if (left === 0 && !expired) {
        expired = true
        window.clearInterval(id)
        onExpire?.()
      }
    }, 1000)
    return () => window.clearInterval(id)
    // onExpire يُقرأ من الإغلاق عند التركيب — التسليم الآلي يحدث مرة واحدة في عمر العدّاد
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deadlineIso])

  return secondsLeft
}

const EASTERN = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩']

/** ساعة الاختبار mm:ss أو h:mm:ss بأرقام لغة العرض (شرقية عربيًّا) */
export function fmtClock(totalSeconds: number): string {
  const s = Math.max(0, totalSeconds)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  const pad = (n: number) => String(n).padStart(2, '0')
  const raw = h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${pad(m)}:${pad(sec)}`
  if (getLocale() === 'en') return raw
  return raw.replace(/\d/g, (d) => EASTERN[Number(d)]!)
}
