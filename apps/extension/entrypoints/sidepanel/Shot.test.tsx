// @vitest-environment jsdom
import fs from 'node:fs'
import path from 'node:path'
import { act, render, fireEvent, cleanup } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { PreviewShot } from './Shot'

afterEach(cleanup)

/** jsdom لا يفكّ الصور — نحقن الأبعاد الطبيعية ثم نطلق load */
function loadImg(container: HTMLElement, w = 1000, h = 600) {
  const img = container.querySelector('img')!
  Object.defineProperty(img, 'naturalWidth', { value: w, configurable: true })
  Object.defineProperty(img, 'naturalHeight', { value: h, configurable: true })
  fireEvent.load(img)
  return img
}

describe('PreviewShot — PNL-01', () => {
  it('يرسم صندوق طمس معتمًا لكل منطقة طمس (الملف المخزَّن غير مطموس)', () => {
    const { container } = render(
      <PreviewShot src="x.jpg" alt="لقطة" blur={[{ x: 0, y: 0, w: 100, h: 60 }, { x: 500, y: 300, w: 10, h: 10 }]} />,
    )
    loadImg(container)
    const boxes = container.querySelectorAll('.shot-blur')
    expect(boxes).toHaveLength(2)
    expect((boxes[0] as HTMLElement).style.width).toBe('10%')
  })

  it('القصّ: الطبقة بنسبة القصّ والصورة مُزاحة، والإطار بإحداثيات محلية', () => {
    const { container } = render(
      <PreviewShot
        src="x.jpg"
        alt="لقطة"
        crop={{ x: 500, y: 300, w: 500, h: 300 }}
        mark={{ x: 600, y: 330, w: 50, h: 30 }}
        canToggle
      />,
    )
    const img = loadImg(container)
    fireEvent.click(container.querySelector('.shot-toggle')!) // وضع اللقطة كاملة: بلا تحويل
    expect(img.style.width).toBe('200%')
    expect(img.style.left).toBe('-100%')
    const mark = container.querySelector('.shot-mark') as HTMLElement
    expect(mark.style.left).toBe('20%') // (600-500)/500
    expect(mark.style.top).toBe('10%') // (330-300)/300
  })

  it('زر التبديل يبدّل بين التكبير واللقطة الكاملة ويعلن حالته', () => {
    const { container } = render(<PreviewShot src="x.jpg" alt="لقطة" mark={{ x: 10, y: 10, w: 20, h: 20 }} canToggle />)
    const shot = container.querySelector('.step-shot')!
    const btn = container.querySelector('.shot-toggle') as HTMLButtonElement
    expect(shot.classList.contains('zoom')).toBe(true)
    expect(btn.getAttribute('aria-pressed')).toBe('false')
    fireEvent.click(btn)
    expect(shot.classList.contains('zoom')).toBe(false)
    expect(btn.getAttribute('aria-pressed')).toBe('true')
  })

  it('بلا canToggle لا زر (سلوك قائمة الالتقاط كما هو)', () => {
    const { container } = render(<PreviewShot src="x.jpg" alt="لقطة" mark={{ x: 10, y: 10, w: 20, h: 20 }} />)
    expect(container.querySelector('.shot-toggle')).toBeNull()
    expect(container.querySelector('.step-shot.zoom')).not.toBeNull()
  })

  /**
   * بلاغ المالك 2026-10-02: في حائط الإضافة «مستطيل التحديد يظهر كبيرًا ومشوّهًا واللقطة
   * باهتة». الجذر: التكبير كان `transform: scale()` على طبقة فيها الصورة والإطار —
   * فيتضخّم خطّ الإطار وزواياه مع التكبير، وتُمدّ نقطية الطبقة (بدقّة ما قبل التكبير)
   * فتبهت. العلاج: التكبير **تخطيطي** (عرض الطبقة = نسبة التكبير) والتحويل إزاحة فقط —
   * الصورة تُرسم بدقّتها والإطار بسمكه الحقيقي.
   */
  describe('التكبير تخطيطي لا scale', () => {
    function mountZoomed() {
      // jsdom بلا ResizeObserver ولا قياس — نحقن نافذة ٣٠٠×٢٢٥ ومراقبًا يطلق فورًا
      const cw = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientWidth')
      const ch = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientHeight')
      Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get: () => 300 })
      Object.defineProperty(HTMLElement.prototype, 'clientHeight', { configurable: true, get: () => 225 })
      vi.stubGlobal(
        'ResizeObserver',
        class {
          constructor(private cb: () => void) {}
          observe() {
            this.cb()
          }
          disconnect() {}
        },
      )
      const r = render(<PreviewShot src="x.jpg" alt="لقطة" mark={{ x: 480, y: 280, w: 40, h: 40 }} />)
      act(() => {
        loadImg(r.container) // 1000×600
      })
      const restore = () => {
        if (cw) Object.defineProperty(HTMLElement.prototype, 'clientWidth', cw)
        if (ch) Object.defineProperty(HTMLElement.prototype, 'clientHeight', ch)
        vi.unstubAllGlobals()
      }
      return { ...r, restore }
    }

    it('الطبقة تُكبَّر بعرضها (٪) والتحويل إزاحة فقط — لا scale يمدّ الصورة ولا يضخّم الإطار', () => {
      const { container, restore } = mountZoomed()
      const layer = container.querySelector('.shot-zoom') as HTMLElement
      expect(layer.style.transform).toMatch(/^translate\(/)
      expect(layer.style.transform).not.toContain('scale')
      // حدّ الالتقاط الأقصى ٢٫٥× → عرض الطبقة ٢٥٠٪ من النافذة
      expect(layer.style.width).toBe('250%')
      // الإطار بنِسَب من الطبقة — يبقى منطبقًا على العنصر بلا تحويل خاص به
      const mark = container.querySelector('.shot-mark') as HTMLElement
      expect(mark.style.left).toBe('48%')
      expect(mark.style.width).toBe('4%')
      restore()
    })

    it('ورقة الأنماط: لا will-change على طبقة التكبير (كان يثبّت نقطيّتها فتبهت عند التكبير)', () => {
      const css = fs.readFileSync(path.join(__dirname, 'sidepanel.css'), 'utf8')
      const rule = css.match(/\.step-shot\.zoom \.shot-zoom\s*\{[^}]*\}/)?.[0] ?? ''
      expect(rule).not.toBe('')
      expect(rule).not.toContain('will-change')
    })
  })

  it('بلا إطار: لا تكبير ولا زر حتى مع canToggle', () => {
    const { container } = render(<PreviewShot src="x.jpg" alt="لقطة" canToggle />)
    expect(container.querySelector('.step-shot.zoom')).toBeNull()
    expect(container.querySelector('.shot-toggle')).toBeNull()
  })
})
