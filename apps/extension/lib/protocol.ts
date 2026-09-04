import type { AnchorCandidate, StepKind } from '@dalili/core'
import type { GuideDto } from '@dalili/shared'

/** رسائل الامتداد — البروتوكول بين content/popup والخلفية */

export interface CaptureRect {
  x: number
  y: number
  w: number
  h: number
}

export interface CaptureEvent {
  kind: StepKind
  target: {
    text?: string
    role?: string
    label?: string
    /** AUTO-01: بطاقة تعريف العنصر — تُلتقط مع كل حدث تفاعلي وتنشر مع الخطوة */
    anchor?: AnchorCandidate[]
  }
  value?: string
  sensitive: boolean
  url: string
  pageTitle: string
  ts: number
  /** مستطيل عنصر حساس بإحداثيات viewport (CSS px) لطمسه في اللقطة */
  rect?: CaptureRect
  dpr: number
  /**
   * CAP-STABLE: ختم لقطة الضغط المسبقة التي تخصّ هذا الحدث بعينه (ts الخاص بها).
   * ربط دقيق ١:١ فلا تُلصَق لقطة ضغطٍ لتفاعلٍ آخر — عند النقرات المتلاحقة قد تبقى
   * لقطة سابقة في الذاكرة، والمطابقة بالختم تمنع خلطها.
   */
  preTs?: number
}

export type CaptureState = 'idle' | 'capturing' | 'paused' | 'saving' | 'draft'

export interface SessionMeta {
  state: CaptureState
  sessionId: string
  startedAt: number
  stepCount: number
  limited?: boolean
  draftReason?: string
  /** تنبيه عابر يظهر في الشريط والنافذة (مثل: إنهاء بلا خطوات) */
  notice?: string
  /** CAP-17: جلسة تُضيف خطواتها لدليل قائم عند النشر (بدل إنشاء دليل جديد) */
  appendTo?: string
  /** موضع إدراج الخطوات في الدليل الهدف — النهاية افتراضيًا */
  insertAt?: number
  /** VOX-06: يسجَّل تعليق صوتي مع هذه الجلسة — مؤشر «ميكروفون ●» في الشريط والنافذة */
  micOn?: boolean
  /** VOX-09 «ميك الخطوة»: تعليق جارٍ الآن — حلقة حمراء فوق معاينة الخطوة ومؤقت بالزر */
  memoLive?: { stepIndex: number; startedAt: number }
}

/**
 * CAP-STABLE: لقطة مسبقة تُلتقط لحظة الضغط (pointerdown/Enter) **قبل** أي تنقّل.
 * علة الإطار المنزاح/الفارغ (30%): النقرة الناقلة تُبدّل الصفحة قبل أن تصل
 * captureVisibleTab المؤجّلة — فالإطار يُرسم فوق صفحة أخرى أو بيضاء. الحل الجذري:
 * نلتقط البكسل ومستطيل العنصر لحظة الضغط (الصفحة ما تزال هي نفسها ومرسومة)،
 * ثم تستعملهما خطوة النقرة بدل التقاط حيّ يسبقه التنقّل.
 */
export interface PreShotMsg {
  ts: number
  url: string
  rect: CaptureRect
  dpr: number
}

/** لقطة مسبقة مخزّنة في الخلفية بانتظار خطوتها — بكسل + مستطيل العنصر + dpr لحظة الضغط */
export interface StoredPreShot {
  ts: number
  url: string
  dataUrl: string
  rect: CaptureRect
  dpr: number
}

export type BgMsg =
  | { t: 'whoami' }
  | { t: 'capture-event'; ev: CaptureEvent }
  /** CAP-STABLE: طلب التقاط مسبق لحظة الضغط قبل التنقّل */
  | { t: 'pre-shot'; pre: PreShotMsg }
  | { t: 'start' }
  | { t: 'start-with-audio' }
  | { t: 'pause' }
  | { t: 'resume' }
  | { t: 'cancel' }
  | { t: 'finish' }
  | { t: 'toggle' }
  | { t: 'delete-step'; index: number }
  /** CAP-13: زر «طمس» في اللوحة الجانبية — تُرحَّل للتبويب النشط لتفعيل/إطفاء وضع سحب الطمس */
  | { t: 'blur-mode'; on: boolean }
  /** CAP-15: زر «إخفاء الشريط» في اللوحة — يطوي/يظهر شريط التسجيل في التبويب النشط */
  | { t: 'toggle-bar-cmd' }
  /** CAP-17: بدء جلسة إضافة على دليل قائم — يصل مُرحَّلًا من صفحة الويب عبر سكربت المحتوى */
  | { t: 'append-capture'; guideId: string; insertAt?: number }
  /** VOX-06: نتيجة إذن الميكروفون من صفحة الإذن القصيرة (لا يُطلب الإذن من content script أبدًا).
   * ‏flow=memo: الإذن طُلب لأجل تعليق خطوة (ميك الخطوة) لا للصوت المستمر */
  | { t: 'mic-result'; granted: boolean; flow?: 'memo' }
  /** VOX-01: مقطع صوت من وثيقة offscreen — b64 + إزاحته عن بدء التسجيل (ms) */
  | { t: 'audio-chunk'; sid: string; idx: number; b64: string; offsetMs: number }
  /** VOX-01: تسجيل offscreen توقف وأفرغ آخر مقطع */
  | { t: 'audio-stopped'; sid: string }
  /** VOX-01: أمر من الخلفية لوثيقة offscreen — بدء/إيقاف/إيقاف مؤقت للتسجيل */
  | { t: 'offscreen-start'; sid: string }
  | { t: 'offscreen-stop'; sid: string }
  | { t: 'offscreen-pause'; sid: string }
  | { t: 'offscreen-resume'; sid: string }
  /** VOX-09 «ميك الخطوة»: بدء تعليق صوتي على آخر خطوة ملتقطة — مقاطع قصيرة تُجمع ولا تبثّ */
  | { t: 'memo-start'; sid: string; memoId: string }
  /** VOX-09: إيقاف التعليق — الرد MemoStopAck بالمقاطع b64 والمدة */
  | { t: 'memo-stop'; sid: string }
  /** VOX-09: زر الميك في اللوحة — تسجيل جارٍ يوقف، وإلا يبدأ على آخر خطوة — الرد MemoToggleAck */
  | { t: 'memo-toggle' }
  /** VOX-09: الميكروفون غير ممنوح بعد — تُفتح صفحة الإذن بمسار flow=memo */
  | { t: 'memo-request' }
  /** VOX-09: حذف شارة التعليق عن خطوة قبل النشر (ندم) */
  | { t: 'memo-delete'; index: number }
  /** دربني: طلب بدء تدريب من الويب (يرحّله سكربت المحتوى) — رمز عام من العارض أو الدليل نفسه من المحرر — الرد TrainAck */
  | { t: 'train-start'; token?: string; guide?: GuideDto }
  /** دربني: تقدّم من تبويب التدريب — done خطوة نجحت، skip تخطٍّ، stop إنهاء */
  | { t: 'train-progress'; result: TrainResult }

/** استجابة بدء جلسة الإضافة إلى الويب (زر «أضف خطوات» في المحرر) */
export interface AppendAck {
  ok: boolean
  errorAr?: string
}

/** VOX-09: رد إيقاف تعليق الخطوة — المقاطع b64 بترتيبها ومدة التعليق بالمللي */
export interface MemoStopAck {
  ok: boolean
  chunks?: string[]
  durationMs?: number
  errorAr?: string
}

/** VOX-09: رد زر الميك في اللوحة (بدء أو إيقاف) */
export interface MemoToggleAck {
  ok: boolean
  /** كان تسجيلًا جارٍ فوُقف */
  stopped?: boolean
  /** بلغ التعليق حده 60ث فأُوقف تلقائيًا */
  capped?: boolean
  stepIndex?: number
  errorAr?: string
}

// ——— دربني (GM-01..03): التدريب داخل الصفحة الهدف ———

/** خطوة تدريب قابلة للتنفيذ — خطوات navigate انتقالات لا أفعال مستخدم فتُستخدم روابطها فقط */
export interface TrainStep {
  id: string
  kind: StepKind
  title: string
  note?: string
  anchor: AnchorCandidate[]
  url: string
}

/** جلسة تدريب قائمة — الخلفية مصدر الحقيقة للفهرس الجاري */
export interface TrainSession {
  /** رمز المشاركة إن بدئ من العارض — بدء المحرر بلا رمز */
  token?: string
  guideId: string
  guideTitle: string
  steps: TrainStep[]
  idx: number
  tabId: number | null
  startedAt: number
}

export type TrainResult = 'done' | 'skip' | 'stop'

/** تقدّم تدريب مجمّع لكل دليل (GM-03) — بلا بيانات أفراد */
export interface TrainStats {
  runs: number
  completed: number
}

export interface TrainAck {
  ok: boolean
  errorAr?: string
}

export type ToTabMsg =
  | { t: 'meta'; meta: SessionMeta }
  /** CAP-13: الخلفية تطلب مستطيلات الطمس اليدوي مقيسة اللحظة — قانون الاستقرار: الإحداثيات تُقاس على تخطيط اللقطة الفعلي.
   *  markTs (اختياري): ختم حدث الخطوة — إن طابق آخر عنصر تفاعلي نُقر/كُتب فيه يعيد سكربت المحتوى مستطيله
   *  الطازج وdpr اللحظي، فيُعلَّم الإطار على موضعه وقت الالتقاط لا موضعه وقت النقر (علة الإطار المنزاح). */
  | { t: 'get-blur-rects'; markTs?: number }
  /** بلاغ «المستطيلان» 2026-09-04: انتهت لقطة الخطوة — حلقة التأشير تُفكّ من الكتم.
   *  بلا هذا الإعلان تنتظر الصفحة مؤقّت أمانٍ أطول، فتغيب الحلقة بلا داعٍ. */
  | { t: 'capture-done' }
  /** CAP-15: اختصار Ctrl+Shift+H أو زر اللوحة يطوي/يظهر شريط التسجيل */
  | { t: 'toggle-bar' }
  /** CAP-13: تفعيل/إطفاء وضع سحب الطمس على الصفحة — أُطلق من زر «طمس» في اللوحة */
  | { t: 'blur-mode'; on: boolean }
  /** دربني: الخطوة الجارية تُعرض في تبويب التدريب (توهج + بطاقة) */
  | { t: 'train-step'; step: TrainStep; idx: number; total: number; guideTitle: string }
  /** دربني: انتهى التدريب أو استُبدل — finished تعرض بطاقة الإنجاز ثم تُفكك الطبقة */
  | { t: 'train-stop'; reason: 'finished' | 'replaced' | 'stopped' }

/** خطوة مخزنة محليًا — البيانات الخفيفة فقط؛ اللقطة (dataURL) تُخزَّن تحت shotKey منفصل */
export interface StoredStep {
  ev: CaptureEvent
  autoBlurred?: boolean
  missingReason?: string
  /** ANNO-02: مستطيل الزر المقصود ببكسل الصورة — يُنشر كـ screenshot.mark */
  mark?: { x: number; y: number; w: number; h: number }
}

/** ملخّص خطوة للوحة الجانبية — عنوان جاهز + علم الحساسية بلا تحميل اللقطة */
export interface StepSummary {
  i: number
  title: string
  sensitive: boolean
  kind: StepKind
  missingReason?: string
  /** مستطيل الزر المقصود ببكسل الصورة — لرسم إطار أحمر فوق لقطة المعاينة */
  mark?: { x: number; y: number; w: number; h: number }
  /** VOX-09: شارة 🎙 بالمدة — قابلة للحذف قبل النشر */
  voice?: { durationMs: number; pending: boolean }
}

export const META_KEY = 'dalili:meta'
export const TRAIN_KEY = 'dalili:train'
export const TRAIN_STATS_KEY = 'dalili:train-stats'
export const stepKey = (sessionId: string, i: number) => `dalili:step:${sessionId}:${i}`
export const shotKey = (sessionId: string, i: number) => `dalili:shot:${sessionId}:${i}`
