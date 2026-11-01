/**
 * ث١ دربني الواثق — هل التحديد ظاهر على الزر فعلًا؟
 *
 * كان التدريب يرسم الدائرة على مستطيل الهدف ويثق بالرسم: الزر قد يكون مغطّى بنافذة أو شريط،
 * أو مقصوصًا داخل حاوية تمرير، أو أعاد النظام بناءه فصار العنصر الممسوك ميتًا. هنا نسأل المتصفح
 * عمّا يظهر فعلًا في نقاط داخل الزر (`elementFromPoint` محقون) — لا التقاط شاشة ولا صور،
 * أجزاء من الألف من الثانية. نقي فوق DOM: كل ما يعتمد على التخطيط يأتي من المستطيلات والنقاط.
 */

/** offscreen: empty = بلا مساحة، clipped = قصّته حاوية تمرير، viewport = خارج منفذ العرض فقط (التمرير يكشفه) */
export type Sight =
  | { state: 'visible' }
  | { state: 'covered'; cover: Element }
  | { state: 'offscreen'; why: 'empty' | 'clipped' | 'viewport' }
  | { state: 'gone' }
export type Side = 'right' | 'left' | 'top' | 'bottom' | 'center'
export type CoverKind = 'dialog' | 'menu' | 'bar' | 'other'

interface Viewport {
  w: number
  h: number
}

/** أقل عدد نقاط على الزر ليُعدّ ظاهرًا (من خمس) */
export const SIGHT_POINTS_MIN = 3
/** موضع النقاط الداخلية من الحواف — بعيدًا عن الحدود حيث تتداخل الظلال والحواف */
const INSET = 0.2
/** عرض الشريط الثابت نسبةً لمنفذ العرض — ما دونه عنصر عائم لا «شريط» */
const BAR_MIN_WIDTH = 0.6
/** قيم overflow التي تقصّ فعلًا — الفارغة و`visible` لا تقصّ */
const CLIPS = new Set(['hidden', 'auto', 'scroll', 'clip'])

interface Box {
  x: number
  y: number
  r: number
  b: number
}

const boxOf = (el: Element): Box => {
  const d = el.getBoundingClientRect()
  return { x: d.left, y: d.top, r: d.left + d.width, b: d.top + d.height }
}

const clip = (a: Box, b: Box): Box => ({ x: Math.max(a.x, b.x), y: Math.max(a.y, b.y), r: Math.min(a.r, b.r), b: Math.min(a.b, b.b) })
const empty = (a: Box) => a.r - a.x <= 0 || a.b - a.y <= 0

/** الجزء الباقي من الزر بعد قصّ كل سلف يقصّ ما يفيض عنه (قبل منفذ العرض) */
function containedBox(el: Element): Box {
  let box = boxOf(el)
  for (let p = el.parentElement; p && !empty(box); p = p.parentElement) {
    const ov = getComputedStyle(p)
    if (CLIPS.has(ov.overflowX) || CLIPS.has(ov.overflowY) || CLIPS.has(ov.overflow)) {
      if (p !== el.ownerDocument.body && p !== el.ownerDocument.documentElement) box = clip(box, boxOf(p))
    }
  }
  return box
}

/** احتواء عابر لحدود Shadow DOM: النقطة على عنصر داخل جذر ظلّ تعيد مضيفه (مراجعة M1) */
function composedContains(outer: Element, inner: Element): boolean {
  for (let n: Node | null = inner; n; n = n.parentNode ?? (n instanceof ShadowRoot ? n.host : null)) if (n === outer) return true
  return false
}

export function sightOf(el: Element, opts: { pointAt: (x: number, y: number) => Element | null; ignore: (n: Element) => boolean; viewport: Viewport }): Sight {
  if (!el.isConnected) return { state: 'gone' }
  if (empty(boxOf(el))) return { state: 'offscreen', why: 'empty' }
  const inside = containedBox(el)
  if (empty(inside)) return { state: 'offscreen', why: 'clipped' }
  const box = clip(inside, { x: 0, y: 0, r: opts.viewport.w, b: opts.viewport.h })
  if (empty(box)) return { state: 'offscreen', why: 'viewport' }
  const w = box.r - box.x
  const h = box.b - box.y
  const points: Array<[number, number]> = [
    [box.x + w / 2, box.y + h / 2],
    [box.x + w * INSET, box.y + h * INSET],
    [box.r - w * INSET, box.y + h * INSET],
    [box.x + w * INSET, box.b - h * INSET],
    [box.r - w * INSET, box.b - h * INSET],
  ]
  let onEl = 0
  let decisive = 0
  const covers = new Map<Element, number>()
  for (const [x, y] of points) {
    const hit = opts.pointAt(x, y)
    // طبقة دربني نفسها (البطاقة والدائرة) لا تحسم شيئًا — موضعها مسؤولية البطاقة
    if (!hit || opts.ignore(hit)) continue
    decisive++
    if (hit === el || el.contains(hit) || composedContains(hit, el)) onEl++
    else covers.set(hit, (covers.get(hit) ?? 0) + 1)
  }
  if (onEl >= Math.min(SIGHT_POINTS_MIN, decisive)) return { state: 'visible' }
  const cover = [...covers.entries()].sort((a, b) => b[1] - a[1])[0]![0]
  return { state: 'covered', cover }
}

/** جهة الزر — المركز في الثلث الأوسط من المحورين = وسط، وإلا المحور الأبعد عن المركز يحسم */
export function sideOf(r: { x: number; y: number; w: number; h: number }, vp: Viewport): Side {
  const dx = (r.x + r.w / 2) / vp.w - 0.5
  const dy = (r.y + r.h / 2) / vp.h - 0.5
  if (Math.abs(dx) < 1 / 6 && Math.abs(dy) < 1 / 6) return 'center'
  if (Math.abs(dx) >= Math.abs(dy)) return dx < 0 ? 'left' : 'right'
  return dy < 0 ? 'top' : 'bottom'
}

/** نوع المغطّي — يختار رسالة البطاقة («أغلق النافذة» / «أغلق القائمة» / «مرّر الصفحة») */
export function coverKind(cover: Element, vp: Viewport = { w: innerWidth, h: innerHeight }): CoverKind {
  if (cover.closest('[role="dialog"], [role="alertdialog"], dialog, .modal')) return 'dialog'
  if (cover.closest('[role="menu"], [role="listbox"], .dropdown-menu, .o-dropdown--menu')) return 'menu'
  for (let p: Element | null = cover; p; p = p.parentElement) {
    const pos = getComputedStyle(p).position
    if ((pos === 'fixed' || pos === 'sticky') && p.getBoundingClientRect().width >= vp.w * BAR_MIN_WIDTH) return 'bar'
  }
  return 'other'
}
