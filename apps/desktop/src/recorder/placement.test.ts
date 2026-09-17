import { describe, expect, it } from 'vitest'
import {
  PLACEMENT_KEY,
  restorePlacement,
  trackPlacement,
  type PlacementStore,
  type WidgetWindow,
} from './placement'

/** ٣هـ-٣ — ثبات موضع الودجة: كل قراءة/كتابة محاطة try/catch — تعمل صحيحًا
 *  لو رجع التخزين فارغًا (نافذة خاصّة/ممسوحة) أو فشل نداء النافذة. */

function fakeStore(initial?: Record<string, string>): PlacementStore {
  const map = new Map(Object.entries(initial ?? {}))
  return {
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => {
      map.set(k, v)
    },
  }
}

function fakeWindow(opts?: {
  pos?: { x: number; y: number }
  rejectPosition?: boolean
  rejectSet?: boolean
}) {
  let handler: ((p: { x: number; y: number }) => void) | null = null
  const setCalls: Array<{ x: number; y: number }> = []
  const win: WidgetWindow = {
    async outerPosition() {
      if (opts?.rejectPosition) throw new Error('تعذّرت قراءة الموضع')
      return opts?.pos ?? { x: 0, y: 0 }
    },
    async setPosition(p) {
      if (opts?.rejectSet) throw new Error('تعذّر ضبط الموضع')
      setCalls.push(p)
    },
    onMoved(h) {
      handler = h
      return () => {
        handler = null
      }
    },
  }
  return {
    win,
    setCalls,
    move(p: { x: number; y: number }) {
      handler?.(p)
    },
  }
}

/** مجدول يدوي: يجمّع الأعمال حتى يقرّر الاختبار إجراءها */
function manualSchedule() {
  const queued: Array<() => void> = []
  const fn = (job: () => void) => {
    queued.push(job)
    return () => {
      const i = queued.indexOf(job)
      if (i >= 0) queued.splice(i, 1)
    }
  }
  return {
    schedule: fn,
    runAll() {
      const jobs = queued.splice(0)
      for (const j of jobs) j()
    },
    get size() {
      return queued.length
    },
  }
}

describe('٣هـ-٣ — ثبات موضع الودجة (try/catch شامل)', () => {
  it('(أ) استرجاع موضع محفوظ: setPosition بالقيمتين ويَعُد صحيحًا', async () => {
    const { win, setCalls } = fakeWindow()
    const store = fakeStore({ [PLACEMENT_KEY]: '120,80' })
    await expect(restorePlacement(win, store)).resolves.toBe(true)
    expect(setCalls).toEqual([{ x: 120, y: 80 }])
  })

  it('(ب) تخزين فارغ: false بلا نداء setPosition ولا رمي', async () => {
    const { win, setCalls } = fakeWindow()
    await expect(restorePlacement(win, fakeStore())).resolves.toBe(false)
    expect(setCalls).toEqual([])
  })

  it('(ج) قيم تالفة: بلا أرقام ⇒ false بلا رمي', async () => {
    const { win, setCalls } = fakeWindow()
    for (const bad of ['كلمة', '12', 'a,b', '1.5.2,3', ',']) {
      await expect(restorePlacement(win, fakeStore({ [PLACEMENT_KEY]: bad }))).resolves.toBe(false)
    }
    expect(setCalls).toEqual([])
  })

  it('(د) فشل التخزين أو فشل ضبط الموضع ⇒ false صامتة — لا استثناء يهرب', async () => {
    const throwingStore: PlacementStore = {
      getItem: () => {
        throw new Error('تخزين معطّل')
      },
      setItem: () => {
        throw new Error('تخزين معطّل')
      },
    }
    const w1 = fakeWindow()
    await expect(restorePlacement(w1.win, throwingStore)).resolves.toBe(false)

    const w2 = fakeWindow({ rejectSet: true })
    await expect(
      restorePlacement(w2.win, fakeStore({ [PLACEMENT_KEY]: '10,20' })),
    ).resolves.toBe(false)
  })

  it('(هـ) تتبّع السحب: حركة ⇒ حفظ مجدول بموضع outerPosition', async () => {
    const { win, move } = fakeWindow({ pos: { x: 500, y: 300 } })
    const store = fakeStore()
    const sched = manualSchedule()
    trackPlacement(win, store, sched.schedule)

    move({ x: 500, y: 300 })
    expect(sched.size).toBe(1)
    sched.runAll()
    await Promise.resolve() // الحفظ async — ينتظر حلّ outerPosition
    expect(store.getItem(PLACEMENT_KEY)).toBe('500,300')
  })

  it('(و) فشل قراءة outerPosition أثناء التتبّع ⇒ لا كتابة ولا استثناء يهرب', async () => {
    const { win, move } = fakeWindow({ rejectPosition: true })
    const store = fakeStore()
    const sched = manualSchedule()
    trackPlacement(win, store, sched.schedule)

    move({ x: 1, y: 2 })
    sched.runAll()
    await Promise.resolve()
    await Promise.resolve() // مهلة تكفي سلسلة save — أيّ رفض هارب كان أسقط vitest
    expect(store.getItem(PLACEMENT_KEY)).toBeNull()
  })

  it('(ز) خنق الحركات: ثلاث حركات متتالية قبل الإجراء ⇒ حفظ واحد فقط', async () => {
    const { win, move } = fakeWindow({ pos: { x: 9, y: 9 } })
    const store = fakeStore()
    const sched = manualSchedule()
    trackPlacement(win, store, sched.schedule)

    move({ x: 1, y: 1 })
    move({ x: 2, y: 2 })
    move({ x: 3, y: 3 })
    expect(sched.size).toBe(1)
    sched.runAll()
    await Promise.resolve()
    expect(store.getItem(PLACEMENT_KEY)).toBe('9,9')
  })
})
