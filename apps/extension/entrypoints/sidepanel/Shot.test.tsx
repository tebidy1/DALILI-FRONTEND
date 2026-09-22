// @vitest-environment jsdom
import { render, fireEvent, cleanup } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
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

  it('بلا إطار: لا تكبير ولا زر حتى مع canToggle', () => {
    const { container } = render(<PreviewShot src="x.jpg" alt="لقطة" canToggle />)
    expect(container.querySelector('.step-shot.zoom')).toBeNull()
    expect(container.querySelector('.shot-toggle')).toBeNull()
  })
})
