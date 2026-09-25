/**
 * i18n الديسكتوب (I18N-01) — النمط الموحّد نفسه: قاموسان بنفس المفاتيح
 * وقبوع على العربي. النص العربي يبقى في وسم index.html افتراضيًّا (أمان
 * بلا JS وبقاء بوّابة الودجة)، وapplyLocale يستبدل النصوص والتلميحات
 * وعناوين النوافذ عند الإقلاع والتبديل. الأرقام شرقية عربيًّا ولاتينية
 * إنجليزيًّا (الاسم القديم arDigits باقٍ لمواضعه).
 */

export type Locale = 'ar' | 'en'
export const LOCALE_KEY = 'dalili:locale'

export const ar = {
  'dt.title': 'إتقان',
  'dt.popTitle': 'إتقان — التحكّم',
  'dt.capture': 'التقاط',
  'dt.captureVoice': 'التقاط مع تعليق صوتي',
  'dt.menuCap': 'اختر كيف تريد أن يبدأ التوثيق',
  'dt.startCapture': 'ابدأ الالتقاط',
  'dt.startVoice': 'ابدأ مع تعليق صوتي',
  'dt.trainTag': 'أول جولتين ثم تنطوي',
  'dt.finishT': 'إنهاء وشِحْن الدليل',
  'dt.finishA': 'إنهاء وشحن الدليل',
  'dt.cancelRec': 'إلغاء التسجيل',
  'dt.pauseT': 'إيقاف مؤقت',
  'dt.pauseA': 'إيقاف مؤقت أو متابعة',
  'dt.mic': 'تعليق صوتي',
  'dt.micLive': 'تعليق صوتي · يسجّل',
  'dt.clickResume': 'انقر للمتابعة',
  'dt.pausedChip': 'موقوف مؤقتًا — نقراتك لا تُصوَّر',
  'dt.confirmTitle': 'إلغاء التسجيل؟',
  'dt.confirmPre': 'سيُحذف كل شيء: ',
  'dt.confirmSuf': ' ولم يُشحن شيء بعد.',
  'dt.confirmYes': 'نعم، احذف الكل',
  'dt.confirmNo': 'متابعة التسجيل',
  'dt.building': ' جارٍ بناء الدليل…',
  'dt.toastTitle': 'وصل الدليل إلى مساحتك',
  'dt.stepN': 'الخطوة {n}',
  'dt.stepsN': '{n} خطوات',
  'dt.voiceTag': 'تعليق صوتي',
  'dt.undo': 'تراجع',
  'dt.settings': 'الإعدادات',
  'dt.language': 'اللغة',
  'dt.link': 'الربط',
  'dt.exit': 'إنهاء التطبيق',
  'dt.account': 'الحساب',
  'dt.paired': 'مربوط',
  'dt.pairing': 'بانتظار الموافقة',
  'dt.notLinked': 'غير مربوط',
  'dt.acctUnknown': 'جارٍ قراءة حالة الربط…',
  'dt.acctUnpaired': 'اربط هذا الجهاز بحسابك كي تُشحن الأدلّة التي توثّقها إلى مساحتك تلقائيًّا.',
  'dt.pairNow': 'ربط هذا الجهاز',
  'dt.acctPairing': 'أكّد هذا الرمز من حسابك:',
  'dt.pairHint': 'الصفحة تفتح حسابك على الموقع — والرمز يتجدّد تلقائيًّا إن تأخّرت.',
  'dt.openVerify': 'فتح صفحة الموافقة',
  'dt.cancel': 'إلغاء',
  'dt.acctPaired': 'الأدلّة تُشحن إلى مساحتك تلقائيًّا وتُفتح في الويب.',
  'dt.forget': 'فك الربط',
  'dt.noSession': 'لا جلسة التقاط جارية',
  'dt.autoMemoOff': 'أُوقف التعليق التلقائي — زر الميك يسجّل يدويًا',
  'dt.needStep': 'التقط خطوة أولًا ثم علّق عليها بصوتك',
  'dt.memoAlready': 'تسجيل تعليق جارٍ بالفعل — أوقفه أولًا',
  'dt.memoStartFail': 'تعذر فتح الميكروفون — علّق على الخطوة بعد منح الإذن',
  'dt.memoUnsupported': 'متصفحك لا يدعم تسجيل webm/opus — التعليق الصوتي غير متاح',
  'dt.memoNoSession': 'لا تسجيل تعليق جارٍ',
  'dt.memoFail': 'فشل تسجيل التعليق — جرّب من جديد',
  'dt.memoSilent': 'لم يُسجَّل صوت — تأكد أن الميكروفون ليس صامتًا ثم أعد المحاولة',
  'dt.winProtected': 'نافذة محميّة',
  'dt.winElevated': 'نافذة مرفوعة الصلاحيّة',
  'dt.captureFail': 'تعذّر الالتقاط',
  'dt.burnFail': 'تعذّر حرق الحقل الحسّاس — أُسقِطت اللقطة حمايةً للسرّ',
  'dt.deviceName': 'جهاز ويندوز — إتقان',
} as const

export type TKey = keyof typeof ar

export const en: Record<TKey, string> = {
  'dt.title': 'ITQAN',
  'dt.popTitle': 'ITQAN — Control',
  'dt.capture': 'Capture',
  'dt.captureVoice': 'Capture with voice-over',
  'dt.menuCap': 'Choose how documentation starts',
  'dt.startCapture': 'Start capture',
  'dt.startVoice': 'Start with voice-over',
  'dt.trainTag': 'First two runs, then it folds',
  'dt.finishT': 'Finish and ship the guide',
  'dt.finishA': 'Finish and ship the guide',
  'dt.cancelRec': 'Cancel recording',
  'dt.pauseT': 'Pause',
  'dt.pauseA': 'Pause or resume',
  'dt.mic': 'Voice-over',
  'dt.micLive': 'Voice-over · recording',
  'dt.clickResume': 'Click to resume',
  'dt.pausedChip': 'Paused — your clicks are not captured',
  'dt.confirmTitle': 'Cancel recording?',
  'dt.confirmPre': 'Everything will be deleted: ',
  'dt.confirmSuf': ' — nothing has been shipped yet.',
  'dt.confirmYes': 'Yes, delete all',
  'dt.confirmNo': 'Keep recording',
  'dt.building': ' Building the guide…',
  'dt.toastTitle': 'Your guide reached your workspace',
  'dt.stepN': 'Step {n}',
  'dt.stepsN': '{n} steps',
  'dt.voiceTag': 'Voice-over',
  'dt.undo': 'Undo',
  'dt.settings': 'Settings',
  'dt.language': 'Language',
  'dt.link': 'Link',
  'dt.exit': 'Quit app',
  'dt.account': 'Account',
  'dt.paired': 'Linked',
  'dt.pairing': 'Awaiting approval',
  'dt.notLinked': 'Not linked',
  'dt.acctUnknown': 'Reading link status…',
  'dt.acctUnpaired': 'Link this device to your account so the guides you document ship to your workspace automatically.',
  'dt.pairNow': 'Link this device',
  'dt.acctPairing': 'Confirm this code from your account:',
  'dt.pairHint': 'The page opens your account on the site — the code refreshes by itself if you take long.',
  'dt.openVerify': 'Open approval page',
  'dt.cancel': 'Cancel',
  'dt.acctPaired': 'Your guides ship to your workspace automatically and open on the web.',
  'dt.forget': 'Unlink',
  'dt.noSession': 'No capture session is running',
  'dt.autoMemoOff': 'Auto voice-over stopped — the mic button records manually',
  'dt.needStep': 'Capture a step first, then comment on it with your voice',
  'dt.memoAlready': 'A voice-over is already recording — stop it first',
  'dt.memoStartFail': 'Could not open the microphone — comment on the step after granting permission',
  'dt.memoUnsupported': 'Your browser does not support webm/opus recording — voice-over is unavailable',
  'dt.memoNoSession': 'No voice-over recording in progress',
  'dt.memoFail': 'Voice-over recording failed — try again',
  'dt.memoSilent': 'No audio was recorded — make sure the microphone is not muted, then try again',
  'dt.winProtected': 'Protected window',
  'dt.winElevated': 'Elevated-privilege window',
  'dt.captureFail': 'Capture failed',
  'dt.burnFail': 'Could not redact the sensitive field — the screenshot was dropped to protect the secret',
  'dt.deviceName': 'Windows device — ITQAN',
}

const DICTS: Record<Locale, Record<TKey, string>> = { ar, en }

let current: Locale = 'ar'
const listeners = new Set<() => void>()

/** تعيين قاموس العرض بلا مساس DOM — للاختبارات والمسارات النقيّة */
export function setI18nLocale(locale: Locale): void {
  current = locale
}

export function i18nLocale(): Locale {
  return current
}

/** استرجاع نص مترجم مع استبدال {متغير} — غياب المفتاح الإنجليزي يقبع على العربي */
export function t(key: TKey, vars?: Record<string, string | number>): string {
  let s: string = (current === 'en' ? en[key] : undefined) ?? ar[key]
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      s = s.replaceAll(`{${k}}`, String(v))
    }
  }
  return s
}

const EASTERN = '٠١٢٣٤٥٦٧٨٩'

/** رقم بوعي اللغة: شرقي عربيًّا ولاتيني إنجليزيًّا */
export function arDigits(n: number): string {
  const s = String(n)
  if (current === 'en') return s
  return s.replace(/\d/g, (d) => EASTERN.charAt(Number(d)))
}

export function readLocale(): Locale {
  try {
    return localStorage.getItem(LOCALE_KEY) === 'en' ? 'en' : 'ar'
  } catch {
    return 'ar'
  }
}

export function subscribeLocale(fn: () => void): () => void {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}

/** آخر عقدة نصّية غير فارغة — نصّ الزرّ بعد أيقوناته */
function lastTextSlot(el: HTMLElement, text: string): void {
  let tn: ChildNode | null = null
  for (const n of Array.from(el.childNodes)) {
    if (n.nodeType === Node.TEXT_NODE && n.textContent && n.textContent.trim().length > 0) tn = n
  }
  if (tn) tn.textContent = text
  else el.appendChild(document.createTextNode(text))
}

/** [المحدِّد، المفتاح، الكتابة: نصّ كامل | آخر عقدة نصّية] — الثوابت من مرجع الودجة */
const TEXT_SLOTS: Array<[string, TKey, 'text' | 'last']> = [
  ['#menuStart #btnCap b', 'dt.capture', 'text'],
  ['#menuStart #btnCapV', 'dt.captureVoice', 'last'],
  ['#menuStart .menu-cap', 'dt.menuCap', 'text'],
  ['#pillzBox .train-tag', 'dt.trainTag', 'text'],
  ['#pillzBox #btnPillz b', 'dt.startCapture', 'text'],
  ['#pillzBox #btnPillzV', 'dt.startVoice', 'last'],
  ['#chipPaused .ctxt', 'dt.pausedChip', 'text'],
  ['#confirmBox h4', 'dt.confirmTitle', 'text'],
  ['#confirmBox #btnYes', 'dt.confirmYes', 'text'],
  ['#confirmBox #btnNo', 'dt.confirmNo', 'text'],
  ['#buildBox .bt', 'dt.building', 'last'],
  ['#toastBox .tt', 'dt.toastTitle', 'text'],
  ['#flashBox #btnUndo', 'dt.undo', 'text'],
  ['#flashBox #flashVoice', 'dt.voiceTag', 'last'],
  ['#settingsBox #rowLink', 'dt.link', 'last'],
  ['#settingsBox #rowLocale', 'dt.language', 'last'],
  ['#settingsBox #rowExit', 'dt.exit', 'last'],
  ['#accountBox h3', 'dt.account', 'text'],
  ['#accountBox [data-show="unknown"]', 'dt.acctUnknown', 'text'],
  // حالتا الاقتران فيهما أزرار بعد النصّ — آخر عقدة نصّية هي الجملة وحدها
  ['#accountBox [data-show="unpaired"]', 'dt.acctUnpaired', 'last'],
  ['#accountBox #btnPair b', 'dt.pairNow', 'text'],
  ['#accountBox [data-show="pairing"]', 'dt.acctPairing', 'last'],
  ['#accountBox .hint', 'dt.pairHint', 'text'],
  ['#accountBox #btnOpenVerify', 'dt.openVerify', 'last'],
  ['#accountBox #btnCancelPair', 'dt.cancel', 'text'],
  ['#accountBox [data-show="paired"] .prow span:last-child', 'dt.acctPaired', 'last'],
  ['#accountBox #btnForget', 'dt.forget', 'text'],
]

/** [المحدِّد، السمة، المفتاح] — تلميحات ويندوز الأصلية وأصناف الوصول */
const ATTR_SLOTS: Array<[string, 'title' | 'aria-label', TKey]> = [
  ['#menuStart #menuGear', 'title', 'dt.settings'],
  ['#menuStart #menuGear', 'aria-label', 'dt.settings'],
  ['#pillzBox #pillzGear', 'title', 'dt.settings'],
  ['#pillzBox #pillzGear', 'aria-label', 'dt.settings'],
  ['#strip #stripFinish', 'title', 'dt.finishT'],
  ['#strip #stripFinish', 'aria-label', 'dt.finishA'],
  ['#strip #stripCancel', 'title', 'dt.cancelRec'],
  ['#strip #stripCancel', 'aria-label', 'dt.cancelRec'],
  ['#strip #stripPause', 'title', 'dt.pauseT'],
  ['#strip #stripPause', 'aria-label', 'dt.pauseA'],
  ['#strip #stripMic', 'title', 'dt.mic'],
  ['#strip #stripMic', 'aria-label', 'dt.mic'],
  ['#chipPaused', 'title', 'dt.clickResume'],
]

/** تطبيق اللغة على الوثيقة: الاتجاه والعنوان والنصوص والتلميحات — بلا كتابة */
export function applyLocale(locale: Locale): void {
  current = locale
  const html = document.documentElement
  html.lang = locale
  html.dir = locale === 'en' ? 'ltr' : 'rtl'
  document.title = t('dt.title')
  // الخطّ: اللاتيني أولًا إنجليزيًّا (نفس عائلة Plex) — والعربي على النمط المقيَّس
  document.body.style.fontFamily =
    locale === 'en' ? "'IBM Plex Sans', 'IBM Plex Sans Arabic', 'Segoe UI', Tahoma, sans-serif" : ''
  for (const [sel, key, mode] of TEXT_SLOTS) {
    const el = document.querySelector<HTMLElement>(sel)
    if (!el) continue
    if (mode === 'text') el.textContent = t(key)
    else lastTextSlot(el, t(key))
  }
  // تأكيد الإلغاء: نصّان حول العدد العريض — بلا مساس بعقدة <b>
  const confirmP = document.querySelector<HTMLElement>('#confirmBox p')
  if (confirmP) {
    const nodes = Array.from(confirmP.childNodes).filter(
      (n) => n.nodeType === Node.TEXT_NODE && n.textContent && n.textContent.trim().length > 0,
    )
    if (nodes[0]) nodes[0].textContent = t('dt.confirmPre')
    if (nodes[1]) nodes[1].textContent = t('dt.confirmSuf')
  }
  for (const [sel, attr, key] of ATTR_SLOTS) {
    document.querySelector<HTMLElement>(sel)?.setAttribute(attr, t(key))
  }
  // اسم اللغة يظهر بلغته دائمًا (معيار عالمي)
  const ls = document.getElementById('localeState')
  if (ls) ls.textContent = locale === 'en' ? 'English' : 'العربية'
  for (const fn of listeners) fn()
}

/** حفظ الاختيار وتطبيقه — التبديل من صفّ اللغة في الإعدادات */
export function setLocale(locale: Locale): void {
  try {
    localStorage.setItem(LOCALE_KEY, locale)
  } catch {
    // التخزين مرفوض — التطبيق الفوري يكفي لهذه الجلسة
  }
  applyLocale(locale)
}
