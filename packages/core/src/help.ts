/** هـ ج١ (HLP) «ما هذا؟» — المرساة الآمنة والمطابقة على الشاشة نفسها. نقي تمامًا. */
import { resolveAnchor, type AnchorChain, type AnchorDom } from './anchor'

/** مرساة آمنة للخصوصية: بلا مرشّح ctx (عنوان النافذة قد يحمل اسم عميل أو رقم فاتورة) */
export function safeAnchor(chain: AnchorChain): AnchorChain {
  return chain.filter((c) => c.k !== 'ctx')
}

/** كل ما يُطابَق على الشاشة: مرساته ومفتاح شاشته */
export interface Anchored {
  anchor: AnchorChain
  screenKey: string
}

/**
 * أول عنصر في القائمة على الشاشة نفسها وتحلّ مرساته إلى العنصر المضغوط،
 * أو إلى ما داخله (مرساة الزر حلّت إلى أيقونته)، أو إلى ما يحويه (حلّت إلى شريطه).
 * الاحتواء باتجاهيه يمرَّر من المنادِي لأن النواة لا تعرف شكل العنصر.
 */
export function findByAnchor<T extends Anchored, E>(
  items: T[],
  hereKey: string,
  picked: E,
  dom: AnchorDom<E>,
  contains: (outer: E, inner: E) => boolean,
): T | null {
  for (const item of items) {
    if (item.screenKey !== hereKey) continue
    const hit = resolveAnchor(item.anchor, dom)
    if (!hit) continue
    if (hit.el === picked || contains(picked, hit.el) || contains(hit.el, picked)) return item
  }
  return null
}
