// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { fireEvent, render } from '@testing-library/react'
import { StepImage } from './StepImage'

/**
 * EDT-05 إكمال: أداة النص (نقرة تفتح مربع كتابة وEnter يثبته) وأداة الرسم الحر
 * (PointerMove يجمع نقاط المسار كل ~8px). الاختبارات بأحداث Pointer حقيقية.
 */

function stubRect(el: Element) {
  vi.spyOn(el, 'getBoundingClientRect').mockReturnValue({
    width: 1000,
    height: 600,
    x: 0,
    y: 0,
    top: 0,
    left: 0,
    right: 1000,
    bottom: 600,
    toJSON: () => ({}),
  } as DOMRect)
}

beforeEach(() => {
  // jsdom بلا سيّاق رسم — كل الدوال المستعملة في الاختبار لا تعتمد على بكسل
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null as unknown as CanvasRenderingContext2D)
})

afterEach(() => {
  vi.restoreAllMocks()
})

function firePointer(el: Element, type: string, x: number, y: number) {
  fireEvent(el, new PointerEvent(type, { bubbles: true, clientX: x, clientY: y, pointerId: 1 }))
}

describe('EDT-05: أداة الرسم الحر', () => {
  it('PointerMove يجمع نقاط المسار والرفع يثبّت تعليق draw بإحداثيات طبيعية', () => {
    const onAdd = vi.fn()
    const { container } = render(
      <StepImage src="x.jpg" blurRects={[]} mode="annotate" tool="draw" color="#2b2a26" onAddAnnotation={onAdd} alt="لقطة" />,
    )
    const canvas = container.querySelector('canvas')!
    stubRect(canvas)
    firePointer(canvas, 'pointerdown', 100, 50)
    firePointer(canvas, 'pointermove', 200, 60)
    firePointer(canvas, 'pointermove', 300, 80)
    firePointer(canvas, 'pointerup', 300, 80)
    expect(onAdd).toHaveBeenCalledTimes(1)
    const ann = onAdd.mock.calls[0]![0] as { type: string; color: string; path: Array<{ x: number; y: number }> }
    expect(ann.type).toBe('draw')
    expect(ann.color).toBe('#2b2a26')
    // jsdom: canvas 300×150 والصندوق 1000×600 — x بمعامل 0.3 وy بمعامل 0.25
    expect(ann.path).toEqual([
      { x: 30, y: 13 },
      { x: 60, y: 15 },
      { x: 90, y: 20 },
    ])
  })

  it('نقطة واحدة لا تكفي — الرفع بلا حركة لا يثبّت شيئًا', () => {
    const onAdd = vi.fn()
    const { container } = render(
      <StepImage src="x.jpg" blurRects={[]} mode="annotate" tool="draw" onAddAnnotation={onAdd} alt="لقطة" />,
    )
    const canvas = container.querySelector('canvas')!
    stubRect(canvas)
    firePointer(canvas, 'pointerdown', 10, 10)
    firePointer(canvas, 'pointerup', 10, 10)
    expect(onAdd).not.toHaveBeenCalled()
  })
})

describe('EDT-05: أداة النص', () => {
  it('نقرة تفتح مربع كتابة في موضعها — Enter يثبّت تعليق text باللون المختار', () => {
    const onAdd = vi.fn()
    const { container } = render(
      <StepImage src="x.jpg" blurRects={[]} mode="annotate" tool="text" color="#e11d48" onAddAnnotation={onAdd} alt="لقطة" />,
    )
    const canvas = container.querySelector('canvas')!
    stubRect(canvas)
    firePointer(canvas, 'pointerdown', 120, 90)
    const input = container.querySelector('.shot-text-input') as HTMLInputElement
    expect(input).toBeTruthy()
    expect(input.getAttribute('maxlength')).toBe('80')
    expect(input.dir).toBe('rtl')
    fireEvent.change(input, { target: { value: 'انقر هنا أولًا' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onAdd).toHaveBeenCalledTimes(1)
    const ann = onAdd.mock.calls[0]![0] as { type: string; text: string; color: string; rect: { x: number; y: number } }
    expect(ann.type).toBe('text')
    expect(ann.text).toBe('انقر هنا أولًا')
    expect(ann.color).toBe('#e11d48')
    expect(ann.rect).toEqual({ x: 36, y: 23, w: 0, h: 0 }) // x×0.3 وy×0.25 في jsdom
    expect(container.querySelector('.shot-text-input')).toBeNull()
  })

  it('Escape يلغي بدون تعليق، والنص الفارغ لا يثبّت', () => {
    const onAdd = vi.fn()
    const { container } = render(
      <StepImage src="x.jpg" blurRects={[]} mode="annotate" tool="text" onAddAnnotation={onAdd} alt="لقطة" />,
    )
    const canvas = container.querySelector('canvas')!
    stubRect(canvas)
    firePointer(canvas, 'pointerdown', 50, 50)
    let input = container.querySelector('.shot-text-input') as HTMLInputElement
    fireEvent.keyDown(input, { key: 'Escape' })
    expect(container.querySelector('.shot-text-input')).toBeNull()
    expect(onAdd).not.toHaveBeenCalled()

    firePointer(canvas, 'pointerdown', 60, 60)
    input = container.querySelector('.shot-text-input') as HTMLInputElement
    fireEvent.change(input, { target: { value: '   ' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onAdd).not.toHaveBeenCalled()
  })
})

describe('بلاغ المالك 2026-09-04: تحريك تعليق النص القائم', () => {
  const textAnn = { id: 't1', type: 'text' as const, color: '#e11d48', text: 'انقر هنا أولًا', rect: { x: 150, y: 60, w: 0, h: 0 } }

  it('سحب النص بأداة النص يحرّكه — لا مربع كتابة، والردّ بموضع جديد بإحداثيات طبيعية', () => {
    const onMove = vi.fn()
    const onAdd = vi.fn()
    const { container } = render(
      <StepImage
        src="x.jpg"
        blurRects={[]}
        mode="annotate"
        tool="text"
        annotations={[textAnn]}
        onAddAnnotation={onAdd}
        onMoveAnnotation={onMove}
        alt="لقطة"
      />,
    )
    const canvas = container.querySelector('canvas')!
    stubRect(canvas)
    // المرساة الطبيعية (150,60) = معروض (500,240) بمقياس jsdom (×0.3، ×0.25)
    firePointer(canvas, 'pointerdown', 500, 240)
    expect(container.querySelector('.shot-text-input')).toBeNull() // إمساك نص قائم لا يفتح مربعًا
    firePointer(canvas, 'pointermove', 560, 270)
    firePointer(canvas, 'pointerup', 560, 270)
    expect(onAdd).not.toHaveBeenCalled()
    expect(onMove).toHaveBeenCalledTimes(1)
    const [id, rect] = onMove.mock.calls[0] as [string, { x: number; y: number; w: number; h: number }]
    expect(id).toBe('t1')
    // إزاحة العرض (60,30) تُحوَّل طبيعية: x+60×0.3=18 وy+30×0.25=8 (مقرّبة)
    expect(rect).toEqual({ x: 168, y: 68, w: 0, h: 0 })
  })

  it('نقرة بلا سحب فوق النص لا تفعل شيئًا — والنقر في الفراغ يفتح مربع كتابة كما كان', () => {
    const onMove = vi.fn()
    const onAdd = vi.fn()
    const { container } = render(
      <StepImage
        src="x.jpg"
        blurRects={[]}
        mode="annotate"
        tool="text"
        annotations={[textAnn]}
        onAddAnnotation={onAdd}
        onMoveAnnotation={onMove}
        alt="لقطة"
      />,
    )
    const canvas = container.querySelector('canvas')!
    stubRect(canvas)
    firePointer(canvas, 'pointerdown', 500, 240)
    firePointer(canvas, 'pointerup', 500, 240)
    expect(onMove).not.toHaveBeenCalled()
    expect(container.querySelector('.shot-text-input')).toBeNull()
    // فراغ بعيد عن النص: طبيعي (6,5) خارج صندوق النص
    firePointer(canvas, 'pointerdown', 20, 20)
    expect(container.querySelector('.shot-text-input')).toBeTruthy()
  })
})

describe('بلاغ المالك 2026-09-04 (تجربة ثانية): سلوك مربع النص الاحترافي كالرسام', () => {
  it('الكتابة ثم النقر بعيدًا تُثبّت النص ولا تفتح مربعًا جديدًا في نفس النقرة', () => {
    const onAdd = vi.fn()
    const { container } = render(
      <StepImage src="x.jpg" blurRects={[]} mode="annotate" tool="text" onAddAnnotation={onAdd} alt="لقطة" />,
    )
    const canvas = container.querySelector('canvas')!
    stubRect(canvas)
    firePointer(canvas, 'pointerdown', 120, 90)
    const input = container.querySelector('.shot-text-input') as HTMLInputElement
    fireEvent.change(input, { target: { value: 'انقر هنا أولًا' } })
    // النقر بعيدًا والمربع مفتوح = إثبات ما كُتب (المحتوى لا يضيع أبدًا)
    firePointer(canvas, 'pointerdown', 500, 400)
    expect(onAdd).toHaveBeenCalledTimes(1)
    const ann = onAdd.mock.calls[0]![0] as { text: string; rect: { x: number; y: number } }
    expect(ann.text).toBe('انقر هنا أولًا')
    expect(ann.rect).toEqual({ x: 36, y: 23, w: 0, h: 0 }) // موضع أول نقرة ×0.3/×0.25
    // والنقرة نفسها لا تفتح مربعًا جديدًا — لا «مربعات تتوالد»
    expect(container.querySelector('.shot-text-input')).toBeNull()
  })

  it('Enter يثبت ثم النقر اللاحق يفتح مربعًا جديدًا بلا تكرار للتعليق', () => {
    const onAdd = vi.fn()
    const { container } = render(
      <StepImage src="x.jpg" blurRects={[]} mode="annotate" tool="text" onAddAnnotation={onAdd} alt="لقطة" />,
    )
    const canvas = container.querySelector('canvas')!
    stubRect(canvas)
    firePointer(canvas, 'pointerdown', 120, 90)
    const input = container.querySelector('.shot-text-input') as HTMLInputElement
    fireEvent.change(input, { target: { value: 'نص أول' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onAdd).toHaveBeenCalledTimes(1)
    // نقرة جديدة بعد الإثبات = مربع جديد طبيعي، والتثبيت الأول لم يتكرر
    firePointer(canvas, 'pointerdown', 300, 200)
    expect(container.querySelector('.shot-text-input')).toBeTruthy()
    expect(onAdd).toHaveBeenCalledTimes(1)
  })

  it('Escape يلغي، والنقر بعده يفتح مربعًا جديدًا ولا يثبّت الملغي', () => {
    const onAdd = vi.fn()
    const { container } = render(
      <StepImage src="x.jpg" blurRects={[]} mode="annotate" tool="text" onAddAnnotation={onAdd} alt="لقطة" />,
    )
    const canvas = container.querySelector('canvas')!
    stubRect(canvas)
    firePointer(canvas, 'pointerdown', 120, 90)
    let input = container.querySelector('.shot-text-input') as HTMLInputElement
    fireEvent.change(input, { target: { value: 'لن يثبت' } })
    fireEvent.keyDown(input, { key: 'Escape' })
    expect(container.querySelector('.shot-text-input')).toBeNull()
    firePointer(canvas, 'pointerdown', 300, 200)
    expect(container.querySelector('.shot-text-input')).toBeTruthy()
    expect(onAdd).not.toHaveBeenCalled()
  })

  it('بلاغ المالك 2026-09-04 (ثالثة): blur بلا وجهة تركيز (افتراض نقرة اللوحة) لا يغلق المربع — وإلا لحظة الفتح يُثبَّت فارغًا ويختفي', () => {
    const onAdd = vi.fn()
    const { container } = render(
      <StepImage src="x.jpg" blurRects={[]} mode="annotate" tool="text" onAddAnnotation={onAdd} alt="لقطة" />,
    )
    const canvas = container.querySelector('canvas')!
    stubRect(canvas)
    firePointer(canvas, 'pointerdown', 120, 90)
    const input = container.querySelector('.shot-text-input') as HTMLInputElement
    fireEvent.change(input, { target: { value: 'سأكتب ثم أنقر اللوحة' } })
    // المتصفح يفرّغ التركيز بعد pointerdown على غير عنصر تركيز — blur بلا relatedTarget
    fireEvent.blur(input)
    expect(container.querySelector('.shot-text-input')).toBeTruthy() // المربع باقٍ
    expect(onAdd).not.toHaveBeenCalled()
  })

  it('blur بوجهة تركيز حقيقية (زر الشريط/Tab) يُثبّت ما كُتب — لا ضياع أبدًا', () => {
    const onAdd = vi.fn()
    const { container } = render(
      <StepImage src="x.jpg" blurRects={[]} mode="annotate" tool="text" onAddAnnotation={onAdd} alt="لقطة" />,
    )
    const canvas = container.querySelector('canvas')!
    stubRect(canvas)
    firePointer(canvas, 'pointerdown', 120, 90)
    const input = container.querySelector('.shot-text-input') as HTMLInputElement
    fireEvent.change(input, { target: { value: 'انقر هنا أولًا' } })
    fireEvent.blur(input, { relatedTarget: document.body })
    expect(onAdd).toHaveBeenCalledTimes(1)
    expect((onAdd.mock.calls[0]![0] as { text: string }).text).toBe('انقر هنا أولًا')
    expect(container.querySelector('.shot-text-input')).toBeNull()
  })
})
