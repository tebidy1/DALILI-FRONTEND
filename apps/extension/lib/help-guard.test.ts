// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createHelpGuard } from './help-guard'

/** هـ ج١ (HLP-02) حاجز النقر — أخطر جزء: لا يصل لأودو أي حدث أثناء الوضع،
 *  وتبقى أزرار بطاقتنا داخل الصفحة تعمل، ويُعاد كل شيء كما كان بعد dispose. */

function fire(target: EventTarget, type: string, init: { key?: string } = {}): Event {
  const ev = type.startsWith('key')
    ? new KeyboardEvent(type, { key: init.key, bubbles: true, cancelable: true, composed: true })
    : new MouseEvent(type, { bubbles: true, cancelable: true, composed: true })
  target.dispatchEvent(ev)
  return ev
}

let guard: { dispose(): void } | null = null

afterEach(() => {
  guard?.dispose()
  guard = null
  document.body.innerHTML = ''
})

function mount(): { form: HTMLFormElement; save: HTMLButtonElement; link: HTMLAnchorElement } {
  document.body.innerHTML = `
    <form id="f"><button id="save" type="submit">حفظ</button></form>
    <a id="link" href="https://else.where/x">رابط</a>`
  return {
    form: document.querySelector('form')!,
    save: document.querySelector('#save')!,
    link: document.querySelector('#link')!,
  }
}

function startGuard() {
  const calls = { onHover: vi.fn(), onPick: vi.fn(), onExit: vi.fn() }
  guard = createHelpGuard(window, calls)
  return calls
}

describe('createHelpGuard', () => {
  it('النقر على زر الإرسال لا يرسل النموذج، ويصل الزر إلى onPick', () => {
    const { form, save } = mount()
    const submits = vi.fn()
    form.addEventListener('submit', submits)
    const calls = startGuard()
    const click = fire(save, 'click')
    expect(click.defaultPrevented).toBe(true) // إلغاء الافتراضي = لا إرسال في المتصفح
    expect(calls.onPick).toHaveBeenCalledWith(save)
    const sub = new Event('submit', { bubbles: true, cancelable: true })
    form.dispatchEvent(sub)
    expect(sub.defaultPrevented).toBe(true)
    expect(submits).not.toHaveBeenCalled()
  })

  it('النقر على رابط لا ينتقل ولا يصل لمستمعي الصفحة', () => {
    const { link } = mount()
    const pageClick = vi.fn()
    document.addEventListener('click', pageClick)
    const calls = startGuard()
    const click = fire(link, 'click')
    expect(click.defaultPrevented).toBe(true)
    expect(pageClick).not.toHaveBeenCalled()
    expect(calls.onPick).toHaveBeenCalledWith(link)
  })

  it('أحداث mousedown وpointerup وEnter لا تصل أبدًا لمستمعي الصفحة', () => {
    const { save } = mount()
    const downs = vi.fn()
    const ups = vi.fn()
    const keys = vi.fn()
    document.addEventListener('mousedown', downs)
    save.addEventListener('pointerup', ups)
    document.addEventListener('keydown', keys)
    startGuard()
    fire(save, 'mousedown')
    fire(save, 'pointerup')
    fire(document.body, 'keydown', { key: 'Enter' })
    expect(downs).not.toHaveBeenCalled()
    expect(ups).not.toHaveBeenCalled()
    expect(keys).not.toHaveBeenCalled()
  })

  it('أحداث طبقتنا dalili-* داخل Shadow DOM تمرّ كاملة', () => {
    mount()
    const calls = startGuard()
    const host = document.createElement('dalili-help')
    document.body.appendChild(host)
    const root = host.attachShadow({ mode: 'open' })
    root.innerHTML = '<button id="ours">زرنا</button>'
    const ours = root.querySelector('button')!
    const ourClick = vi.fn()
    ours.addEventListener('click', ourClick)
    const click = fire(ours, 'click')
    expect(ourClick).toHaveBeenCalledTimes(1) // مرّ ولم يُحجب
    expect(click.defaultPrevented).toBe(false)
    expect(calls.onPick).not.toHaveBeenCalledWith(ours) // وليس اختيارًا للصفحة
  })

  it('Escape يستدعي onExit ويُحجب، وكل مفتاح آخر يُحجب بلا استدعاء', () => {
    mount()
    const pageKey = vi.fn()
    document.addEventListener('keydown', pageKey)
    const calls = startGuard()
    const esc = fire(document, 'keydown', { key: 'Escape' })
    expect(calls.onExit).toHaveBeenCalledTimes(1)
    expect(esc.defaultPrevented).toBe(true)
    expect(pageKey).not.toHaveBeenCalled()
    const other = fire(document, 'keydown', { key: 'a' })
    expect(calls.onExit).toHaveBeenCalledTimes(1)
    expect(other.defaultPrevented).toBe(true)
    expect(pageKey).not.toHaveBeenCalled()
  })

  it('pointermove يصل onHover وتصل الصفحة أيضًا، وفوق طبقتنا لا تأشير', () => {
    const { save } = mount()
    const pageMove = vi.fn()
    document.addEventListener('pointermove', pageMove)
    const calls = startGuard()
    const move = fire(save, 'pointermove')
    expect(move.defaultPrevented).toBe(false)
    expect(calls.onHover).toHaveBeenCalledWith(save)
    expect(pageMove).toHaveBeenCalledTimes(1)
    const host = document.createElement('dalili-help')
    document.body.appendChild(host)
    const root = host.attachShadow({ mode: 'open' })
    root.innerHTML = '<button id="ours">زرنا</button>'
    fire(root.querySelector('button')!, 'pointermove')
    expect(calls.onHover).toHaveBeenCalledTimes(1) // فوق بطاقتنا لا تأشير
  })

  it('dispose يعيد الصفحة كما كانت تمامًا', () => {
    const { form, save } = mount()
    const calls = startGuard()
    guard!.dispose()
    const downs = vi.fn()
    const submits = vi.fn()
    document.addEventListener('mousedown', downs)
    form.addEventListener('submit', submits)
    fire(save, 'mousedown')
    expect(downs).toHaveBeenCalledTimes(1)
    const sub = new Event('submit', { bubbles: true, cancelable: true })
    form.dispatchEvent(sub)
    expect(submits).toHaveBeenCalledTimes(1)
    expect(sub.defaultPrevented).toBe(false)
    fire(save, 'click')
    expect(calls.onPick).not.toHaveBeenCalled()
  })
})
