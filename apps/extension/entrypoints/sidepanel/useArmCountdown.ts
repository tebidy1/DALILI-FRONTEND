import { useEffect, useState } from 'react'
import { CANCEL_ARM_WINDOW_MS } from '@/lib/cancel-arm'

/**
 * المرحلة ٤: عدّاد تنازلي على الزر المسلَّح — الأربع ثوانٍ تُرى بدل تخمينها.
 * يعيد الثواني الصحيحة المتبقية (٤→١) بالتقسيم لأقرب عدد صحيح لأعلى، ويصفّر
 * عند انطفاء التسليح. `restartKey` يعيد العدّ من جديد عند تسليح هدف مختلف.
 */
export function useArmCountdown(active: boolean, restartKey: string | number = ''): number {
  const [left, setLeft] = useState(0)
  useEffect(() => {
    if (!active) {
      setLeft(0)
      return
    }
    const startedAt = Date.now()
    const tick = () => {
      const remain = CANCEL_ARM_WINDOW_MS - (Date.now() - startedAt)
      setLeft(remain > 0 ? Math.ceil(remain / 1000) : 0)
    }
    tick()
    const timer = window.setInterval(tick, 200)
    return () => window.clearInterval(timer)
  }, [active, restartKey])
  return left
}
