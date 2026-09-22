/** CAP-13: اختيار هدف الطمس المباشر من سحب المستخدم — نقي وقابل للاختبار */
import { t } from './i18n'

/** رسالة الفشل الصادقة (معيار القبول ④) — الخطوة تبقى قابلة للطمس في المحرر. دالة لا ثابت: تُقرأ باللغة الحية */
export const blurFailNotice = (): string => t('ext.blurDirectFail')

export interface ViewportRect {
  x: number
  y: number
  w: number
  h: number
}

/** هل يغطي a منطقة b (مركز b داخل a)؟ */
export function rectCovers(a: ViewportRect, b: ViewportRect): boolean {
  const cx = b.x + b.w / 2
  const cy = b.y + b.h / 2
  return cx >= a.x && cx <= a.x + a.w && cy >= a.y && cy <= a.y + a.h
}

/** العنصر البنيوي الذي تحتاجه الدالة — بلا اقتران بـDOM كامل */
type Pickable = {
  isConnected: boolean
  tagName: string
  getBoundingClientRect: () => { x: number; y: number; width: number; height: number }
}

const SKIP_TAGS = new Set(['HTML', 'BODY', 'DALILI-OVERLAY'])

/**
 * من عناصر نقطة السحب، يختار هدف الطمس: أصغر عنصر حيّ يغطي مركز منطقة السحب.
 * يتخطى html/body (وإلا طُمست الصفحة كلها) وطبقة دليلي نفسها.
 * لا شيء = السحب على فراغ — لا طمس عشوائي.
 */
export function pickBlurTarget(els: Element[], drag: ViewportRect): Element | undefined {
  let best: { el: Element; area: number } | undefined
  for (const el of els as unknown as Pickable[]) {
    if (!el.isConnected || SKIP_TAGS.has(el.tagName.toUpperCase())) continue
    const r = el.getBoundingClientRect()
    if (r.width <= 0 || r.height <= 0) continue
    if (!rectCovers({ x: r.x, y: r.y, w: r.width, h: r.height }, drag)) continue
    const area = r.width * r.height
    if (!best || area < best.area) best = { el: el as unknown as Element, area }
  }
  return best?.el
}
