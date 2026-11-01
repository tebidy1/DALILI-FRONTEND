import { buildAnchorChain, anchorNormText, isEphemeralId, type AnchorChain, type AnchorElInfo } from '@dalili/core'

/** استخراج بطاقة تعريف العنصر من DOM الحقيقي — الاستخراج هنا والحل النقي في core.
 *  سكربت المحتوى يستعمل الدالتين نفسهما وقت الالتقاط ووقت التدريب فلا انزياح. */

/** نص مطابقة المرساة: نص العنصر المرئي (أو value لأزرار الإدخال) — نفس منطق extractText.
 *  innerText بلا تعويض في بعض البيئات — textContent بديل يذوب فرقه في التطبيع */
export function anchorTextOf(el: Element): string {
  if (el instanceof HTMLInputElement) {
    if (el.type === 'submit' || el.type === 'button') return el.value ?? ''
    return ''
  }
  if (!(el instanceof HTMLElement)) return ''
  return el.innerText ?? el.textContent ?? ''
}

const clean = (s: string | null | undefined): string => (s ?? '').replace(/\s+/g, ' ').trim()
/** حدّ نص السياق — عنوان لا فقرة */
const CTX_CAP = 60

/**
 * ث١: تسمية العنصر المرئية — تؤكّد هوية الحقل وقت التدريب (الحقول بلا نص).
 * aria-labelledby ← label[for] ← label المغلِّف ← رأس عمود الجدول للخلية.
 */
export function labelOf(el: Element): string {
  const by = el.getAttribute('aria-labelledby')
  if (by) {
    const txt = clean(by.split(/\s+/).map((id) => el.ownerDocument.getElementById(id)?.textContent ?? '').join(' '))
    if (txt) return txt
  }
  const id = el.getAttribute('id')
  if (id) {
    const lab = el.ownerDocument.querySelector(`label[for="${CSS.escape(id)}"]`)
    if (lab) return clean(lab.textContent)
  }
  const wrap = el.closest('label')
  if (wrap) {
    // نص التسمية وحده، بلا قيم الحقول التي بداخلها
    const own = clean(Array.from(wrap.childNodes).filter((n) => n.nodeType === Node.TEXT_NODE).map((n) => n.textContent).join(' '))
    if (own) return own
  }
  const cell = el.closest('td')
  const table = cell?.closest('table')
  if (cell && table) {
    const col = Array.from(cell.parentElement!.children).indexOf(cell)
    const th = table.querySelector('thead tr')?.children[col]
    if (th) return clean(th.textContent)
  }
  return ''
}

/**
 * ث١: سياق العنصر — عنوان أقرب نافذة وحده. الزر نفسه في نافذة أخرى ليس هدف الخطوة.
 * عنوان النموذج خارج النوافذ مستبعد: في أودو هو اسم السجل (INV/2026/0003) فيتغيّر بين السجلات
 * والزر صحيح (مراجعة C1).
 */
export function ctxOf(el: Element): string {
  const dialog = el.closest('[role="dialog"], dialog, .modal')
  if (!dialog) return ''
  const txt = clean(dialog.querySelector('[role="heading"], .modal-title, h1, h2, h3, h4')?.textContent)
  return txt.length > CTX_CAP ? txt.slice(0, CTX_CAP) : txt
}

/** فهرس العنصر بين أشقاء نوعه نفسه (nth-of-type) — 1-based */
function nthOfType(el: Element): number {
  const parent = el.parentElement
  if (!parent) return 1
  let n = 1
  for (const sib of Array.from(parent.children)) {
    if (sib === el) return n
    if (sib.tagName === el.tagName) n++
  }
  return n
}

/** مسار nth-of-type من أقرب سلف ذي id (شكل سمة آمن) أو من body — سقف ٨ مستويات */
function cssPath(el: Element, maxDepth = 8): string {
  const parts: string[] = []
  let cur: Element | null = el
  for (let depth = 0; cur && depth < maxDepth; depth++) {
    const tag = cur.tagName.toLowerCase()
    if (tag === 'body' || tag === 'html') {
      parts.unshift('body')
      return parts.join(' > ')
    }
    // سلف بمعرّف مستقرّ = مرساة مسار قصيرة صادقة؛ المعرّف المتطاير (React useId) يُتجاوز
    // فيواصل المسار بنيويًا (nth-of-type) بدل تثبيتٍ على معرّفٍ يتغيّر كل تحميل.
    const id = cur.getAttribute('id')
    if (id && id.trim() && !isEphemeralId(id)) {
      parts.unshift(`[id="${id.trim()}"]`)
      return parts.join(' > ')
    }
    parts.unshift(`${tag}:nth-of-type(${nthOfType(cur)})`)
    cur = cur.parentElement
  }
  return parts.join(' > ')
}

const SCOPE_MAX_DEPTH = 6

/**
 * مرساة نطاقٍ دلالي لعنصرٍ بلا ملامح: `[name="عمود"] وسم` من أقرب سلفٍ يحمل name أو data-testid.
 * بلاغ أودو (2026-10-31): حقل الصف المحرَّر لا id له ولا name، فكانت مرساته الوحيدة مسارًا يحمل
 * رقم الصف (`tr:nth-of-type(2)`) — وهو يتغيّر في كل أمر بيع، فينكسر التدريب على «أدخل…».
 * اسم العمود ثابت، والصفوف غير المحرَّرة لا حقل فيها أصلًا، فيطابق حقل الصف الجاري وحده.
 */
function scopedPath(el: Element): string | undefined {
  let cur = el.parentElement
  for (let depth = 0; cur && depth < SCOPE_MAX_DEPTH; depth++) {
    const tag = cur.tagName.toLowerCase()
    if (tag === 'body' || tag === 'html') return undefined
    for (const attr of ['name', 'data-testid'] as const) {
      const v = cur.getAttribute(attr)?.trim()
      if (v) return `[${attr}="${v.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"] ${el.tagName.toLowerCase()}`
    }
    cur = cur.parentElement
  }
  return undefined
}

/** بطاقة تعريف عنصر تفاعلي — undefined إن لم ينتج أي مرشح (لا يحدث لعارض DOM حي غالبًا) */
export function anchorOf(el: Element): AnchorChain | undefined {
  const info: AnchorElInfo = {
    tag: el.tagName.toLowerCase(),
    id: el.getAttribute('id') ?? undefined,
    testid: el.getAttribute('data-testid') ?? undefined,
    ariaLabel: el.getAttribute('aria-label') ?? undefined,
    name: el.getAttribute('name') ?? undefined,
    text: anchorTextOf(el),
    path: cssPath(el),
    label: labelOf(el),
    ctx: ctxOf(el),
  }
  const chain = buildAnchorChain(info)
  // بلا مرساة دلالية خاصة (السلسلة نص/مسار فقط) ⇐ نطاق العمود قبل المسار الموضعي
  if (chain.every((c) => c.k === 'text' || c.k === 'path')) {
    const scoped = scopedPath(el)
    const at = chain.findIndex((c) => c.k === 'path')
    if (scoped) chain.splice(at < 0 ? chain.length : at, 0, { k: 'path', v: scoped })
  }
  // النص يُطوَّع هنا ليتطابق حرفيًا مع تطبيع الحل داخل core
  return chain.length > 0 ? chain.map((c) => (c.k === 'text' ? { k: 'text' as const, v: anchorNormText(c.v) } : c)) : undefined
}
