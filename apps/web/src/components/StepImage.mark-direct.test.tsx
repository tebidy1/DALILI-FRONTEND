// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { fireEvent, render } from '@testing-library/react'
import { StepImage } from './StepImage'
import type { TargetMark } from '@dalili/core'

/**
 * بلاغ المالك 2026-09-04 + طلبه: تجربة وورد لإطار الهدف.
 * ① «مستطيلان فوق بعض، يتحرك أحدهما ويظل الآخر» — إطار واحد يُرسم لا إطاران.
 * ② الإمساك المباشر بلا وضع خاص: المرور يبدّل المؤشّر، الجسم يُحرَّك، والمقابض
 *    تُحجِّم، والنقر في الفراغ ينزع التنشيط.
 *
 * الحيلة الاختبارية: صورة وهمية تُحمّل تزامنيًا بأبعاد الصندوق نفسها (1000×600)
 * فتنطبق إحداثيات العرض على الطبيعية 1:1، وسياق رسم وهمي يسجّل نداءاته.
 * `roundRect` لا يناديه إلا `drawMark`، فعدّه بعد آخر `drawImage` = **عدد الأطر
 * المرسومة في تمريرة الرسم الأخيرة** — وهو بيت القصيد في البلاغ ①.
 */

const IMG_W = 1000
const IMG_H = 600

const MARK: TargetMark = { rect: { x: 100, y: 100, w: 200, h: 100 }, color: '#ea580c' }

let calls: string[] = []

/** سياق 2d وهمي: كل خاصية غير معروفة تصير دالة صامتة تسجّل اسمها */
function fakeCtx(): CanvasRenderingContext2D {
  const store: Record<string, unknown> = {}
  return new Proxy(store, {
    get(t, k: string) {
      if (k in t) return t[k]
      return (...args: unknown[]) => {
        calls.push(k)
        return args.length ? undefined : undefined
      }
    },
    set(t, k: string, v) {
      t[k] = v
      return true
    },
  }) as unknown as CanvasRenderingContext2D
}

/** عدد أطر الهدف المرسومة في تمريرة الرسم الأخيرة (بعد آخر drawImage) */
function marksDrawnLastPass(): number {
  const from = calls.lastIndexOf('drawImage')
  if (from < 0) return 0
  return calls.slice(from).filter((c) => c === 'roundRect' || c === 'ellipse').length
}

class StubImage {
  onload: (() => void) | null = null
  naturalWidth = IMG_W
  naturalHeight = IMG_H
  set src(_v: string) {
    // التحميل تزامني في jsdom — بلا هذا يبقى imgRef فارغًا فلا رسم ولا منظار
    this.onload?.()
  }
}

beforeEach(() => {
  calls = []
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => fakeCtx())
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue({
    width: IMG_W,
    height: IMG_H,
    x: 0,
    y: 0,
    top: 0,
    left: 0,
    right: IMG_W,
    bottom: IMG_H,
    toJSON: () => ({}),
  } as DOMRect)
  vi.stubGlobal('Image', StubImage)
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

function firePointer(el: Element, type: string, x: number, y: number) {
  fireEvent(el, new PointerEvent(type, { bubbles: true, clientX: x, clientY: y, pointerId: 1 }))
}

interface Opts {
  active?: boolean
  mode?: 'view' | 'move-target'
  onMoveMark?: (r: unknown) => void
  onMarkActivate?: (on: boolean) => void
}

function mount(o: Opts = {}) {
  const { container } = render(
    <StepImage
      src="x.jpg"
      blurRects={[]}
      mode={o.mode ?? 'view'}
      mark={MARK}
      markActive={o.active}
      onMarkActivate={o.onMarkActivate}
      onMoveMark={o.onMoveMark}
      alt="لقطة"
    />,
  )
  return container.querySelector('canvas')!
}

describe('بلاغ «المستطيلان»: إطار هدف واحد لا اثنان', () => {
  it('في السكون يُرسم إطار واحد', () => {
    mount({ onMoveMark: vi.fn() })
    expect(marksDrawnLastPass()).toBe(1)
  })

  it('أثناء سحب الجسم يُرسم إطار واحد يتحرك — لا أصل جامد وفوقه معاينة', () => {
    const canvas = mount({ active: true, onMoveMark: vi.fn() })
    firePointer(canvas, 'pointerdown', 200, 150)
    firePointer(canvas, 'pointermove', 260, 180)
    expect(marksDrawnLastPass()).toBe(1)
  })

  it('أثناء إعادة التمركز في وضع «حرّك الهدف» يُرسم إطار واحد كذلك', () => {
    const canvas = mount({ mode: 'move-target', onMoveMark: vi.fn() })
    firePointer(canvas, 'pointerdown', 700, 400) // فراغ خارج الإطار = إعادة تمركز
    firePointer(canvas, 'pointermove', 720, 420)
    expect(marksDrawnLastPass()).toBe(1)
  })
})

describe('تجربة وورد: إمساك الشكل مباشرةً في وضع التصفّح', () => {
  it('سحب جسم الشكل يزيحه بمقدار الإزاحة نفسها', () => {
    const onMoveMark = vi.fn()
    const canvas = mount({ active: true, onMoveMark })
    firePointer(canvas, 'pointerdown', 200, 150)
    firePointer(canvas, 'pointermove', 260, 180)
    firePointer(canvas, 'pointerup', 260, 180)
    expect(onMoveMark).toHaveBeenCalledWith({ x: 160, y: 130, w: 200, h: 100 })
  })

  it('سحب مقبض الركن يحجّم الشكل ويثبّت الحافة المقابلة', () => {
    const onMoveMark = vi.fn()
    const canvas = mount({ active: true, onMoveMark })
    firePointer(canvas, 'pointerdown', 300, 200) // مقبض se
    firePointer(canvas, 'pointermove', 340, 230)
    firePointer(canvas, 'pointerup', 340, 230)
    expect(onMoveMark).toHaveBeenCalledWith({ x: 100, y: 100, w: 240, h: 130 })
  })

  it('النقر على الشكل يُنشّطه، والنقر في الفراغ ينزع تنشيطه', () => {
    const onMarkActivate = vi.fn()
    const canvas = mount({ onMoveMark: vi.fn(), onMarkActivate })
    firePointer(canvas, 'pointerdown', 200, 150)
    expect(onMarkActivate).toHaveBeenCalledWith(true)
  })

  it('نقرة في الفراغ تنزع التنشيط عن شكل منشَّط', () => {
    const onMarkActivate = vi.fn()
    const canvas = mount({ active: true, onMoveMark: vi.fn(), onMarkActivate })
    firePointer(canvas, 'pointerdown', 700, 450)
    expect(onMarkActivate).toHaveBeenCalledWith(false)
  })

  it('شكل غير منشَّط لا تُصطاد مقابضه — النقر عند ركنه يُمسك جسمه ويُنشّطه', () => {
    const onMoveMark = vi.fn()
    const canvas = mount({ onMoveMark })
    firePointer(canvas, 'pointerdown', 300, 200) // موضع مقبض se لكنه غير منشَّط
    firePointer(canvas, 'pointermove', 310, 200)
    firePointer(canvas, 'pointerup', 310, 200)
    expect(onMoveMark).toHaveBeenCalledWith({ x: 110, y: 100, w: 200, h: 100 })
  })

  it('العارض (بلا onMoveMark) لا يُمسك الشكل إطلاقًا — للقراءة لا للمس', () => {
    const onMarkActivate = vi.fn()
    const canvas = mount({ onMarkActivate })
    firePointer(canvas, 'pointerdown', 200, 150)
    firePointer(canvas, 'pointermove', 260, 180)
    firePointer(canvas, 'pointerup', 260, 180)
    expect(onMarkActivate).not.toHaveBeenCalled()
  })
})

describe('المؤشّر يفيد القابلية قبل أي نقرة', () => {
  it('فوق الجسم: يد مفتوحة، وأثناء السحب مقبوضة', () => {
    const canvas = mount({ active: true, onMoveMark: vi.fn() })
    firePointer(canvas, 'pointermove', 200, 150)
    expect(canvas.style.cursor).toBe('grab')
    firePointer(canvas, 'pointerdown', 200, 150)
    firePointer(canvas, 'pointermove', 210, 150)
    expect(canvas.style.cursor).toBe('grabbing')
  })

  it('فوق ركن شكل منشَّط: سهم تحجيم قطري', () => {
    const canvas = mount({ active: true, onMoveMark: vi.fn() })
    firePointer(canvas, 'pointermove', 300, 200)
    expect(canvas.style.cursor).toBe('nwse-resize')
  })

  it('خارج الشكل: لا مؤشّر خاص يدّعي قابلية غير موجودة', () => {
    const canvas = mount({ active: true, onMoveMark: vi.fn() })
    firePointer(canvas, 'pointermove', 700, 450)
    expect(canvas.style.cursor).toBe('')
  })
})
