import { describe, expect, it, vi, afterEach } from 'vitest'
import { act, render } from '@testing-library/react'
import { StepImage } from './StepImage'
import { focusViewport } from '../editor/focus'

/** PERF-03: اللقطة في العارض لا تُحمَّل ولا تُفكّ إلا حين تقترب من الشاشة (حدث لا حلقة) */

type IOCallback = IntersectionObserverCallback
let lastIO: { cb: IOCallback; observe: ReturnType<typeof vi.fn>; disconnect: ReturnType<typeof vi.fn> } | null = null

function stubIO() {
  lastIO = null
  class FakeIO {
    cb: IOCallback
    observe = vi.fn()
    disconnect = vi.fn()
    unobserve = vi.fn()
    constructor(cb: IOCallback) {
      this.cb = cb
      lastIO = this as unknown as { cb: IOCallback; observe: ReturnType<typeof vi.fn>; disconnect: ReturnType<typeof vi.fn> }
    }
  }
  vi.stubGlobal('IntersectionObserver', FakeIO)
}

function makeVisible() {
  lastIO!.cb([{ isIntersecting: true } as IntersectionObserverEntry], lastIO as never)
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('PERF-03: تحميل كسول للقطات', () => {
  it('قبل بلوغ الشاشة: عنصر نائب بلا canvas، وبعد الظهور يُرسم canvas', () => {
    stubIO()
    const { container } = render(<StepImage src="x.jpg" blurRects={[]} mode="view" lazy alt="لقطة" />)
    expect(lastIO?.observe).toHaveBeenCalled()
    expect(container.querySelector('.shot-idle')).toBeTruthy()
    expect(container.querySelector('canvas')).toBeNull()

    act(() => {
      makeVisible()
    })
    expect(container.querySelector('.shot-idle')).toBeNull()
    expect(container.querySelector('canvas')).toBeTruthy()
  })

  it('بلا lazy (المحرر): canvas فورًا بلا مراقب', () => {
    stubIO()
    const { container } = render(<StepImage src="x.jpg" blurRects={[]} mode="view" alt="لقطة" />)
    expect(lastIO).toBeNull()
    expect(container.querySelector('canvas')).toBeTruthy()
  })
})

/** ANNO-01: وضع الشرح يفعّل رقعة الرسم، والشروحات تُمرَّر بلا رمي حتى قبل تحميل الصورة */
describe('ANNO-01: وضع الشرح', () => {
  it('mode=annotate يضيف صنف الرسم على الرقعة', () => {
    stubIO()
    const { container } = render(
      <StepImage src="x.jpg" blurRects={[]} mode="annotate" tool="rect" color="#e11d48" alt="لقطة" />,
    )
    expect(container.querySelector('.shot.drawing')).toBeTruthy()
  })

  it('يقبل شروحات جاهزة في وضع العرض بلا رمي', () => {
    stubIO()
    const anns = [{ id: 'a1', type: 'number' as const, color: '#2b2a26', rect: { x: 5, y: 5, w: 0, h: 0 }, n: 1 }]
    const { container } = render(<StepImage src="x.jpg" blurRects={[]} annotations={anns} mode="view" alt="لقطة" />)
    expect(container.querySelector('canvas')).toBeTruthy()
  })
})

/** ANNO-02: إطار الهدف يُرسم من البيانات، والمنظار يبؤّر عليه */
describe('ANNO-02: منظار اللقطة وإطار الهدف', () => {
  const mark = { rect: { x: 1500, y: 900, w: 120, h: 40 }, color: '#ea580c' as const }

  it('اللقطة تُلفّ في منظار له صندوق مستقل عن اللوحة', () => {
    stubIO()
    const { container } = render(
      <StepImage src="x.jpg" blurRects={[]} mark={mark} mode="view" alt="لقطة" />,
    )
    expect(container.querySelector('.shot-viewport')).toBeTruthy()
    expect(container.querySelector('.shot-viewport canvas')).toBeTruthy()
  })

  it('اللوحة تحمل transform من المنظار — لا تُصغَّر بـ max-height', () => {
    stubIO()
    const v = focusViewport(mark.rect, 2000, 1200, 800, 500)
    const { container } = render(
      <StepImage src="x.jpg" blurRects={[]} mark={mark} viewport={v} mode="view" alt="لقطة" />,
    )
    const cv = container.querySelector('canvas') as HTMLCanvasElement
    expect(cv.style.transform).toContain('scale(')
    expect(cv.style.transformOrigin).toBe('0 0')
  })

  it('لقطة بلا mark (دليل قديم) تُعرض بلا رمي ولا إطار مضاف', () => {
    stubIO()
    const { container } = render(<StepImage src="x.jpg" blurRects={[]} mode="view" alt="لقطة" />)
    expect(container.querySelector('canvas')).toBeTruthy()
  })
})

/**
 * طلب المالك 2026-09-11: رقم الخطوة بلا هدف يظهر كشارة HTML على إطار اللقطة
 * (لا على اللوحة، فلا يقصّه المنظار). الخطوة ذات الهدف تحمل رقمها على اللوحة
 * بجوار السهم لا في الركن، فلا تحمل الشارة.
 */
describe('رقم الخطوة بلا هدف — شارة على الإطار', () => {
  const mark = { rect: { x: 100, y: 100, w: 80, h: 30 }, color: '#ea580c' as const }

  it('خطوة بلا هدف مع autoNumber ⇒ شارة .shot-step-num بالرقم ولون الدليل', () => {
    stubIO()
    const { container } = render(
      <StepImage src="x.jpg" blurRects={[]} mode="view" autoNumber={1} color="#ea580c" alt="لقطة" />,
    )
    const badge = container.querySelector('.shot-step-num') as HTMLElement
    expect(badge).toBeTruthy()
    expect(badge.textContent).toBe('1')
    expect(badge.style.backgroundColor).toBeTruthy()
  })

  it('خطوة ذات هدف ⇒ لا شارة إطار (الرقم على اللوحة بجوار السهم)', () => {
    stubIO()
    const { container } = render(
      <StepImage src="x.jpg" blurRects={[]} mark={mark} mode="view" autoNumber={2} color="#ea580c" alt="لقطة" />,
    )
    expect(container.querySelector('.shot-step-num')).toBeNull()
  })

  it('بلا autoNumber ⇒ لا شارة إطار', () => {
    stubIO()
    const { container } = render(<StepImage src="x.jpg" blurRects={[]} mode="view" alt="لقطة" />)
    expect(container.querySelector('.shot-step-num')).toBeNull()
  })

  it('كسول قبل الظهور ⇒ لا شارة (لا محتوى بعد)، وبعد الظهور تظهر', () => {
    stubIO()
    const { container } = render(
      <StepImage src="x.jpg" blurRects={[]} mode="view" autoNumber={1} color="#ea580c" lazy alt="لقطة" />,
    )
    expect(container.querySelector('.shot-step-num')).toBeNull()
    act(() => {
      makeVisible()
    })
    expect(container.querySelector('.shot-step-num')).toBeTruthy()
  })
})

/** S3: تحريك الهدف — سحبة واحدة تنقل الإطار لموضع آخر */
describe('S3: أداة تحريك الهدف', () => {
  const mark = { rect: { x: 100, y: 100, w: 80, h: 30 }, color: '#ea580c' as const }

  it('وضع move-target يعطي اللوحة مؤشّر الإمساك لا التقاطع', () => {
    stubIO()
    const { container } = render(
      <StepImage src="x.jpg" blurRects={[]} mark={mark} mode="move-target" onMoveMark={() => {}} alt="لقطة" />,
    )
    expect(container.querySelector('.shot.moving-target')).toBeTruthy()
  })

  it('بلا mark لا تُفعَّل الأداة — لا تحريك لهدف غير موجود', () => {
    stubIO()
    const { container } = render(
      <StepImage src="x.jpg" blurRects={[]} mode="move-target" onMoveMark={() => {}} alt="لقطة" />,
    )
    expect(container.querySelector('.shot.moving-target')).toBeNull()
  })
})
