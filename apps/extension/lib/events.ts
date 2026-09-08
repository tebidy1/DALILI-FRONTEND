import { isSensitiveField } from '@dalili/core'
import type { CaptureEvent } from './protocol'
import { anchorOf } from './anchor-of'
import { visibleRepresentative } from './gesture'

/** استخراج الأحداث من DOM — أفضل جهد، لا selectors هشة */

export function extractLabel(el: Element): string | undefined {
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) {
    if (el.labels && el.labels.length > 0) {
      // innerText غائب في بعض البيئات (jsdom) — textContent بديل يذوب فرقه في التطبيع
      const raw = el.labels[0]!.innerText ?? el.labels[0]!.textContent ?? ''
      const t = raw.replace(/\s+/g, ' ').trim()
      if (t) return t
    }
    const aria = el.getAttribute('aria-label')
    if (aria?.trim()) return aria.trim()
    const labelledBy = el.getAttribute('aria-labelledby')
    if (labelledBy) {
      const ref = document.getElementById(labelledBy)
      const t = ref instanceof HTMLElement ? (ref.innerText ?? ref.textContent ?? '').replace(/\s+/g, ' ').trim() : ''
      if (t) return t
    }
    const ph = el.getAttribute('placeholder')
    if (ph?.trim()) return ph.trim()
    if (el.name) return el.name
    return undefined
  }
  const aria = el.getAttribute('aria-label')
  if (aria?.trim()) return aria.trim()
  const title = el.getAttribute('title')
  return title?.trim() || undefined
}

export function extractText(el: Element): string | undefined {
  if (el instanceof HTMLInputElement) {
    if (el.type === 'submit' || el.type === 'button') return el.value || undefined
    return undefined
  }
  // innerText غائب في بعض البيئات (jsdom) — textContent بديل يذوب فرقه في التطبيع
  const own = (el instanceof HTMLElement ? (el.innerText ?? el.textContent ?? '') : '').replace(/\s+/g, ' ').trim()
  if (!own) return undefined
  return own.length > 80 ? own.slice(0, 79) + '…' : own
}

function roleOf(el: Element): string {
  const role = el.getAttribute('role')
  if (role) return role
  const tag = el.tagName.toLowerCase()
  if (tag === 'a') return 'link'
  if (tag === 'button' || tag === 'summary') return 'button'
  return tag
}

function hintsOf(el: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement) {
  return {
    type: el instanceof HTMLInputElement ? el.type : undefined,
    name: el.name || undefined,
    id: el.id || undefined,
    autocomplete: el.getAttribute('autocomplete') || undefined,
    placeholder: el.getAttribute('placeholder') || undefined,
  }
}

export function viewportRect(el: Element): { x: number; y: number; w: number; h: number } {
  const r = el.getBoundingClientRect()
  return { x: r.x, y: r.y, w: r.width, h: r.height }
}

/**
 * الحقل الأصلي (checkbox/radio) كثيرًا ما يكون مخفيًّا بصريًا بمستطيل ضامر مثل
 * {-2,-2,2,2} وعليه معرّف متطاير، بينما المفتاح المرئي شيء آخر يراه المستخدم.
 * علة «الالتقاط في مكان خاطئ» (بلاغ المالك): الإطار كان يُرسم على الحقل المخفيّ
 * فيظهر في زاوية الشاشة.
 *
 * كان البحث هنا **صعودًا في الأسلاف فقط**، فسقط نمط claude.ai حيث المفتاح المرئي
 * **شقيق** لا سلف (بلاغ 2026-09-06). المنطق كله انتقل إلى `gesture.ts` ليخدم
 * الالتقاط والتدريب بقانونٍ واحد؛ وهذا اسمٌ قديم يبقى للمناداة المباشرة (حدث قيمة
 * خارج أي إيماءة) — عناصر الإيماءة تُمرَّر حين تتوفّر فتكون الإشارة الأوثق.
 */
export function visualControl(el: Element, seen: readonly Element[] = []): Element {
  return visibleRepresentative(el, seen)
}

/**
 * يُعيد بناء وجهة الحدث على المفتاح المرئي بعد طيّ الإيماءة: المرساة والمستطيل
 * والدور من العنصر الذي يراه المستخدم ويستطيع المتدرّب نقره، مع الحفاظ على تسمية
 * الحقل الأصلية (وهي مصدر عنوان «فعّل «code»») وقيمته.
 */
export function retargetEvent(ev: CaptureEvent, el: Element): CaptureEvent {
  return {
    ...ev,
    target: {
      ...ev.target,
      text: extractText(el) ?? ev.target.text,
      label: ev.target.label ?? extractLabel(el),
      role: roleOf(el),
      anchor: anchorOf(el),
    },
    rect: viewportRect(el),
  }
}

export function buildClickEvent(el: Element, url: string, pageTitle: string, dpr: number): CaptureEvent {
  // rect يُلتقط لكل نقرة لتعليم الزر داخل اللقطة (لا يكشف قيمة — موضعًا فقط).
  // AUTO-01: بطاقة تعريف الزر تُلتقط مع النقرة — عليها يقف توهج «دربني» لاحقًا.
  return {
    kind: 'click',
    target: { text: extractText(el), role: roleOf(el), label: extractLabel(el), anchor: anchorOf(el) },
    sensitive: false,
    url,
    pageTitle,
    ts: Date.now(),
    dpr,
    rect: viewportRect(el),
  }
}

/**
 * علة التعليم المتكررة: النقرة تعيد ترتيب الصفحة (تفعيل بند/توسّع قسم) فمستطيل
 * لحظة النقر يقادم قبل captureVisibleTab ويسقط الإطار على عنصر مجاور.
 * القياس هنا بعد مهلة استقرار قصيرة — إن بقي العنصر حيًّا أعاد موضعه الجديد،
 * وإن استُبدل (React أعاد بناءه) أعاد null فيستخدم المتصل مستطيل لحظة النقر.
 */
export function rectAfterSettle(
  el: Pick<Element, 'isConnected' | 'getBoundingClientRect'>,
  settleMs: number,
  done: (rect: { x: number; y: number; w: number; h: number } | null) => void,
): void {
  setTimeout(() => {
    if (!el.isConnected) return done(null)
    const r = el.getBoundingClientRect()
    done({ x: r.x, y: r.y, w: r.width, h: r.height })
  }, settleMs)
}

export function buildValueEvent(
  el: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement,
  url: string,
  pageTitle: string,
  dpr: number,
  /** عناصر الإيماءة الجارية — ما ضغطه المستخدم فعلًا، أوثق دليل على المفتاح المرئي */
  seen: readonly Element[] = [],
): CaptureEvent | null {
  const ts = Date.now()
  const label = extractLabel(el)
  // المستطيل لكل حدث قيمة: حساس → يُطمس في اللقطة، عادي → يُعلَّم بإطار
  // (علة: خطوات الكتابة كانت بلا إطار على لقطتها إطلاقًا)
  const rect = viewportRect(el)
  if (el instanceof HTMLSelectElement) {
    const value = el.selectedOptions[0]?.text ?? el.value
    return { kind: 'select', target: { label, anchor: anchorOf(el) }, value, sensitive: false, url, pageTitle, ts, dpr, rect }
  }
  if (el instanceof HTMLInputElement && (el.type === 'checkbox' || el.type === 'radio')) {
    // الحقل مخفيّ غالبًا — نؤشّر ونرسي على المفتاح المرئي (سلفًا كان أو شقيقًا) لا على الحقل الضامر
    const vis = visualControl(el, seen)
    return {
      kind: 'toggle',
      target: { label, text: el.value || undefined, anchor: anchorOf(vis) },
      value: el.checked ? 'on' : 'off',
      sensitive: false,
      url,
      pageTitle,
      ts,
      dpr,
      rect: viewportRect(vis),
    }
  }
  const sensitive = isSensitiveField(hintsOf(el))
  return {
    kind: 'input',
    target: { label, anchor: anchorOf(el) },
    value: sensitive ? undefined : el.value || undefined,
    sensitive,
    url,
    pageTitle,
    ts,
    dpr,
    rect,
  }
}

export function buildNavEvent(url: string, pageTitle: string, dpr: number): CaptureEvent {
  return { kind: 'navigate', target: {}, sensitive: false, url, pageTitle, ts: Date.now(), dpr }
}

/** هل النقرة من داخل شريط التحكم نفسه؟ (أحداث Shadow DOM تظهر المضيف في المسار المركّب)
 *  يشمل مضيف الطبقة DALILI-OVERLAY — شريطها تفاعلي (زر الطمس) فنقراته ليست خطوة */
export function pathIncludesController(e: Event): boolean {
  const path = e.composedPath()
  for (const node of path) {
    if (node instanceof HTMLElement && (node.tagName === 'DALILI-CONTROLLER' || node.tagName === 'DALILI-OVERLAY')) {
      return true
    }
  }
  return false
}
