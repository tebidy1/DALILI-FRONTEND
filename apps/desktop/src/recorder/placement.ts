/**
 * ثبات موضع الودجة (٣هـ-٣) — استرجاع آخر موضع عند الإقلاع وحفظ موضع السحب
 * بخنق (حركة ⇒ حفظٌ مجدول واحد). الحدود محقونة (`WidgetWindow`/`PlacementStore`)
 * وكل قراءة/كتابة محاطة ‏try/catch: التخزين قد يكون غير متاح (نافذة خاصّة/
 * ممسوح) ونداءات النافذة قد تُرفض — فيعمل التطبيق دائمًا، بالموضع المحفوظ
 * أو بوضع الإعداد (center) بلا أيّ أثر جانبيّ. بلا شبكة ولا Rust.
 * والموضع الطبيعي عند غياب حفظ = الركن السفلي الأيمن (طلب المالك ٢٠٢٦-٠٩-١٧).
 */

/** شكل الشاشة كما يعيدها Tauri currentMonitor — محليٌّ لهذا الملف */
export interface MonitorLike {
  position: { x: number; y: number }
  size: { width: number; height: number }
  scaleFactor: number
}

export interface PlacementStore {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

export interface WidgetWindow {
  outerPosition(): Promise<{ x: number; y: number }>
  setPosition(pos: { x: number; y: number }): Promise<void>
  onMoved(handler: (pos: { x: number; y: number }) => void): () => void
}

export const PLACEMENT_KEY = 'itqan.widget.pos'

/** فجوة الحواف بالمنطقيّ — بُعد الودجة نفسها عن يمين الشاشة وأسفلها */
export const EDGE_GAP_PX = 14
/** تقدير ارتفاع شريط مهام ويندوز بالمنطقيّ — currentMonitor يعطي الشاشة
 *  الكاملة لا منطقة العمل، فالأصل فوق الشريط لا تحته (تقدير مقصود) */
export const TASKBAR_HEIGHT_PX = 48

/** موضع الركن السفلي الأيمن — الموضع الطبيعي للودجة. ‏`winPhys` بمقاس
 *  فيزيائيّ (منطقيّ×scaleFactor) والناتج فيزيائيّ جاهز لـsetPosition.
 *  شاشةٌ أضيق من الودجة تُثبَّت على أصلها — لا مواضع تُخرجها عن الشاشة */
export function bottomRightPosition(
  monitor: MonitorLike,
  winPhys: { width: number; height: number },
  opts?: { gapPx?: number; taskbarPx?: number },
): { x: number; y: number } {
  const sf = monitor.scaleFactor
  const gap = Math.round((opts?.gapPx ?? EDGE_GAP_PX) * sf)
  const bottom = Math.round(((opts?.taskbarPx ?? TASKBAR_HEIGHT_PX) + (opts?.gapPx ?? EDGE_GAP_PX)) * sf)
  const x = Math.max(monitor.position.x, monitor.position.x + monitor.size.width - winPhys.width - gap)
  const y = Math.max(monitor.position.y, monitor.position.y + monitor.size.height - winPhys.height - bottom)
  return { x, y }
}

/** استرجاع الموضع المحفوظ — true ⇐ طُبِّق، false ⇐ لا حفظ صالح (وضع الإعداد يبقى) */
export async function restorePlacement(
  win: WidgetWindow,
  store: PlacementStore,
): Promise<boolean> {
  try {
    const raw = store.getItem(PLACEMENT_KEY)
    if (!raw) return false
    // صيغة صارمة "x,y" بعددين صحيحَين (السالب مسموح — شاشة يسار الأصل) —
    // ما عداه تالف يُهمَل فلا parseInt المتسامح يمرّر خربشة
    const m = raw.match(/^\s*(-?\d+)\s*,\s*(-?\d+)\s*$/)
    if (!m) return false
    await win.setPosition({ x: Number.parseInt(m[1]!, 10), y: Number.parseInt(m[2]!, 10) })
    return true
  } catch {
    return false
  }
}

/** تتبّع السحب وحفظ الموضع بخنق: أوّل حركة تجدول حفظًا، وما تلاها ضمن
 *  النافذة يُهمَل — يعيد دالة إيقاف التتبّع */
export function trackPlacement(
  win: WidgetWindow,
  store: PlacementStore,
  schedule: (fn: () => void) => () => void = (fn) => {
    const t = setTimeout(fn, 250)
    return () => clearTimeout(t)
  },
): () => void {
  let pending = false
  const save = async (): Promise<void> => {
    try {
      const p = await win.outerPosition()
      store.setItem(PLACEMENT_KEY, `${p.x},${p.y}`)
    } catch {
      // التخزين أو القراءة غير متاحَيْن الآن — بلا موضع محفوظ ولا ضرر
    }
  }
  return win.onMoved(() => {
    if (pending) return
    pending = true
    schedule(() => {
      pending = false
      void save()
    })
  })
}
