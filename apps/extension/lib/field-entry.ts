import type { AnchorCandidate } from '@dalili/core'

/**
 * «نقرةٌ للدخول إلى حقل ثم الكتابة فيه» = فعلٌ واحد لا خطوتان.
 *
 * بلاغ أودو (2026-10-31، الدليل lfTTuAZZZa9v): المستخدم ينقر خلية الكمية أو حقل المنتج
 * ثم يكتب، فيُلتقط «انقر على العنصر» ثم «أدخل ٢». النقرة لا تعلّم شيئًا، ومرساتها مسار
 * صفٍّ موضعيّ يتغيّر رقمه في كل أمر بيع — فتنكسر في التدريب وتكسر ما بعدها. يُطوى الاثنان
 * في خطوة الكتابة وحدها: وقت الالتقاط (session.ts) ووقت بناء خطة التدريب للأدلة القديمة (train.ts).
 *
 * الحدّ الضيّق (فخ ٤٥): نقر زرٍّ أو خيارٍ أو رابطٍ فعلٌ له معنى ولا يُطوى في كتابةٍ أبدًا.
 */

export interface EntryEnd {
  kind: string
  role?: string
  url: string
  anchor?: AnchorCandidate[]
  rect?: { x: number; y: number; w: number; h: number }
}

/** أدوار فعلٍ مستقل — ويب (ARIA/الوسم) وديسكتوب (UIA ControlType) بحروفٍ صغيرة */
const ACTION_ROLES = new Set([
  'button', 'a', 'link', 'option', 'menuitem', 'menuitemradio', 'menuitemcheckbox', 'tab',
  'checkbox', 'radio', 'switch', 'summary', 'treeitem', 'select',
  'hyperlink', 'tabitem', 'listitem', 'radiobutton', 'menubaritem', 'splitbutton',
])

/** أقلّ تداخلٍ بين مقاطع المسارين يُثبت البنوّة — مقطعان قد يتطابقان صدفةً */
const MIN_PATH_OVERLAP = 3

function pathOf(anchor: AnchorCandidate[] | undefined): string[] | null {
  const p = anchor?.find((c) => c.k === 'path')?.v
  return p ? p.split('>').map((s) => s.trim()).filter(Boolean) : null
}

/**
 * هل العنصر ذو المسار `outer` سلفٌ (أو هو نفسه) للعنصر ذي المسار `inner`؟ المساران مقصوصان
 * من الورقة صعودًا بأعماق مختلفة، فنحاذي ذيل `outer` على موضعٍ داخل `inner` ونطلب تطابقًا تامًّا.
 */
function pathContains(outer: string[], inner: string[]): boolean {
  for (let d = 0; d < inner.length; d++) {
    const overlap = Math.min(outer.length, inner.length - d)
    if (overlap < MIN_PATH_OVERLAP) break
    let ok = true
    for (let j = 0; j < overlap; j++) {
      if (outer[outer.length - 1 - j] !== inner[inner.length - 1 - d - j]) {
        ok = false
        break
      }
    }
    if (ok) return true
  }
  return false
}

function rectContains(o: EntryEnd['rect'], i: EntryEnd['rect']): boolean {
  if (!o || !i || i.w < 8 || i.h < 8) return false
  const tol = 2
  return i.x >= o.x - tol && i.y >= o.y - tol && i.x + i.w <= o.x + o.w + tol && i.y + i.h <= o.y + o.h + tol
}

export function isFieldEntryClick(click: EntryEnd, next: EntryEnd): boolean {
  if (click.kind !== 'click' || next.kind !== 'input') return false
  if (click.url !== next.url) return false
  if (click.role && ACTION_ROLES.has(click.role.toLowerCase())) return false
  if (click.anchor && next.anchor && JSON.stringify(click.anchor) === JSON.stringify(next.anchor)) return true
  const outer = pathOf(click.anchor)
  const inner = pathOf(next.anchor)
  if (outer && inner && pathContains(outer, inner)) return true
  return rectContains(click.rect, next.rect)
}

const SEMANTIC_KINDS = new Set<AnchorCandidate['k']>(['id', 'testid', 'aria', 'name', 'automationId'])

/**
 * الخلية المنقورة تحمل غالبًا اسم العمود (`name="product_uom_qty"` في أودو) والحقل داخلها
 * لا يحمل إلا مسارًا موضعيًا — نرث الاسم مرساةً دلالية `[name="…"] input` تطابق حقل الصف
 * المحرَّر وحده أيًّا كان رقمه. لا تغيير إن كانت للحقل مرساة دلالية أو لا اسم للنقرة.
 */
export function scopeFromEntryClick(clickAnchor: AnchorCandidate[] | undefined, fieldAnchor: AnchorCandidate[]): AnchorCandidate[] {
  if (fieldAnchor.some((c) => SEMANTIC_KINDS.has(c.k))) return fieldAnchor
  const name = clickAnchor?.find((c) => c.k === 'name')?.v
  const leaf = pathOf(fieldAnchor)?.at(-1)?.match(/^[a-z][a-z0-9-]*/i)?.[0]
  if (!name || !leaf) return fieldAnchor
  const scoped: AnchorCandidate = { k: 'path', v: `[name="${name.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"] ${leaf.toLowerCase()}` }
  return [scoped, ...fieldAnchor].slice(0, 6)
}
