// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
import { coverKind, sideOf, sightOf } from './train-sight'

// ث١ دربني الواثق: هل التحديد ظاهر على الزر فعلًا؟ jsdom بلا تخطيط — المستطيلات والنقاط محقونة

const vp = { w: 1000, h: 800 }
const rectOf = (el: Element, r: { x: number; y: number; w: number; h: number }) => {
  el.getBoundingClientRect = () => ({ x: r.x, y: r.y, left: r.x, top: r.y, width: r.w, height: r.h, right: r.x + r.w, bottom: r.y + r.h, toJSON: () => ({}) }) as DOMRect
}

let btn: HTMLButtonElement
let icon: HTMLElement
let modal: HTMLElement
let ourHost: HTMLElement
beforeEach(() => {
  document.body.innerHTML = '<button id="b"><i></i>حفظ</button><div role="dialog" id="m"><p>نافذة</p></div><dalili-train></dalili-train>'
  btn = document.getElementById('b') as HTMLButtonElement
  icon = btn.querySelector('i')!
  modal = document.getElementById('m')!
  ourHost = document.querySelector('dalili-train')!
  rectOf(btn, { x: 100, y: 100, w: 80, h: 30 })
})

const opts = (pointAt: (x: number, y: number) => Element | null, ignore: (n: Element) => boolean = () => false) => ({ pointAt, ignore, viewport: vp })

describe('sightOf — فحص الرؤية بالنقاط', () => {
  it('النقاط كلها على الزر أو داخله = ظاهر', () => {
    expect(sightOf(btn, opts(() => icon))).toEqual({ state: 'visible' })
  })

  it('نافذة فوق الزر = مغطّى ويُعاد المغطّي', () => {
    expect(sightOf(btn, opts(() => modal.querySelector('p')))).toEqual({ state: 'covered', cover: modal.querySelector('p') })
  })

  it('نقاط على طبقة دربني لا تُعدّ غطاءً — والباقي يحسم', () => {
    let n = 0
    const at = () => (n++ < 2 ? ourHost : btn)
    expect(sightOf(btn, opts(at, (e) => e === ourHost)).state).toBe('visible')
  })

  it('عنصر داخل Shadow DOM: النقطة تعيد المضيف = ظاهر لا مغطّى (مراجعة M1)', () => {
    const shell = document.createElement('div')
    document.body.appendChild(shell)
    const inner = shell.attachShadow({ mode: 'open' }).appendChild(document.createElement('input'))
    rectOf(inner, { x: 100, y: 100, w: 80, h: 30 })
    expect(sightOf(inner, opts(() => shell)).state).toBe('visible')
  })

  it('عنصر منفصل عن الصفحة (أعاد النظام بناءه) = gone', () => {
    btn.remove()
    expect(sightOf(btn, opts(() => null)).state).toBe('gone')
  })

  it('مستطيل خارج منفذ العرض = offscreen', () => {
    rectOf(btn, { x: 100, y: 2000, w: 80, h: 30 })
    expect(sightOf(btn, opts(() => btn))).toEqual({ state: 'offscreen', why: 'viewport' })
  })

  it('مستطيل بلا مساحة = offscreen لا إطار على صفر', () => {
    rectOf(btn, { x: 0, y: 0, w: 0, h: 0 })
    expect(sightOf(btn, opts(() => btn))).toEqual({ state: 'offscreen', why: 'empty' })
  })

  it('سلف بلا overflow مُعلن لا يقصّ — قيمة فارغة ليست قصًّا', () => {
    document.body.innerHTML = '<div><button id="b3">x</button></div>'
    const b3 = document.getElementById('b3')!
    rectOf(b3, { x: 700, y: 700, w: 80, h: 30 })
    expect(sightOf(b3, opts(() => b3)).state).toBe('visible')
  })

  it('مقصوص بحاوية تمرير لا يبقى منه شيء = offscreen', () => {
    document.body.innerHTML = '<div id="s" style="overflow:auto"><button id="b2">x</button></div>'
    const s = document.getElementById('s')!
    const b2 = document.getElementById('b2')!
    rectOf(s, { x: 0, y: 0, w: 300, h: 200 })
    rectOf(b2, { x: 10, y: 500, w: 80, h: 30 })
    expect(sightOf(b2, opts(() => b2))).toEqual({ state: 'offscreen', why: 'clipped' })
  })
})

describe('sideOf — جهة الزر في الشاشة', () => {
  it('يسار الشاشة', () => expect(sideOf({ x: 20, y: 380, w: 80, h: 30 }, vp)).toBe('left'))
  it('يمين الشاشة', () => expect(sideOf({ x: 900, y: 380, w: 80, h: 30 }, vp)).toBe('right'))
  it('أعلى الشاشة', () => expect(sideOf({ x: 460, y: 10, w: 80, h: 30 }, vp)).toBe('top'))
  it('أسفل الشاشة', () => expect(sideOf({ x: 460, y: 760, w: 80, h: 30 }, vp)).toBe('bottom'))
  it('الوسط', () => expect(sideOf({ x: 460, y: 380, w: 80, h: 30 }, vp)).toBe('center'))
})

describe('coverKind — نوع ما يغطي الزر', () => {
  it('نافذة', () => expect(coverKind(modal.querySelector('p')!)).toBe('dialog'))
  it('قائمة', () => {
    document.body.innerHTML = '<ul role="listbox"><li>أ</li></ul>'
    expect(coverKind(document.querySelector('li')!)).toBe('menu')
  })
  it('شريط ثابت عريض', () => {
    document.body.innerHTML = '<header style="position:fixed"><span>شعار</span></header>'
    const h = document.querySelector('header')!
    rectOf(h, { x: 0, y: 0, w: 1000, h: 60 })
    expect(coverKind(h.querySelector('span')!, vp)).toBe('bar')
  })
  it('غير ذلك', () => expect(coverKind(btn)).toBe('other'))
})
