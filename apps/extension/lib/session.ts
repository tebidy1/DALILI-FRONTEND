import type { CaptureEvent, StoredPreShot, StoredStep } from './protocol'
import { t } from './i18n'

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
    if (re.test(url)) return { ok: false, reason: t('ext.systemPage') }
  }
  return { ok: true }
}

/**
 * سبب عربي صادق لفشل التقاط اللقطة (ق3: لا كذب ولا ابتلاع صامت).
 * الحالات المعروفة من رسائل كروم تُترجم؛ الغامض يُرفق نصه الخام للتشخيص.
 */
export function captureFailReason(err: unknown): string {
  const msg = err instanceof Error ? err.message : typeof err === 'string' ? err : ''
  if (/minimized/i.test(msg)) return t('ext.shotMinimized')
  if (/cannot access|permission/i.test(msg)) return t('ext.shotNoPermission')
  if (/quota|max_capture/i.test(msg)) return t('ext.shotSlow')
  return msg ? t('ext.shotFailedWith', { msg: msg.slice(0, 60) }) : t('ext.shotFailed')
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
 * نافذة طيّ التفاعل الواحد في الخلفية — حزام ثانٍ خلف نافذة الإيماءة في سكربت
 * المحتوى. قِيست الفوارق الحية بين أحداث الإيماءة الواحدة بـ١-٦٣مث؛ ٧٠٠مث سقفٌ
 * كريم يحتضن مهلة الاستقرار (١٦٠مث) وتأخّر الرسائل، ودونه بكثير أي نقرتين
 * متعمّدتين من إنسان.
 */
export const GESTURE_FOLD_WINDOW_MS = 700

/** أنواع أحداث القيمة التي تمثّل نفس تفاعل النقرة (لا الكتابة — انظر فخ 45) */
const FOLDABLE_VALUE_KINDS = new Set<CaptureEvent['kind']>(['toggle', 'select'])

/** قرار تخزين الحدث الوارد أمام الخطوة السابقة */
export type FoldDecision = 'append' | 'replace' | 'drop'

function sameAnchor(a: CaptureEvent, b: CaptureEvent): boolean {
  const x = a.target.anchor
  const y = b.target.anchor
  if (!x || !y) return false
  return JSON.stringify(x) === JSON.stringify(y)
}

function sameRect(a: CaptureEvent, b: CaptureEvent): boolean {
  if (!a.rect || !b.rect) return false
  return a.rect.x === b.rect.x && a.rect.y === b.rect.y && a.rect.w === b.rect.w && a.rect.h === b.rect.h
}

/**
 * علة «الخطوة تُلتقط مرتين أو ثلاثًا» (بلاغ المالك 2026-09-06): المتصفح يرسل
 * لنقرة تبديلٍ واحدة حتى ثلاثة أحداث خلال مليّثانيات (click على الـlabel، click
 * مُوجَّهًا على الحقل، ثم change). العلاج الجذري في سكربت المحتوى؛ وهذه الشبكة
 * تلتقط ما ينفلت منه (موت العامل بين حدثين، أو حدثان من إطارين).
 *
 * القاعدة ضيّقة عمدًا: **نقرة + حدث قيمة** على العنصر نفسه (مرساةً أو مستطيلًا)
 * وعلى نفس الرابط وخلال النافذة. نقرتان متطابقتان لا تُدمجان أبدًا — تكرار النقر
 * فعل مشروع لا يجوز ابتلاعه. والكتابة لا تُطوى في نقرة (فخ 45).
 */
export function foldWithPrev(prev: StoredStep | undefined, ev: CaptureEvent): FoldDecision {
  if (!prev) return 'append'
  const a = prev.ev
  if (a.url !== ev.url) return 'append'
  if (Math.abs(ev.ts - a.ts) > GESTURE_FOLD_WINDOW_MS) return 'append'
  if (!sameAnchor(a, ev) && !sameRect(a, ev)) return 'append'
  // النقرة الخام تُستبدل بحدث القيمة الأغنى معنًى، وتُهمل إن سبقها هو
  if (a.kind === 'click' && FOLDABLE_VALUE_KINDS.has(ev.kind)) return 'replace'
  if (FOLDABLE_VALUE_KINDS.has(a.kind) && ev.kind === 'click') return 'drop'
  return 'append'
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

// ميتة إنتاجيًّا — تحيا باختبار في blurpick.test (CAP-13)؛ حذفها قرار مالك مع اختبارها.
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

