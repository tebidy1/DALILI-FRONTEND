/**
 * EDT-10: مكدس تراجع/إعادة للمحرر — لقطات حالة مع دمج متتابع.
 * الدفع بمفتاح دمج (مثل حقل التحرير) يستبدل قمة المكدس داخل نافذة قصيرة،
 * فتعود سلسلة كتابة كاملة بتراجعة واحدة بدل تراجعة لكل حرف.
 */

const MAX_ENTRIES = 50
const COALESCE_MS = 700

export interface History<T> {
  push(state: T, coalesceKey?: string): void
  undo(): T | null
  redo(): T | null
  canUndo(): boolean
  canRedo(): boolean
}

export function createHistory<T>(): History<T> {
  // القمة دائمًا الحالة الحالية؛ ما تحتها الماضي وما فوق مستقبل الإعادة
  let past: T[] = []
  let future: T[] = []
  let lastKey: string | undefined
  let lastAt = 0

  return {
    push(state, coalesceKey) {
      const now = Date.now()
      const top = past[past.length - 1]
      const coalesce =
        coalesceKey !== undefined && coalesceKey === lastKey && now - lastAt <= COALESCE_MS && top !== undefined
      if (coalesce) {
        past[past.length - 1] = state
      } else {
        past.push(state)
        if (past.length > MAX_ENTRIES) past = past.slice(past.length - MAX_ENTRIES)
      }
      future = [] // دفع جديد يقطع فرع الإعادة
      lastKey = coalesceKey
      lastAt = now
    },
    undo() {
      if (past.length <= 1) return null
      const current = past.pop()!
      future.push(current)
      lastKey = undefined // التراجع يكسر سلسلة الدمج دائمًا
      return past[past.length - 1] ?? null
    },
    redo() {
      const next = future.pop()
      if (next === undefined) return null
      past.push(next)
      lastKey = undefined
      return next
    },
    canUndo() {
      return past.length > 1
    },
    canRedo() {
      return future.length > 0
    },
  }
}
