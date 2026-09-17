/**
 * توسعة/انكماش الودجة بحالتين (توصية UX الموافق عليها): حبة ٣٢٠×٧٢ وقت
 * الخمول، ولوحة أعلى وقت التسجيل أو الإعدادات. القاعدة الحاكمة: **الحافة
 * العليا ثابتة** — التوسعة تنمو تحت، وإن لم تتّسع تحت الشاشة انزاحت للأعلى
 * كاملًا (بهامش يقارب شريط المهام)؛ والانكماش يبقي الحافة العليا الحالية
 * فما حرّكه المستخدم أثناء التسجيل يبقى موضعه (لا قفزات مفاجئة). كل الحدود
 * محقونة (نافذة/شاشة) وكل فشل مبتلَع بصمت صادق — الوضع السيّئ العاقبة هو
 * أن تبقى الودجة حبتها، لا أن يرمي الخطأ في واجهة العمل.
 * ملاحظة حرِسة للعرض: بعد كل تغيير مقاس يجب تحديث مستطيل استثناء النقرات
 * (ownRect في main.ts) وإلا سُجِّلت نقرات اللوحة الموسَّعة خطواتٍ —
 * هذا تحديثُه على onResized وعقب كل نداء هنا مباشرةً.
 */

/** مقاس الحبة (الخمول) — منطقيّ، مطابق لإعداد النافذة في tauri.conf.json */
export const PILL_SIZE = { width: 320, height: 72 }

/** هامش أسفل الشاشة بالفيزيائيّ يقارب ارتفاع شريط مهام ويندوز — التقدير
 *  مقصود: currentMonitor يعطي الشاشة كاملة لا منطقة العمل */
const TASKBAR_SAFE_PX = 56

/** حدود النافذة المحقونة — المقاسات منطقيّة (LogicalSize) والمواضع فيزيائيّة
 *  (PhysicalPosition) بمواءمة فضاء إحداثيات الخطّاف (عقد ٣ب §٣.٢) */
export interface SizeWindow {
  outerPosition(): Promise<{ x: number; y: number }>
  setSize(size: { width: number; height: number }): Promise<void>
  setPosition(pos: { x: number; y: number }): Promise<void>
}

/** الشاشة الحالية — قيم فيزيائيّة كما يعيد Tauri currentMonitor */
export interface MonitorLike {
  position: { x: number; y: number }
  size: { width: number; height: number }
  scaleFactor: number
}

export function createExpander(
  win: SizeWindow,
  monitor: () => Promise<MonitorLike | null>,
) {
  /** توسعة إلى ارتفاع منطقيّ معيّن — تُثبّت الحافة العليا إن اتّسعت، وإلا
   *  انزاح الوعاء أعلى الشاشة بما يلزم (وليس أكثر). العقد: **النجاح/الفشل
   *  قيمة معلنة** — true ⇐ حُمِّل المقاس، false ⇐ رفضته النافذة (صلاحيّة/
   *  غياب) — كي يُدِرّها المستدعي فورًا (إلغاء جلسة بدأت مثلاً) فلا تبقى
   *  اللوحة موسَّعةً على محتوى لا يليقها */
  async function expandTo(heightLogical: number): Promise<boolean> {
    try {
      const pos = await win.outerPosition()
      const m = await monitor()
      const sf = m?.scaleFactor ?? 1
      const hPhys = Math.round(heightLogical * sf)
      let y = pos.y
      if (m) {
        const maxY = m.position.y + m.size.height - TASKBAR_SAFE_PX - hPhys
        if (y > maxY) y = Math.max(m.position.y, maxY)
      }
      await win.setSize({ width: PILL_SIZE.width, height: heightLogical })
      if (y !== pos.y) await win.setPosition({ x: pos.x, y })
      return true
    } catch {
      return false
    }
  }

  /** انكماش إلى الحبة — الحافة العليا الحالية تبقى كما هي */
  async function collapse(): Promise<boolean> {
    try {
      await win.setSize({ width: PILL_SIZE.width, height: PILL_SIZE.height })
      return true
    } catch {
      return false
    }
  }

  return { expandTo, collapse }
}
