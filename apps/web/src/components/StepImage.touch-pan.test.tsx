// @vitest-environment jsdom
import fs from 'node:fs'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render } from '@testing-library/react'
import { StepImage } from './StepImage'
import type { TargetMark } from '@dalili/core'

/**
 * بلاغ المالك 2026-10-02: «العارض لا يستجيب للجوال بصورة جيدة».
 * الجذر: إطار اللقطة يحمل `touch-action: none`، ومع تكبير القراءة صارت كل لقطة
 * قابلة للسحب — فالإصبع الذي يبدأ فوق لقطة يحرّك الصورة ولا يمرّر الصفحة، واللقطات
 * تملأ معظم شاشة الجوال. العلاج: في وضع القراءة التمرير الرأسي للمتصفح (`pan-y`)
 * والسحب الأفقي للّقطة. وحين يأخذ المتصفح الإيماءة يطلق `pointercancel` — فيجب أن
 * تُفلت اللقطة قبضتها ولا تبقى «ممسوكة».
 */
const IMG_W = 1000
const IMG_H = 600
const MARK: TargetMark = { rect: { x: 100, y: 100, w: 200, h: 100 }, color: '#ea580c' }

function fakeCtx(): CanvasRenderingContext2D {
  const store: Record<string, unknown> = {}
  return new Proxy(store, {
    get(t, k: string) {
      if (k in t) return t[k]
      return () => undefined
    },
    set(t, k: string, v) {
      t[k] = v
      return true
    },
  }) as unknown as CanvasRenderingContext2D
}

class StubImage {
  onload: (() => void) | null = null
  naturalWidth = IMG_W
  naturalHeight = IMG_H
  set src(_v: string) {
    this.onload?.()
  }
}

beforeEach(() => {
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

describe('سحب اللقطة باللمس في وضع القراءة', () => {
  it('pointercancel (المتصفح أخذ الإيماءة ليمرّر الصفحة) يُفلت القبضة — لا لقطة عالقة «ممسوكة»', () => {
    const { container } = render(<StepImage src="x.jpg" blurRects={[]} mode="view" mark={MARK} alt="لقطة" />)
    const shot = container.querySelector('.shot')!
    const canvas = container.querySelector('canvas')!
    expect(shot.className).toContain('can-pan')

    firePointer(canvas, 'pointerdown', 400, 300)
    expect(shot.className).toContain('grabbing')
    const held = canvas.style.transform

    firePointer(canvas, 'pointercancel', 400, 340)
    expect(shot.className).not.toContain('grabbing')

    // بعد الإفلات لا تتبع اللقطة حركة لاحقة بلا إمساك جديد
    firePointer(canvas, 'pointermove', 300, 200)
    expect(canvas.style.transform).toBe(held)
  })
})

describe('قواعد اللمس في ورقة الأنماط', () => {
  const css = fs.readFileSync(path.join(__dirname, '..', 'index.css'), 'utf8')

  it('لقطة القراءة (غير وضع الرسم) تترك التمرير الرأسي وتكبير الإصبعين للمتصفح', () => {
    expect(css).toMatch(/\.shot:not\(\.drawing\) \.shot-viewport\s*\{[^}]*touch-action:\s*pan-y pinch-zoom/)
  })

  it('وضع التعديل يحتفظ بالإيماءة كاملة للّوحة (تحريك الهدف وتحجيمه)', () => {
    expect(css).toMatch(/\.editor-page\.editing \.shot-viewport\s*\{[^}]*touch-action:\s*none/)
  })
})
