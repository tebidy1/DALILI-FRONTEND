/**
 * LIB-05: منطق التحديد المتعدد — نقِي وبلا حالة React حتى يُختبر بترتيب
 * القائمة المعروضة (المدى يتبع ترتيب العرض لا ترتيب النقر).
 */

export interface Selection {
  ids: string[]
  /** آخر بطاقة نُقرت — نقطة انطلاق مدى Shift+Click */
  anchor: string | null
}

export function emptySelection(): Selection {
  return { ids: [], anchor: null }
}

export function isPicked(s: Selection, id: string): boolean {
  return s.ids.includes(id)
}

/** نقر عادي: يضيف/يزيل البطاقة ويجعلها المرصاد الجديد */
export function toggleSelect(s: Selection, id: string): Selection {
  return {
    ids: s.ids.includes(id) ? s.ids.filter((x) => x !== id) : [...s.ids, id],
    anchor: id,
  }
}

/** Shift+Click: يستبدل التحديد بالمدى مرصاد→منقور بترتيب القائمة؛ المرصاد ينتقل للمنقور */
export function rangeSelect(s: Selection, id: string, orderedIds: string[]): Selection {
  const anchor = s.anchor !== null && orderedIds.includes(s.anchor) ? s.anchor : id
  const i = orderedIds.indexOf(anchor)
  const j = orderedIds.indexOf(id)
  if (i === -1 || j === -1) return { ids: [id], anchor: id }
  const [lo, hi] = i < j ? [i, j] : [j, i]
  return { ids: orderedIds.slice(lo, hi + 1), anchor: id }
}

/** كل معروضات الصفحة — قائمة فارغة تفريغ (لا يبقى محدد يتيم) */
export function selectAll(s: Selection, orderedIds: string[]): Selection {
  return { ids: [...orderedIds], anchor: s.anchor }
}
