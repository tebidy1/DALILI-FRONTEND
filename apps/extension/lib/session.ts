import type { CaptureEvent, StoredPreShot, StoredStep } from './protocol'

/** منطق الجلسة النقي — بلا chrome.* — قابل للاختبار الكامل */

export const MAX_STEPS = 200
export const CAPTURE_MIN_INTERVAL_MS = 600
export const CAPTURE_DEBOUNCE_MS = 450
/**
 * CAP-STABLE: أقصى عمر للقطة المسبقة قبل أن تُهمل. الضغط ثم النقر يقعان في أجزاء
 * الثانية؛ خمس ثوانٍ سقف كريم يحتضن مهلة الاستقرار والخنق دون أن يلتقط لقطة
 * ضغطٍ قديمة تخصّ تفاعلًا آخر.
 */
export const PRE_SHOT_MAX_AGE_MS = 5000

/**
 * خنق اللقطات: كروم يسمح بـ captureVisibleTab مرتين في الثانية.
 * 'now' = نفّذ فورًا، 'defer' = انتظر انتهاء انشغال المستخدم (كتابة متصلة).
 */
export class CaptureThrottle {
  private lastAt = 0
  constructor(private minMs = CAPTURE_MIN_INTERVAL_MS) {}
  tryAcquire(now = Date.now()): 'now' | 'defer' {
    if (now - this.lastAt >= this.minMs) {
      this.lastAt = now
      return 'now'
    }
    return 'defer'
  }
  /**
   * تسجيل لقطة وقعت فعلًا بلا استئذان — اللقطة المؤجّلة (بعد مهلة الخنق) كانت
   * تُنفَّذ دون تحديث الختم، فتحسب الطلبات التالية فاصلها من لقطةٍ أقدم وتخترق
   * حدّ كروم (٢/ثانية) فتفشل الخطوة وتظهر «فارغة». الختم يتقدّم مع كل لقطة.
   */
  stamp(now = Date.now()): void {
    this.lastAt = now
  }
  /** متى تُقبل اللقطة التالية بلا خرق الحدّ؟ (لإعادة المحاولة بعد رفض الحصة) */
  waitMs(now = Date.now()): number {
    return Math.max(0, this.minMs - (now - this.lastAt))
  }
}

const RESTRICTED_URLS: RegExp[] = [
  /^(chrome|edge|about|brave|vivaldi|opera|librewolf|waterfox|zen):/i,
  /^https?:\/\/(chromewebstore\.google\.com|chrome\.google\.com\/webstore|microsoftedge\.microsoft\.com\/addons)/i,
  /^https?:\/\/(localhost|127\.0\.0\.1):8787\//,
]

export function guardUrl(url: string): { ok: boolean; reason?: string } {
  for (const re of RESTRICTED_URLS) {
    if (re.test(url)) return { ok: false, reason: 'صفحة نظامية أو خادم دليلي نفسه — غير قابلة للالتقاط' }
  }
  return { ok: true }
}

/**
 * سبب عربي صادق لفشل التقاط اللقطة (ق3: لا كذب ولا ابتلاع صامت).
 * الحالات المعروفة من رسائل كروم تُترجم؛ الغامض يُرفق نصه الخام للتشخيص.
 */
export function captureFailReason(err: unknown): string {
  const msg = err instanceof Error ? err.message : typeof err === 'string' ? err : ''
  if (/minimized/i.test(msg)) return 'النافذة كانت مصغّرة لحظة الالتقاط — كبّرها وستُلتقط الخطوات التالية'
  if (/cannot access|permission/i.test(msg)) return 'الامتداد لا يملك صلاحية رؤية هذه الصفحة'
  if (/quota|max_capture/i.test(msg)) return 'تباطؤ مؤقت في الالتقاط — استمر وسيلحق'
  return msg ? `فشل التقاط اللقطة (${msg.slice(0, 60)})` : 'فشل التقاط اللقطة لهذه الصفحة'
}

/**
 * إدخال متصل في نفس الحقل يحل محل الخطوة السابقة (تجربة تانجو:
 * الكتابة كلها خطوة واحدة تتحدث بقيمتها الأخيرة).
 */
export function shouldReplacePrev(prev: StoredStep | undefined, ev: CaptureEvent): boolean {
  if (!prev) return false
  if (prev.ev.kind !== ev.kind) return false
  if (ev.kind !== 'input' && ev.kind !== 'select') return false
  return prev.ev.target.label === ev.target.label && prev.ev.url === ev.url
}

/**
 * بوابة خطوة التنقل: تُقبل فقط من تبويب مرئي وبرابط لم يُبَث من قبل.
 * بدء الالتقاط يبث الحالة إلى كل التبويبات المفتوحة — بلا البوابة يرسل كل
 * تبويب خفي خطوة تنقل لحظة البدء، فيقفز العداد بعدد التبويبات ويبدأ الدليل
 * بصفحات لم يزرها المستخدم. الاستئناف بعد الإيقاف لا يكرر تنقل نفس الصفحة
 * لأن رابطها بُث سابقًا.
 */
export function shouldEmitNav(lastEmittedUrl: string, currentUrl: string, visible: boolean): boolean {
  return visible && currentUrl !== lastEmittedUrl
}

/**
 * كبت تنقّل تبع لتفاعل (علة «لقطات تُلتقط لوحدها بلا تحديد»): نقرة تغيّر الرابط
 * (كسقوط fragment بعد ثوانٍ، أو تحميل صفحة بعد نقرة رابط) تولّد خطوة navigate
 * زائدة بلا مستطيل، فيظهر الدليل شاشاتٍ لم يخترها المالك. القياس على 40 دليلًا
 * حقيقيًا: تبعات التفاعل تقع خلال ≤8.9ث ثم قفزة واضحة إلى ≥18ث للتنقل المقصود —
 * فنافذة 10ث تفصل العنقودين بثقة. أول تنقل بالجلسة يبقى (لا سابق)، وتنقّل بعد
 * تنقّل (إعادة توجيه) خارج النطاق.
 */
export const NAV_AFTER_ACTION_SUPPRESS_MS = 10_000

/** هل هذا الحدث تنقّلٌ تبع لخطوة تفاعلية ضمن نافذة الكبت؟ → يُهمَل كليًا (لا خطوة ولا لقطة) */
export function shouldDropConsequentNav(prev: StoredStep | undefined, ev: CaptureEvent): boolean {
  if (!prev) return false
  if (ev.kind !== 'navigate') return false
  if (prev.ev.kind === 'navigate') return false
  return ev.ts - prev.ev.ts <= NAV_AFTER_ACTION_SUPPRESS_MS
}

/** CAP-13: الطمس المباشر يُعرض أثناء التسجيل الفعلي فقط — لا أثناء الإيقاف المؤقت (معيار القبول ③) */
export function shouldOfferBlur(state: CaptureStateLike): boolean {
  return state === 'capturing'
}

/** أي الخطوات تُعلَّم بإطار على اللقطة: كل من يحمل مستطيلًا غير حساس —
 *  الكتابة والاختيار والتبديل وEnter تُعلَّم كالنقر، والحساسة أولويتها الطمس */
export function shouldMarkStep(ev: Pick<CaptureEvent, 'kind' | 'sensitive' | 'rect'>): boolean {
  return !ev.sensitive && !!ev.rect
}

/**
 * CAP-STABLE: هل تصلح اللقطة المسبقة لهذه الخطوة؟ شرطها أن تكون من **نفس الصفحة**
 * (رابط الحدث لم يتغيّر عن رابط الضغط)، وأن يقع ضغطها **قبل** الحدث لا بعده،
 * وألّا تتقادم. بذا لا تُلصَق لقطة ضغطٍ سابقة بنقرةٍ لا تخصّها.
 */
export function preShotUsable(
  pre: Pick<StoredPreShot, 'ts' | 'url'>,
  ev: Pick<CaptureEvent, 'preTs' | 'url'>,
  now: number,
  maxAgeMs = PRE_SHOT_MAX_AGE_MS,
): boolean {
  if (ev.preTs === undefined) return false // خطوة بلا لقطة ضغط — المسار الحيّ
  if (pre.ts !== ev.preTs) return false // مطابقة الختم ١:١ — لا خلط بين تفاعلين
  if (pre.url !== ev.url) return false // تنقّل بين الضغط والحدث — لا تُلصق صفحة سابقة
  return now - pre.ts <= maxAgeMs
}

/**
 * CAP-STABLE: هل تشارك هذه الخطوةُ لقطةً مسبقةً لا تخصّها بالختم لكنها من **نفس
 * إطار الصفحة**؟ حالتها: خطوة الكتابة (change) تقع قبل نقرة المغادرة مباشرةً،
 * ولقطة تلك النقرة المسبقة تُظهر الحقل بنصّه المكتوب على الصفحة نفسها. فتشاركها
 * صورةً (وترسم الكاتبة إطارها بمستطيل حقلها هي)، فتظهر خطوة كتابةٍ كاملة بلقطةٍ
 * تُبرز النص لا لقطةٍ مفقودة. الشرط: نفس الرابط وغير متقادمة — بلا مطابقة ختم.
 */
export function preShotShareable(
  pre: Pick<StoredPreShot, 'ts' | 'url'>,
  ev: Pick<CaptureEvent, 'url' | 'kind' | 'ts'>,
  now: number,
  maxAgeMs = PRE_SHOT_MAX_AGE_MS,
): boolean {
  /**
   * تشخيص 2026-09-04 (شاشة لا تخصّ خطوتها / «شاشتان من التقاطة واحدة»): الشرط
   * كان «نفس الرابط + غير متقادمة» فحسب، فأي لقطةٍ من الصفحة نفسها تُلصق بأي
   * خطوة. النتيجة: نقرةٌ رفض الخنقُ لقطتَها المسبقة كانت تأخذ **بكسل نقرةٍ
   * سابقة** (اللقطات لا تُحذف بعد الاستعمال) — صورة لا تخصّ الخطوة، وخطوتان
   * بصورة واحدة.
   *
   * الحصر في الكتابة/الاختيار يغلق الباب: هما وحدهما الحالة المقصودة (خطوة
   * تسبق نقرة المغادرة مباشرةً فتشاركها إطارها المُظهِر للنص). أما النقرة فلها
   * مسارها الحيّ، ولا تستعير صورة لحظةٍ أخرى أبدًا.
   *
   * ولا يصحّ شرط ترتيب زمني بديل: قياس حيّ في كروم (2026-09-04) أعطى
   * `pointerdown @…158 → change @…160 → click @…163` — الفارق مليمترّان زمنيًا،
   * فأي مقارنة أختام هنا هشّة تنقلب على الحالة الصحيحة نفسها.
   */
  if (ev.kind !== 'input' && ev.kind !== 'select') return false
  if (pre.url !== ev.url) return false
  return now - pre.ts <= maxAgeMs
}

type CaptureStateLike = string

