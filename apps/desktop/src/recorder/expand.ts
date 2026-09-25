/**
 * النوافذ المنبثقة — الفصل النظيف عن الحصاة (طلب المالك 2026-09-19:
 * «الشاشات والتفاعلات منفصلة عن الزرّ الرئيسيّ العائم كما في المرجع»):
 * الحصاة نافذةٌ دائمة ٤٤×٤٤ لا تتحوّل أبدًا، وكلّ بطاقة نافذةٌ منفصلة
 * تُثبَّت فوقها: الحافة اليمنى بتحاذاة حافّة الحصاة اليمنى، وقاعها
 * أعلى رأس الحصاة بفجوة ١٢ منطقيًّا، مع قصٍّ على حدود الشاشة (٨px
 * جانبًا و٥٦px أعلى/أسفل تقارب شريط المهام). كل القيم فيزيائيّة خرجًا
 * ودخولًا — والتحجيم يحدث والنافذة مخفيّة فلا وميض.
 */

/** الحصاة الدائمة — تطابق tauri.conf.json. ‏٤٤×٤٤ الحدّ المريح للنقر. */
export const SQUARE_SIZE = { w: 44, h: 44 } as const

/** فجوة الانبثاق أعلى رأس الحصاة بالمنطقيّ — من المرجع (12px) */
export const GAP_ABOVE = 12

/** مقاسات البطاقات المنبثقة بالمنطقيّ — منسوخة من المرجع مع تسامحات
 *  الخطّ العربيّ المقيّسة حيًّا: القائمة 246×152 (رأس الترس +28 — طلب
 *  المالك: الترس يفتح الإعدادات)، الشريط 48×183 (حشوتاه ‏12 + أزراره
 *  الأربعة ‏152 + الفاصل ‏5 + فجواته الأربع ‏12 + حدّاه ‏2 — والإخفاء
 *  بنقرة الحصاة نفسها بعد الفصل النظيف فلا زرّ ‏✕)، شريحة الإيقاف
 *  224×30، تأكيد الإلغاء 252×150 (Plex يلفّ النصّ سطرين)، البناء
 *  210×60، التوست 224×56، **لحظة الالتقاط 240×172** (لقطة 118 + سطر
 *  «الخطوة/تراجع» بسطر Plex الطويل + حدود وحشوة — 162 قِيسَت حيًّا
 *  فكان سطر القاع مقصوصًا)، **الحبّة الكاملة 340×168** (شارة التدريب
 *  داخل النافذة — كانت تفيض خارجها في المرجع وWDA يمنع الفيض — + رأس
 *  الترس + زران 44/40)، **الإعدادات 246×80** (صفّا mrow من المرجع:
 *  الربط وإنهاء التطبيق)، **الحساب 260×228** (تصميم المالك 2026-09-20:
 *  الحالات الثلاث — غير مربوط/بانتظار الموافقة/مربوط — بمقاسٍ واحد
 *  هادئ). */
export const POPOUT_SIZES = {
  menu: { w: 246, h: 152 },
  strip: { w: 48, h: 183 },
  chip: { w: 224, h: 30 },
  confirm: { w: 252, h: 150 },
  build: { w: 210, h: 60 },
  toast: { w: 224, h: 56 },
  flash: { w: 240, h: 172 },
  pillz: { w: 340, h: 168 },
  settings: { w: 246, h: 114 }, // I18N-01: صفّ اللغة الثالث (٣×٣٤ + هوامش البطاقة)
  account: { w: 260, h: 228 },
} as const

export type PopoutForm = keyof typeof POPOUT_SIZES

/** مستطيل الحصاة الفيزيائيّ — مرجع تثبيت المنبثقة */
export interface AnchorRect {
  left: number
  top: number
  right: number
  bottom: number
}

/** حدود الشاشة الفيزيائيّة للقصّ — من Tauri currentMonitor */
export interface MonitorRect {
  x: number
  y: number
  w: number
  h: number
}

const TASKBAR_SAFE_PX = 56

/** موضع المنبثقة ومقاسها الفيزيائيّ فوق الحصاة: تحاذاة يمنى + فجوة ١٢
 *  أعلى رأس الحصاة + قصّ الحدود. مرجعُ كلّ فتحٍ وتحوّلةِ بطاقةٍ داخل
 *  المنبثقة نفسها. */
export function popoutAbove(
  anchor: AnchorRect,
  size: { w: number; h: number },
  sf: number,
  monitor: MonitorRect | null,
): { x: number; y: number; w: number; h: number } {
  const wP = Math.round(size.w * sf)
  const hP = Math.round(size.h * sf)
  let x = anchor.right - wP
  let y = anchor.top - Math.round(GAP_ABOVE * sf) - hP
  if (monitor) {
    const minX = monitor.x + 8
    const maxX = Math.max(minX, monitor.x + monitor.w - wP - 8)
    if (x > maxX) x = maxX
    if (x < minX) x = minX
    const minY = monitor.y + TASKBAR_SAFE_PX
    const maxY = Math.max(monitor.y, monitor.y + monitor.h - hP - TASKBAR_SAFE_PX)
    if (y < minY) y = minY
    if (y > maxY) y = maxY
  }
  return { x, y, w: wP, h: hP }
}
