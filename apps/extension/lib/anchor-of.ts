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
  }
  const chain = buildAnchorChain(info)
  // النص يُطوَّع هنا ليتطابق حرفيًا مع تطبيع الحل داخل core
  return chain.length > 0 ? chain.map((c) => (c.k === 'text' ? { k: 'text' as const, v: anchorNormText(c.v) } : c)) : undefined
}
