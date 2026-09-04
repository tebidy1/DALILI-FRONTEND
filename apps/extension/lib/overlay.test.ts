// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { createOverlay } from './overlay'
import type { SessionMeta } from './protocol'

/**
 * الشريط العائم صار مؤشرًا هادئًا فقط — أزرار التحكم (طمس/إخفاء/إنهاء…) انتقلت
 * إلى اللوحة الجانبية بأسلوب اسكرايب. يبقى هنا: مؤشر التسجيل + الحلقة + سطح سحب الطمس.
 *   • CAP-15: الإخفاء عبر toggleHidden (اختصار Ctrl+Shift+H أو زر اللوحة) + مقبض الإظهار.
 *   • CAP-13: setBlurMode يشغّل سطح السحب — يُطلق من زر «طمس» في اللوحة.
 */

function meta(state: SessionMeta['state'], stepCount = 3): SessionMeta {
  return {
    state,
    sessionId: 's1',
    startedAt: 1,
    stepCount,
  }
}

function host(): Element {
  return document.querySelector('dalili-overlay')!
}

function q(sel: string): HTMLElement {
  return host().shadowRoot!.querySelector(sel) as HTMLElement
}

function click(sel: string): void {
  q(sel).dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true }))
}

describe('CAP-15: إخفاء شريط التسجيل', () => {
  it('toggleHidden يطوي الشريط ويظهر مقبض الإظهار، والنقر على المقبض يعيده', () => {
    const o = createOverlay()
    o.mount()
    o.sync(meta('capturing'))
    expect(q('.bar').classList.contains('show')).toBe(true)
    expect(q('.peek').classList.contains('show')).toBe(false)

    o.toggleHidden()
    expect(q('.bar').classList.contains('show')).toBe(false)
    expect(q('.peek').classList.contains('show')).toBe(true)

    click('.peek')
    expect(q('.bar').classList.contains('show')).toBe(true)
    expect(q('.peek').classList.contains('show')).toBe(false)
    o.unmount()
  })

  it('الإخفاء لا يتوقف عند الإيقاف المؤقت ولا يوقف العدّاد — الشريط فقط يختفي', () => {
    const o = createOverlay()
    o.mount()
    o.sync(meta('capturing'))
    o.toggleHidden()
    o.sync(meta('paused', 5))
    // يظل مخفيًا في الإيقاف المؤقت — حالة الإخفاء قرار المستخدم لا حالة الجلسة
    expect(q('.bar').classList.contains('show')).toBe(false)
    o.sync(meta('capturing', 6))
    expect(q('.bar').classList.contains('show')).toBe(false)
    expect(q('.peek').classList.contains('show')).toBe(true)
    o.unmount()
  })

  it('انتهاء الجلسة يطوي المقبض أيضًا — لا يبقى شيء معلّقًا على الصفحة', () => {
    const o = createOverlay()
    o.mount()
    o.sync(meta('capturing'))
    o.toggleHidden()
    o.sync(meta('idle'))
    expect(q('.bar').classList.contains('show')).toBe(false)
    expect(q('.peek').classList.contains('show')).toBe(false)
    o.unmount()
  })
})

describe('CAP-13: وضع الطمس يُطلق من اللوحة', () => {
  it('setBlurMode يشغّل سطح السحب أثناء التسجيل ويطفئه، ولا يعمل خارج الجلسة', () => {
    const o = createOverlay()
    o.mount()
    // خارج جلسة نشطة: لا يُفعَّل الطمس مهما طُلب
    o.setBlurMode(true)
    expect(q('.veil').classList.contains('on')).toBe(false)

    o.sync(meta('capturing'))
    o.setBlurMode(true)
    expect(q('.veil').classList.contains('on')).toBe(true)
    o.setBlurMode(false)
    expect(q('.veil').classList.contains('on')).toBe(false)

    // الإيقاف المؤقت يطفئ الطمس تلقائيًا
    o.setBlurMode(true)
    o.sync(meta('paused', 4))
    expect(q('.veil').classList.contains('on')).toBe(false)
    o.unmount()
  })
})

/**
 * بلاغ المالك 2026-09-04 (عودة «المستطيلين»): إخفاء الحلقة مرةً عند الضغط لا
 * يكفي — `mouseover` يُعيدها في أي لحظة من نافذة الالتقاط (حركة فأر أو إعادة
 * رسم صفحة تحت مؤشّر ساكن)، فتُخبز في البكسل كإطارٍ ثانٍ جامد. الكتم يقفل
 * الباب طوال النافذة، ومؤقّت الأمان يفكّه إن سقط إعلان الانتهاء.
 */
describe('كتم حلقة التأشير خلال نافذة الالتقاط', () => {
  const RECT = { x: 10, y: 20, w: 100, h: 40 }

  it('أثناء الكتم لا تظهر الحلقة مهما نُودي showRing', () => {
    const o = createOverlay()
    o.mount()
    o.sync(meta('capturing'))
    o.showRing(RECT)
    expect(q('.ring').classList.contains('on')).toBe(true)

    o.suppressRing()
    expect(q('.ring').classList.contains('on')).toBe(false)
    o.showRing(RECT) // مرور فأر أثناء انتظار اللقطة
    expect(q('.ring').classList.contains('on')).toBe(false)
    o.unmount()
  })

  it('بعد فكّ الكتم تعود الحلقة كما كانت — لا تختفي إلى الأبد', () => {
    const o = createOverlay()
    o.mount()
    o.sync(meta('capturing'))
    o.suppressRing()
    o.releaseRing()
    o.showRing(RECT)
    expect(q('.ring').classList.contains('on')).toBe(true)
    o.unmount()
  })

  it('مؤقّت الأمان يفكّ الكتم وحده إن لم يصل إعلان انتهاء الالتقاط', async () => {
    const o = createOverlay()
    o.mount()
    o.sync(meta('capturing'))
    o.suppressRing(5) // مهلة قصيرة للاختبار — السلوك نفسه
    await new Promise((r) => setTimeout(r, 15))
    o.showRing(RECT)
    expect(q('.ring').classList.contains('on')).toBe(true)
    o.unmount()
  })

  it('الإخفاء الفوري باقٍ: الكتم يقطع الانتقال فلا تتلاشى الحلقة داخل اللقطة', () => {
    const o = createOverlay()
    o.mount()
    o.sync(meta('capturing'))
    o.showRing(RECT)
    o.suppressRing()
    expect(q('.ring').style.transition).toBe('none')
    o.unmount()
  })
})
