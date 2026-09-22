import { useCallback, useState } from 'react'

/**
 * عدّاد إعادة الجلب المشترك للصفحات — الرفع وحده مشترك، وكل صفحة تمسح خطأها
 * وبياناتها قبل الرفع بنفسها فلا يتغيّر سلوك إعادة المحاولة.
 */
export function useReloadSeq(): [number, () => void] {
  const [seq, setSeq] = useState(0)
  const bump = useCallback(() => setSeq((s) => s + 1), [])
  return [seq, bump]
}
