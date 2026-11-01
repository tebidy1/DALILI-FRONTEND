import { z } from 'zod'

/** عقد واجهة API — مصدر الحقيقة الوحيد بين الخادم والامتداد والويب */

export const zRect = z.object({ x: z.number(), y: z.number(), w: z.number(), h: z.number() })
export const zPoint = z.object({ x: z.number(), y: z.number() })

/** ANNO-01: شرح مرسوم على اللقطة — لون + إطار أو طرفا سهم بالإحداثيات الطبيعية.
 * ‏EDT-05 إكمال (2026-09-04): type=text يحمل text إلزاميًا، وtype=draw يحمل path بنقطتين فأكثر */
export const zAnnotation = z
  .object({
    id: z.string().min(1),
    type: z.enum(['rect', 'ellipse', 'oval', 'arrow', 'curved-arrow', 'number', 'text', 'draw']),
    color: z.string().min(1).max(32),
    rect: zRect.optional(),
    from: zPoint.optional(),
    to: zPoint.optional(),
    n: z.number().int().optional(),
    text: z.string().min(1).max(80, 'النص المكتوب 80 حرفًا كحد أقصى').optional(),
    path: z.array(zPoint).max(2_000).optional(),
  })
  .superRefine((a, ctx) => {
    if (a.type === 'text' && !a.text) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'تعليق النص يحتاج نصًا' })
    }
    if (a.type === 'draw' && (!a.path || a.path.length < 2)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'الرسم الحر يحتاج مسارًا بنقطتين فأكثر' })
    }
  })

/** ANNO-02: إطار تعليم الهدف — لونه محصور في لوحة الحبر الخماسية (مطابقة INK_COLORS في core) */
export const zTargetMark = z.object({
  rect: zRect,
  color: z.enum(['#ea580c', '#e11d48', '#2563eb', '#16a34a', '#2b2a26']),
  /** طلب المالك 2026-09-04: شكل الإطار — غيابه مستطيل (مطابقة MARK_SHAPES في core).
   *  إضافة اختيارية جمعيًا: الأدلة المنشورة قبل اليوم تعبر العقد كما هي وschemaVersion يبقى ١. */
  shape: z.enum(['rect', 'ellipse']).optional(),
})

export const zScreenshot = z.union([
  z.object({
    fileId: z.string().min(1),
    fileUrl: z.string().optional(),
    /** PERF-02: معرّف المصغّرة (320px ≤30KB) للقوائم — الأصل يبقى للعارض */
    thumbFileId: z.string().optional(),
    /** خصوصيّة ٢ب: رابط المصغّرة الموقَّع — يملكه الخادم، يُنزع عند الكتابة ويُركَّب عند القراءة */
    thumbUrl: z.string().optional(),
    blurRects: z.array(zRect).default([]),
    crop: zRect.optional(),
    autoBlurred: z.boolean().optional(),
    /** ANNO-01: شروحات مرسومة — اختيارية جمعيًا (الأدلة القديمة بلا شرح صالحة) */
    annotations: z.array(zAnnotation).max(50).optional(),
    /** ANNO-02: غيابه = لقطة قديمة إطارها مخبوز في البكسل */
    mark: zTargetMark.optional(),
  }),
  z.object({ missing: z.literal(true), reason: z.string().optional() }),
])

export const zStepKind = z.enum(['click', 'input', 'select', 'toggle', 'navigate', 'keypress'])

/** VOX-09: تعليق صوتي لخطوة بعينها — سقف 60 ثانية صادق (سقف التسجيل نفسه) */
export const zStepVoice = z.object({
  fileId: z.string().min(1).optional(),
  fileUrl: z.string().optional(),
  durationMs: z.number().int().min(1).max(60_000),
  pending: z.boolean().optional(),
})

/** AUTO-01: مرشحو مرساة العنصر بترتيب الأولوية — أول فريد يفوز عند الحل في «دربني» */
export const zAnchorCandidate = z.discriminatedUnion('k', [
  z.object({ k: z.literal('id'), v: z.string().min(1).max(200) }),
  z.object({ k: z.literal('testid'), v: z.string().min(1).max(200) }),
  z.object({ k: z.literal('aria'), v: z.string().min(1).max(200) }),
  z.object({ k: z.literal('name'), v: z.string().min(1).max(200) }),
  z.object({ k: z.literal('text'), v: z.string().min(1).max(80) }),
  z.object({ k: z.literal('path'), v: z.string().min(1).max(600) }),
  /** مرشّحا UIA لخطوات الديسكتوب — مطابقة AnchorCandidate في core (يحرسها اختبار اتساق النوع) */
  z.object({ k: z.literal('automationId'), v: z.string().min(1).max(200) }),
  z.object({ k: z.literal('controlType'), v: z.string().min(1).max(60) }),
  /** ث١: متحقِّقان لا باحثان — تسمية الحقل وسياقه (عنوان النافذة/النموذج) */
  z.object({ k: z.literal('label'), v: z.string().min(1).max(80) }),
  z.object({ k: z.literal('ctx'), v: z.string().min(1).max(60) }),
])

/**
 * BKL-01: النص المنسّق كتمثيل مُهيكل لا HTML — أمان بالبناء لا بتنظيف لاحق.
 * الكرّاسة تُشارَك برابط عام يفتحه ضيف، وHTML مخزَّن يعني خطر XSS دائمًا.
 */
export const zTextRun = z.object({
  text: z.string().max(5000, 'قطعة النص لا تتجاوز 5000 حرف'),
  b: z.boolean().optional(),
  i: z.boolean().optional(),
  href: z.string().url('رابط غير صالح').optional(),
})
export const zRichPara = z.object({
  para: z.enum(['p', 'h2', 'h3', 'ul', 'ol']),
  runs: z.array(zTextRun).max(200),
})
export const zRichText = z.array(zRichPara).max(200)

/** BKL-01: مرجع حيّ لدليل مضمّن — المعرّف فقط، فيتبع التضمينُ تحديثاتِ الدليل */
export const zGuideEmbed = z.object({
  guideId: z.string().min(1, 'معرّف الدليل المضمّن مطلوب'),
  expanded: z.boolean(),
})

/** DTOP-01: مصدر التقاط الخطوة — ويب أو ديسكتوب (IE-mode نكهة منه) أو كاميرا (الجوّال لآلة فيزيائية).
 *  المرساة ليست خاصيّة المصدر — تبقى target.anchor على الخطوة نفسها لأي مصدر. */
export const zStepSource = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('web'), url: z.string(), pageTitle: z.string() }),
  z.object({
    kind: z.literal('desktop'),
    processName: z.string(),
    windowTitle: z.string(),
    /** AUMID ومعه مسار التنفيذي احتياطًا */
    appId: z.string(),
    uiaFramework: z.string().optional(),
    ieMode: z.boolean().optional(),
    url: z.string().optional(),
  }),
  z.object({ kind: z.literal('camera'), deviceModel: z.string().optional() }),
])
export type StepSourceDto = z.infer<typeof zStepSource>

/** د١ب: درس الدورة — خطوة block='lesson'. كتل درس الصفحة تليه مسطّحة في steps حتى الدرس التالي */
export const zLesson = z.object({
  type: z.enum(['guide', 'video', 'page']),
  title: z.string().max(120, 'عنوان الدرس 120 حرفًا كحد أقصى'),
  guideId: z.string().min(1).optional(),
  video: z.object({ url: z.string().min(1) }).optional(),
  note: z.string().max(500).optional(),
})
export type LessonStepDto = z.infer<typeof zLesson>

export const zStep = z.object({
  id: z.string(),
  kind: zStepKind,
  title: z.string(),
  note: z.string().optional(),
  /** EDT-13: نص بديل للقطة — وصولية */
  alt: z.string().max(300, 'النص البديل 300 حرفًا كحد أقصى').optional(),
  target: z.object({
    text: z.string().optional(),
    role: z.string().optional(),
    label: z.string().optional(),
    /** AUTO-01: بطاقة تعريف العنصر — اختيارية جمعيًا (الأدلة القديمة بلا مرساة صالحة) */
    anchor: z.array(zAnchorCandidate).max(6).optional(),
  }),
  value: z.string().optional(),
  sensitive: z.boolean(),
  /** ‏v1: رابط الصفحة وعنوانها — غيابهما معًا يوجب وجود source (superRefine أسفل) */
  url: z.string().optional(),
  pageTitle: z.string().optional(),
  /** DTOP-01: مصدر الخطوة الصريح — الأدلة القديمة (v1) بلا source تبقى صالحة، والترحيل الكسول في core/migrate */
  source: zStepSource.optional(),
  ts: z.number(),
  screenshot: zScreenshot.optional(),
  /** BLK-01 + BKL-01: نوع الكتلة — اختياري جمعي (الأدلة القديمة صالحة) */
  block: z.enum(['tip', 'alert', 'header', 'text', 'embed', 'divider', 'link', 'image', 'video', 'lesson']).optional(),
  /** BKL-01: محتوى كتلة النص (block='text') */
  rich: zRichText.optional(),
  /** BKL-01: الدليل المضمّن (block='embed') */
  embed: zGuideEmbed.optional(),
  /** د١ب: درس الدورة (block='lesson') */
  lesson: zLesson.optional(),
  /** VOX-09 «ميك الخطوة»: تعليق صوتي مدموج مع الخطوة — اختياري جمعي (الأدلة القديمة صالحة).
   * ‏pending = الصوت محفوظ محليًا ولم يُرفع/يُفرَّغ بعد (فشل الخدمة لا يفقد الصوت أبدًا) */
  voice: zStepVoice.optional(),
}).superRefine((s, ctx) => {
  // DTOP-01: كل خطوة لها هوية مصدر — ثنائية الويب (v1: الرابطان معًا) أو source صريح (v2)
  if (!(s.url !== undefined && s.pageTitle !== undefined) && !s.source) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['source'],
      message: 'الخطوة تحتاج رابط صفحة ويب أو مصدر التقاط',
    })
  }
  if (s.lesson?.type === 'guide' && !s.lesson.guideId) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['lesson', 'guideId'], message: 'درس الدليل يحتاج دليلاً' })
  }
  if (s.lesson?.type === 'video' && !s.lesson.video?.url) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['lesson', 'video'], message: 'درس الفيديو يحتاج رابطاً' })
  }
})

export type StepVoiceDto = z.infer<typeof zStepVoice>

/** VOX-01..03: صوت الدليل — webm واحد ومدته ولحظة بدء تسجيله (تجميعي: الأدلة القديمة بلا صوت صالحة) */
export const zAudioMeta = z.object({
  fileId: z.string().min(1),
  fileUrl: z.string().optional(),
  durationMs: z.number().int().min(0),
  startedAt: z.number(),
  /** فترات الإيقاف المؤقت [من، إلى] بالساعة المطلقة — زمن المحتوى يقفز فوقها */
  pauses: z.array(z.tuple([z.number(), z.number()])).optional(),
})

/** TRNS-01: ترجمة محتوى الدليل (طبقة تراكب) — الأصل العربي مقدَّس والغائب يرتد إليه.
 *  items مفاتيحها مسارات مستقرة: 'title' · 'description' · 'steps/<id>/title|note|alt|
 *  targetText|targetLabel|pageTitle' · 'steps/<id>/rich/<para>/<run>' */
export const zGuideTranslation = z.object({
  title: z.string(),
  description: z.string().optional(),
  items: z.record(z.string(), z.string()),
  meta: z.object({
    provider: z.string(),
    createdAt: z.string(),
    sourceUpdatedAt: z.string(),
  }),
})
export type GuideTranslationDto = z.infer<typeof zGuideTranslation>
/** لغات الترجمة المسموحة اليوم — إضافة لغة لاحقًا = توسيع هذا القيد فقط */
export const zTranslateGuideRequest = z.object({ locale: z.enum(['en']) })

export const zGuide = z.object({
  id: z.string(),
  /** DTOP-01: ١ = مسطّح (url/pageTitle على الخطوة) · ٢ = source صريح — القِدم مقبول حتى تهجرة الإضافة،
   *  والقراءة تمرّ عبر migrateGuide في core فتنتج ٢ دائمًا */
  schemaVersion: z.union([z.literal(1), z.literal(2)]),
  /** BKL-01: نوع المستند — غيابه دليل. توسيع جمعي بلا رفع schemaVersion */
  kind: z.enum(['guide', 'booklet', 'course']).optional(),
  title: z.string(),
  description: z.string().max(2000, 'الوصف لا يتجاوز 2000 حرف').optional(),
  locale: z.literal('ar'),
  dir: z.literal('rtl'),
  createdAt: z.string(),
  updatedAt: z.string(),
  steps: z.array(zStep),
  audio: zAudioMeta.optional(),
  /** TRNS-01: ترجمات المحتوى — اختياري جمعي (الأدلة القديمة صالحة) */
  translations: z.record(z.enum(['en']), zGuideTranslation).optional(),
})

export type GuideDto = z.infer<typeof zGuide>
export type StepDto = z.infer<typeof zStep>
export type ScreenshotDto = z.infer<typeof zScreenshot>
export type AnnotationDto = z.infer<typeof zAnnotation>
export type TargetMarkDto = z.infer<typeof zTargetMark>
export type AudioMetaDto = z.infer<typeof zAudioMeta>
export type AnchorCandidateDto = z.infer<typeof zAnchorCandidate>
export type TextRunDto = z.infer<typeof zTextRun>
export type RichParaDto = z.infer<typeof zRichPara>
export type RichTextDto = z.infer<typeof zRichText>
export type GuideEmbedDto = z.infer<typeof zGuideEmbed>

export const zRegister = z.object({
  email: z.string().email('بريد إلكتروني غير صالح'),
  password: z.string().min(8, 'كلمة المرور 8 أحرف على الأقل'),
})
export const zLogin = zRegister

/** مزامنة الثيم (2026-09-06): الاختيار على الخادم لكل مستخدم — الموقع والامتداد يتبعانه */
export const zTheme = z.object({ theme: z.enum(['brand', 'classic']) })
export type ThemeChoiceDto = z.infer<typeof zTheme>['theme']

/** I18N-01: لغة الواجهة لكل مستخدم — مرآة الثيم */
export const zLocale = z.object({ locale: z.enum(['ar', 'en']) })
export type LocaleDto = z.infer<typeof zLocale>['locale']

export const zCreateGuide = z.object({ guide: zGuide })

/** CAP-17: إضافة خطوات لدليل قائم — insertAt موضع الإدراج (النهاية افتراضيًا) */
export const zAppendSteps = z.object({
  steps: z.array(zStep).min(1, 'خطوة واحدة على الأقل للإضافة'),
  insertAt: z.number().int().min(0).optional(),
})

export interface MeDto {
  id: string
  email: string
  /** م١: الاسم الظاهر — غيابه حساب قديم */
  name?: string | null
  /** ORG-00: المساحة النشطة لهذه الجلسة */
  activeWorkspaceId?: string
  /** م١: نوع الحساب النشط وحالته — الموقوف والمنتهي يُعرض لهما سبب لا محتوى */
  accountKind?: AccountKind
  accountStatus?: AccountStatus
  /** م٢: في قائمة إدارة المنصة — يظهر له رابط /platform */
  isPlatformAdmin?: boolean
}

export type AccountKind = 'personal' | 'company' | 'partner'
export type AccountStatus = 'active' | 'suspended' | 'ended'

/** ORG-00: عضوية فعالة في مساحة — مبدّل المساحات */
export interface WorkspaceDto {
  id: string
  name: string
  role: 'admin' | 'creator' | 'viewer' | 'partner'
  kind?: AccountKind
  status?: AccountStatus
  active: boolean
}

/** ORG-08: صف في سجل التدقيق */
export interface AuditEntryDto {
  id: string
  at: string
  action: string
  actorId: string
  actorEmail: string | null
  targetKind: string
  targetId: string
  targetLabel: string | null
  meta: Record<string, unknown>
}

export interface GuideSummaryDto extends GuideRowFields {
  id: string
  title: string
  createdAt: string
  updatedAt: string
  stepCount: number
  /** BKL-01: يميّز بطاقة الكرّاسة في المكتبة — يأتي من عمود مشتق لا من فكّ JSON (قانون PERF-05) */
  kind: 'guide' | 'booklet' | 'course'
  shared: boolean
  shareUrl?: string
  /** PERF-02: معرّف مصغّرة أول لقطة — القوائم تعرضها لا الأصل؛ PNG بلا مصغّة */
  thumbFileId?: string
  /** خصوصيّة ٢ب: رابط المصغّرة الموقَّع — العميل يعرضه ولا يركّب رابطًا من المعرّف */
  thumbUrl?: string
  /** LIB-02..03: بيانات تنظيم المكتبة */
  starred: boolean
  folderId: string | null
  tags: string[]
  /** LIB-06: موجود فقط في عرض السلة */
  deletedAt?: string
  /** GM-05: تعليقات الدليل — الكلي لشارة المكتبة، والمفتوحة تنبّه صاحب الدليل للرد */
  commentCount: number
  openCommentCount: number
  /** GM-05 تطوّر: المشكلات الأصلية غير المحلولة — الشارة الحمراء البارزة (أخطر من التعليق العام) */
  openIssueCount: number
  /** WS-02: الرؤية — خاص افتراضيًا و«workspace» بعد نشر صريح يراه أعضاء المساحة */
  visibility: 'private' | 'workspace'
  /** WS-05: موقع الدليل المشتق (مضيف أول خطوة، صغير بلا www) — فارغ إن لا رابط */
  site: string
  /** WS-04: هل علّمه العضو الحالي بوكمارك (لكل عضو بمعزل عن غيره) */
  bookmarked: boolean
  /** المرحلة ب (الهوم): هل هذا الدليل من إنشاء العضو الحالي — تقيد الواجهة بصدق (لا أزرار تحرير لغيره) */
  mine: boolean
  /** نمط سكرايب: عدد مشاهدات رابط المشاركة (٠ لغير المشترك) — عمود «مشاهدات» بالجدول */
  views: number
  /** نمط سكرايب: بريد المنشئ — يُعرض باسم مشتق على البطاقات («قبل ٣ أيام · أحمد») */
  ownerEmail: string
  /** م١: اسم المنشئ — null لحساب قديم بلا اسم */
  ownerName?: string | null
  /** ORG-04: القسم المالك (قسم المنشئ عند الإنشاء) — غيابه خادم قديم أو منشئ بلا قسم */
  ownerTeamId?: string | null
  ownerTeamName?: string | null
  /** ب: ما يحق للعضو الحالي على الدليل — الواجهة تُظهر الأزرار منه، والخادم يحرسها */
  access?: GuideAccess
  /** ب (§٧): مثبّت يظهر أولاً لكل الشركة */
  pinned?: boolean
  /** ب (§٦): شارة التوثيق — null إن لم يُوثَّق أو نُشر تحديث بعد التوثيق */
  verified?: GuideVerified | null
  /** ب (PUB-03): موقوف — لا يصل للقارئ أصلاً، فيراه المحرر وحده */
  suspended?: boolean
}

/** ت (§٥.١): ما لم يره هذا الموظف خلال آخر ١٤ يوماً — شخصية، تختفي بفتحه */
export type GuideFreshness = 'new' | 'updated'

/**
 * ت (§٥): حقول الصف الذي يختار منه الموظف — واحدة في المكتبة والإضافة.
 * source='official' والشريك يُملآن في ش٢، فالصف نفسه يعرض الدليل الرسمي بلا تصميم جديد.
 */
export interface GuideRowFields {
  /** اسم المنشئ (أو بريده إن لم يضع اسماً) — للدليل الرسمي: اسم الشريك */
  creatorName?: string
  /** 👁 عدد الأشخاص المختلفين الذين فتحوه — لا مرات الفتح */
  readerCount?: number
  fresh?: GuideFreshness | null
  source?: 'company' | 'official'
  partner?: { id: string; name: string; logoUrl?: string }
}

/**
 * ب: owner = صاحب الدليل (المشاركة والحذف والترجمة والتفريغ والتعليقات له وحده)،
 * edit = يحرر المسودة، publish = ينشر/يلغي، moderate = يوقف ويوثّق ويثبّت (المدير ومدير القسم)
 */
export interface GuideAccess {
  owner: boolean
  edit: boolean
  publish: boolean
  moderate: boolean
}

export interface GuideVerified {
  at: string
  byName: string
}

export interface GuideSuspension {
  at: string
  reason: string
  byName: string
}

/** ب (PUB-02): المنشور نسخة مجمّدة — المحرر يعرف إن كانت مسودته سبقتها */
export interface GuidePublishState {
  published: boolean
  hasUnpublishedChanges: boolean
}

/**
 * ث٣ (§٥.٧): from = موقع الدليل المسجّل (نسخة الشريك)، hosts = نطاقات نسخة الشركة الصريحة (تُفتح)،
 * patterns = نجوم الشركة، systemPatterns = نجوم النظام — لمطابقة تبويب مفتوح فقط، وحين لا نطاق صريح للشركة
 */
export interface TrainHostsDto {
  from?: string
  hosts: string[]
  patterns: string[]
  systemPatterns?: string[]
}

/** ث٢ (§٥.٥): تشغيل «دربني» واحد — نتيجة كل خطوة، بلا هوية الموظف. runId من الإضافة: الإعادة لا تكرّر العدّ */
export type TrainOutcomeDto = 'verified' | 'confirmed' | 'declared' | 'missing'
export interface TrainRunBody {
  runId: string
  steps: Array<{ stepId: string; outcome: TrainOutcomeDto; confidence: 'high' | 'medium' | 'low' | null }>
}

/** ث٢ (§٥.٦): حال الدليل — الخطوة معطوبة حين تكون ٣ من آخر ٥ نتائج لها بإقرار الموظف أو لم توجد */
export interface GuideHealthDto {
  broken: boolean
  companies: number
  steps: Array<{ stepId: string; broken: boolean; bad: number; seen: number; since: string | null }>
}

/** ب (§٦): «صحة المكتبة» في لوحة الشركة */
export interface LibraryHealthItemDto {
  id: string
  title: string
  ownerName: string
  updatedAt: string
  verifiedAt?: string
  suspendedAt?: string
  reason?: string
  byName?: string
}

export interface LibraryHealthDto {
  reverify: LibraryHealthItemDto[]
  suspended: LibraryHealthItemDto[]
}

export interface ShareInfoDto {
  token: string
  shareUrl: string
  /** VIEW-06: عدّاد مشاهدات مجمّع — يظهر لصاحب الدليل فقط */
  views: number
}

export interface GuideDetailsDto {
  guide: GuideDto
  share: ShareInfoDto | null
  /** ش١: لدليل في حساب شريك وحده — نظامه وجمهوره، وما يختار منه المحرر */
  official?: OfficialDto
  /** ش٢: دليل رسمي يقرؤه موظف شركة — للقراءة وحدها، ومنشئه الشريك */
  source?: 'company' | 'official'
  partner?: { id: string; name: string; logoUrl?: string | null }
  /** ث٣: للدليل الرسمي عند موظف الشركة — أين يُفتح «دربني» بدل نسخة الشريك */
  trainHosts?: TrainHostsDto
  /** LIB-03: بيانات التنظيم للمحرر — الوسوم تُعرض وتُحرَّر من هناك */
  meta?: { starred: boolean; folderId: string | null; tags: string[] }  /**
   * قرار المالك 2026-09-10: بوابة النشر قبل الرابط — حالة النشر تصير مع بيانات
   * التنظيم ليحترم المحرر «لا رابط لدليل غير منشور». اختياري جمعيًا (خادم قديم = بلا بوابة).
   */
  visibility?: 'private' | 'workspace'
  /** LIB-06 + BKL-01: وقت دخول السلة — حضوره يميّز «في السلة» عن «غير موجود» (٤٠٤) */
  deletedAt?: string
  /** ORG-04: شارة القسم المالك في العارض */
  ownerTeam?: { id: string; name: string } | null
  /** ب: غيابها خادم قديم — يُعامل كما كان (المالك يحرر) */
  access?: GuideAccess
  publishState?: GuidePublishState
  suspension?: GuideSuspension | null
  verified?: GuideVerified | null
  pinned?: boolean
}

export interface PublicGuideDto {
  guide: GuideDto
  sharedAt: string
  /**
   * BKL-01: أدلة الكرّاسة المضمّنة، مصرَّح بها عبر **هذا التوكن وحده** —
   * لا تصير عامة ولا تظهر في قائمة أو بحث، وسحب الرابط يقطعها فورًا.
   * تغيب للدليل العادي، ويغيب منها المحذوف (العميل يعرض بطاقة صادقة).
   */
  embeds?: Record<string, GuideDto>
}

/** VOX-05: تفريغ الصوت إلى نص — اقتراح نصّي لكل خطوة لها كلام في مقطعها */
export interface TranscribeSuggestionDto {
  stepId: string
  text: string
}

export interface TranscribeResultDto {
  suggestions: TranscribeSuggestionDto[]
  provider: string
  /** وضع التطبيق (قرار المالك 2026-08-30 — تفريغ تلقائي): عدد الملاحظات التي مُلئت فعلًا */
  applied?: number
}

/** VOX-09: نتيجة تفريغ تعليقات الخطوات (ميك الخطوة) — كل خطوة بحالتها بصدق */
export interface TranscribeStepsResultDto {
  results: Array<{ stepId: string; ok: boolean; errorAr?: string }>
}

/** جسم طلب التفريغ — apply=true يملأ ملاحظات الخطوات الفارغة مباشرة (الوضع التلقائي بعد النشر) */
export const zTranscribeRequest = z.object({
  apply: z.boolean().optional().default(false),
})
// غير مستهلك في أي تطبيق حتى الفحص (2026-09-21) — محفوظ كعقد نقل محتمل؛ حذفه قرار مالك.
export type TranscribeRequestDto = z.infer<typeof zTranscribeRequest>

// ——— تنظيم المكتبة (LIB-01..04/06) ———

export const zListGuidesQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(24),
  sort: z.enum(['updated', 'created', 'title']).default('updated'),
  order: z.enum(['asc', 'desc']).default('desc'),
  folder: z.string().min(1).max(64).optional(),
  starred: z.coerce.boolean().optional(),
  trash: z.coerce.boolean().optional(),
  tag: z.string().min(1).max(30).optional(),
  /** WS-04: المحفوظات (بوكمارك العضو) — منفصلة عن نجمة المنشئ */
  saved: z.coerce.boolean().optional(),
  /** WS-05: ترشيح بموقع الدليل المشتق (مضيف أول خطوة، صغير بلا www) */
  site: z.string().min(1).max(100).optional(),
  /** المرحلة ب (الهوم): ترشيح الحالة — خاص أو منشور للمساحة */
  visibility: z.enum(['private', 'workspace']).optional(),
  /** المرحلة ب (الهوم): ترشيح المنشئ — أنا أو الزملاء */
  creator: z.enum(['me', 'others']).optional(),
  /** المرحلة ب (الهوم): نافذة زمنية على آخر تحديث — الخادم يحسب الحد */
  when: z.enum(['today', 'week', 'month']).optional(),
  /** ORG-04: ترشيح بالقسم المالك — الخادم يضم فروعه */
  team: z.string().min(1).max(64).optional(),
  /** ش٢: مصدر الدليل — أدلة الشركة أو الأدلة الرسمية من شريكها */
  source: z.enum(['company', 'official']).optional(),
})

export type ListGuidesQuery = z.infer<typeof zListGuidesQuery>

export type ListGuidesDto = {
  items: GuideSummaryDto[]
  total: number
  page: number
  limit: number
}

/** المرحلة ب (الهوم): نداء واحد يغذي الشريط الجانبي وشريط الإحصاءات وفلتر الموقع */
export interface LibrarySiteCountDto {
  site: string
  count: number
}

export interface LibraryTeamCountDto {
  id: string
  name: string
  count: number
}

export interface LibraryOverviewDto {
  workspaceName: string
  myRole: 'admin' | 'creator' | 'viewer'
  myEmail: string
  /** م١: اسمي الظاهر — null لحساب قديم بلا اسم */
  myName?: string | null
  /** م٢: قائمة البداية — لمدير حساب شركة فقط */
  /** م٢ + ش١: للشركة الأقسام، وللشريك الملف العام */
  onboarding?: { departments?: boolean; profile?: boolean; members: boolean; guides: boolean } | null
  /** ج١: نوع الحساب النشط — «أنظمتنا» لحساب الشركة وحده */
  accountKind?: AccountKind
  /** م٢: يظهر له رابط «إدارة المنصة» */
  isPlatformAdmin?: boolean
  /** خيار الثيم المحفوظ لهذا المستخدم — الموقع والامتداد يقرآنه عند الإقلاع */
  myTheme: ThemeChoiceDto
  /** لغة الواجهة المحفوظة لهذا المستخدم (I18N-01) — مرآة الثيم */
  myLocale: LocaleDto
  counts: {
    /** كل ما يمكن للعضو رؤيته (مَلكي + منشور المساحة) خارج السلة */
    all: number
    mine: number
    published: number
    saved: number
    /** ش٢: الأدلة الرسمية من شركاء هذه الشركة */
    official?: number
  }
  sites: LibrarySiteCountDto[]
  /** ORG-04: أقسام الأدلة المقروءة لفلتر «القسم» — يغيب من خادم قديم */
  teams?: LibraryTeamCountDto[]
  /** ASG: عدد الإسنادات التي تخصّني ولم أفتحها — شارة الشريط وإعلان الرئيسية.
   *  اختياري تسامحًا مع مستهلكين أقدم؛ الخادم يرسله دائمًا (القارئ يفترض `?? 0`) */
  assignedNewCount?: number
}

/** ——— الإسناد (ASG) — إسناد دليل/كرّاسة لشخص أو فريق أو المساحة، متابعة بالأسماء بلا توقيع رسمي ——— */
export const zTargetKind = z.enum(['user', 'team', 'workspace'])
export type TargetKind = z.infer<typeof zTargetKind>

export const zAssignTarget = z.object({ kind: zTargetKind, id: z.string().min(1) })
export type AssignTargetDto = z.infer<typeof zAssignTarget>

export const zCreateAssignment = z.object({
  targets: z.array(zAssignTarget).min(1, 'اختر شخصًا أو فريقًا أو الشركة كلها').max(50),
  note: z.string().max(1000).optional(),
})
export type CreateAssignmentDto = z.infer<typeof zCreateAssignment>

/** عنصر «أُسند إليّ» بمنظور المُسنَد إليه */
/** د١: عنصر في الدورة — الدليل نفسه أو دليل مضمّن في الكرّاسة */
export interface CourseItemDto {
  id: string
  title: string
  done: boolean
  /** د١ب: نوع الدرس — عنصر الكرّاسة والدليل المنفرد 'guide' */
  type: 'guide' | 'video' | 'page'
  minutes: number
}

/** د١: حالة الدورة لمستخدم واحد — تُحسب حيّاً لكل (دليل مُسند، مستخدم) */
export interface CourseStateDto {
  guideId: string
  title: string
  kind: 'guide' | 'booklet' | 'course'
  items: CourseItemDto[]
  itemsDone: number
  minutes: number
  nextItemId: string | null
  completedAt: string | null
}

/** د١ب: الدرس الواحد للمشغّل — الدليل بنسخته المنشورة، والصفحة بكتلها، والفيديو برابطه */
export interface LessonDto {
  id: string
  type: 'guide' | 'video' | 'page'
  title: string
  note?: string
  videoUrl?: string
  blocks?: StepDto[]
  guide?: GuideDto
  trainHosts?: TrainHostsDto
  /** درس دليل لا يراه المتدرّب (حُذف، أو أُوقف، أو لم يُنشر) */
  unavailable?: true
}

export interface AssignedItemDto {
  /** د١: الدورة — التقدّم والتالي */
  course: CourseStateDto
  assignmentId: string
  guideId: string
  title: string
  kind: 'guide' | 'booklet' | 'course'
  site: string
  stepCount: number
  assignerEmail: string
  note: string
  createdAt: string
  openedAt: string | null
  doneAt: string | null
}

/** صف في لوحة المُسنِد بمنظور المدير */
export interface AssignmentRecipientDto {
  userId: string
  email: string
  teamName: string | null
  openedAt: string | null
  doneAt: string | null
  /** د١: التقدّم — started = فتح أو أنهى عنصراً */
  itemsDone: number
  itemsTotal: number
  started: boolean
}

export interface AssignmentBoardDto {
  recipients: AssignmentRecipientDto[]
  recipientCount: number
  openedCount: number
  doneCount: number
}

/** المرحلة ج (أنشئ بواسطي + التقارير): التقرير المجمّع لأدلة العضو الحيّة — أصفار صادقة ولا شيء غيره */
export interface MineReportDto {
  /** عدد أدلتي خارج السلة */
  total: number
  /** المنشور منها للمساحة صراحةً */
  published: number
  /** إجمالي مشاهدات روابط المشاركة الحية (VIEW-06) */
  views: number
  /** تعليقات أصلية غير محلولة تنتظر ردًا (GM-05) — الكلي (مشكلات + تعليقات عامة) */
  openComments: number
  /** GM-05 تطوّر: المشكلات المفتوحة وحدها — الرقم الأحمر البارز الذي يحرّك المُنشئ للمراجعة */
  openIssues: number
}

export interface FolderDto {
  id: string
  name: string
  count: number
  createdAt: string
}

export const zFolderName = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'اسم المجلد مطلوب')
    .max(60, 'اسم المجلد 60 حرفًا كحد أقصى'),
})

/** تحديث بيانات التنظيم فقط — لا يمس محتوى الدليل (LIB-02/03) */
export const zGuideMeta = z.object({
  folderId: z.string().min(1).max(64).nullable().optional(),
  starred: z.boolean().optional(),
  tags: z.array(z.string().trim().min(1).max(30)).max(10, 'عشرة وسوم كحد أقصى').optional(),
  /** WS-02: النشر للمساحة صريح — «خاص» افتراضيًا بقرار المالك 2026-09-03 */
  visibility: z.enum(['private', 'workspace']).optional(),
})

// ——— تعليقات الدليل (GM-05 تطوّر: مستوى الدليل + نوعان) ———

/** نوع التعليق: «مشكلة» تحتاج إصلاحًا (شارة حمراء + عدّاد تنتظر ردًا) أو «تعليق» عام أخف */
export const zCommentKind = z.enum(['issue', 'note'])
export type CommentKind = z.infer<typeof zCommentKind>

/**
 * تعليق واحد كما يرده الخادم — الضيف بلا هوية والمالك بعلامة صاحب الدليل.
 * على مستوى الدليل: stepId سنتينل «بلا خطوة» ('')؛ يبقى الحقل لتعليقات قديمة مرتبطة بخطوة.
 */
export const zStepComment = z.object({
  id: z.string().min(1),
  /** '' = تعليق على مستوى الدليل (الجديد)؛ غيره تعليق قديم مرتبط بخطوة */
  stepId: z.string(),
  kind: zCommentKind,
  /** null = تعليق أصلي يفتح خيطًا؛ غيره رد على ذلك الأصل (عمق واحد) */
  parentId: z.string().nullable(),
  author: z.string().max(40),
  isOwner: z.boolean(),
  body: z.string().min(1).max(2000),
  /** وسم الخيط كمحلول — على التعليق الأصلي فقط، يخفيه من عدّاد المفتوحة */
  resolved: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
})
export type StepCommentDto = z.infer<typeof zStepComment>

/** إنشاء تعليق على مستوى الدليل: الضيف عبر رابط المشاركة والمالك من المحرر — نفس العقد */
export const zCreateComment = z.object({
  kind: zCommentKind,
  body: z.string().trim().min(1, 'التعليق فارغ').max(2000, 'التعليق 2000 حرفًا كحد أقصى'),
  author: z.string().trim().max(40, 'الاسم 40 حرفًا كحد أقصى').optional(),
  parentId: z.string().min(1).optional(),
})
export type CreateCommentDto = z.infer<typeof zCreateComment>

/** تحديث مالك فقط: تعديل النص أو وسم الخيط محلولًا — واحد منهما على الأقل */
export const zUpdateComment = z
  .object({
    body: z.string().trim().min(1, 'التعليق فارغ').max(2000, 'التعليق 2000 حرفًا كحد أقصى').optional(),
    resolved: z.boolean().optional(),
  })
  .refine((v) => v.body !== undefined || v.resolved !== undefined, { message: 'لا تغيير مطلوب' })
export type UpdateCommentDto = z.infer<typeof zUpdateComment>

export interface CommentsResponseDto {
  comments: StepCommentDto[]
}

export interface CommentResponseDto {
  comment: StepCommentDto
}

// ——— البحث (SRCH-00..03) ———

export const zSearchQuery = z.object({
  q: z.string().min(1, 'اكتب كلمة واحدة على الأقل للبحث'),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  shared: z.coerce.boolean().optional(),
  /** SRCH-02: مرشح المجلد */
  folder: z.string().min(1).max(64).optional(),
  /** SRCH-02: حصر النتائج على نطاق روابطه (مثل erp.example.com) */
  site: z.string().min(1).max(200).optional(),
})

export const zSuggestQuery = z.object({
  q: z.string().min(1),
  limit: z.coerce.number().int().min(1).max(10).default(8),
})

// ——— الاكتشاف حسب الصفحة (SRCH-04) ———

/** شارة الامتداد: أدلة المالك على نطاق التبويب النشط + رموز الشاشة الحالية للترتيب */
export const zDiscoverQuery = z.object({
  site: z.string().min(3, 'نطاق غير صالح').max(200),
  /** SRCH-04 تطوّر: رموز الشاشة الحالية (مسافات) — تُرتّب أدلة الشاشة أولًا */
  screen: z.string().max(400).optional(),
})

export type DiscoverGuideDto = {
  id: string
  title: string
  updatedAt: string
  /** المشاهدات المجمّعة — الأكثر مشاهدة يُرتَّب أولًا داخل مجموعته */
  views: number
  /** ب (§٧): المثبّت يتقدم داخل مجموعته — الخادم يرتّب (§٥.٢)، والإضافة لا تعيد الترتيب */
  pinned?: boolean
  verified?: GuideVerified | null
  ownerTeamName?: string | null
} & GuideRowFields

export type DiscoverResponseDto = {
  /** إجمالي أدلة الشركة للموقع (لشارة العدد) — أدلة الشريك خارجه */
  count: number
  /** أدلة تطابق الشاشة الحالية — الأكثر مشاهدة أولًا */
  onScreen: DiscoverGuideDto[]
  /** بقية أدلة الموقع — الأكثر مشاهدة أولًا */
  onSite: DiscoverGuideDto[]
  /** أدلة شريك الشركة لهذا النظام — مجموعة مستقلة أسفل أدلة الشركة (قرار المالك 2026-10-31)، مطابقة الشاشة أولًا */
  official?: DiscoverGuideDto[]
}

export type SearchHitDto = {
  guideId: string
  guideTitle: string
  stepId: string | null
  stepNo: number | null
  field: 'guide_title' | 'step_title' | 'note' | 'page_title' | 'url' | 'tag' | 'transcript'
  snippet: string
  updatedAt: string
  score: number
  /** SRCH-01: مصغّرة الدليل — النتيجة تعرض صورة لا عنوانًا فقط */
  thumbFileId?: string
  /** خصوصيّة ٢ب: رابط المصغّرة الموقَّع */
  thumbUrl?: string
}

export type SearchResponseDto = {
  hits: SearchHitDto[]
  total: number
  tookMs: number
  query: { raw: string; normalized: string }
  /** SRCH-06: نتائج دلالية على مستوى الدليل — عناوين مرتبة من الأقرب معنىً يختار منها.
   * غيابها مع semanticReason يعني تعذّر البحث الدلالي هذه المرة (نموذج يُحمّل أولًا…) */
  semantic?: SemanticHitDto[]
  /** SRCH-06: سبب عربي صادق عند تعذّر الطبقة الدلالية — لا صمت على الميزة الغائبة */
  semanticReason?: string
}

/** نتيجة دلالية واحدة: دليل كامل لا خطوة — قرار المالك «يختار من قائمة عناوين» */
export type SemanticHitDto = {
  guideId: string
  guideTitle: string
  /** تشابه كوساين 0..1 — للترتيب والعرض الخام، لا يحل محل ترتيب الخادم */
  score: number
  updatedAt: string
  thumbFileId?: string
  /** خصوصيّة ٢ب: رابط المصغّرة الموقَّع */
  thumbUrl?: string
}

// ——— إدارة الفريق (Team Management) ———

/** أدوار المساحة (WS-03): مدير يدير كل شيء · منشئ يُنشئ وينشر · مشاهد يقرأ ويعلّق ويتدرب.
 * ‏member دور قديم (قبل 0008) يُقبل بالعقد ويُطَّع creator عند الكتابة */
export const zWorkspaceRole = z.enum(['admin', 'creator', 'viewer', 'member'])
export type WorkspaceRole = z.infer<typeof zWorkspaceRole>

export const zMember = z.object({
  id: z.string().min(1),
  email: z.string().email(),
  /** م١: الاسم الظاهر — فارغ للحسابات القديمة فيُعرض البريد */
  name: z.string().nullable().optional(),
  role: z.string().min(1),
  department: z.string(),
  joinedAt: z.string().optional(),
  /** المرحلة د: عضو بكلمة مرور معلّقة (صفوف القِدَم) — لم يقبل دعوته بعد */
  pending: z.boolean().optional(),
  /** عدد أدلته الحيّة في المساحة — يظهر في تأكيد الإزالة قبل نقل ملكيتها للمدير */
  guideCount: z.number().optional(),
  /** فريقه (ترحيل 0010) — اختياري رغم أنه عمليًّا فريق واحد لكل عضو */
  teamId: z.string().nullable().optional(),
  teamName: z.string().nullable().optional(),
  /** ORG-07: تعطيل لا حذف */
  status: z.enum(['active', 'deactivated']).optional(),
  deactivatedAt: z.string().nullable().optional(),
  /** PUB-01: صلاحية النشر للمساحة */
  canPublish: z.boolean().optional(),
})
export type MemberDto = z.infer<typeof zMember>

/** المرحلة د (WS-08) ثم ORG-01/02: القسم — أب بمستوى واحد، وأرشفة لا حذف، ومدراء القسم */
export const zTeam = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  /** الأعضاء الفعّالون */
  memberCount: z.number(),
  parentId: z.string().nullable().optional(),
  archivedAt: z.string().nullable().optional(),
  managerIds: z.array(z.string()).optional(),
})
export type TeamDto = z.infer<typeof zTeam>

export const zInviteMemberReq = z.object({
  email: z.string().email('بريد إلكتروني غير صالح'),
  role: zWorkspaceRole.default('member'),
  department: z.string().default(''),
})
export type InviteMemberReq = z.infer<typeof zInviteMemberReq>

export const zUpdateMemberReq = z.object({
  role: zWorkspaceRole.optional(),
  department: z.string().optional(),
  /** المرحلة د: تجميع العضو في فريق المساحة (null = بلا فريق) */
  teamId: z.string().nullable().optional(),
  /** PUB-01: المدير يمنح صلاحية النشر أو يسحبها */
  canPublish: z.boolean().optional(),
})
export type UpdateMemberReq = z.infer<typeof zUpdateMemberReq>

// ——— دعوات المساحة (WS-01) — رابط يُنسخ ويُرسل واتساب، بلا SMTP ———

/** إنشاء دعوة: الدعوة للغير الموجود حسابه فعليًا (الموجود يُضاف مباشرة من POST /api/team) */
export const zInviteCreateReq = z.object({
  email: z.string().email('بريد إلكتروني غير صالح'),
  role: z.enum(['admin', 'creator', 'viewer']),
})
export type InviteCreateReq = z.infer<typeof zInviteCreateReq>

/** دعوة كما يراها المدير بعد إنشائها — الرابط يُرسل كما هو */
export interface InviteDto {
  id: string
  email: string
  role: 'admin' | 'creator' | 'viewer'
  token: string
  inviteUrl: string
  createdAt: string
  acceptedAt?: string
  /** م١: وصلت بالبريد؟ false = البريد تعطّل، فالرابط للنسخ وحده */
  emailed?: boolean
}

/** ما يراه المدعوّ علنًا قبل القبول (بلا جلسة) */
export interface InviteInfoDto {
  email: string
  role: 'admin' | 'creator' | 'viewer'
  workspaceName: string
  accepted: boolean
  expired: boolean
  /** ORG-00: للبريد حساب قائم — يدخل بحسابه ثم ينضم بدل وضع كلمة مرور */
  hasAccount?: boolean
}

/** القبول: المدعوّ يضع كلمة مرور فيستكمل حسابه المعلق ويدخل بجلسة */
export const zAcceptInviteReq = z.object({
  /** م١: الاسم الظاهر للزملاء بدل البريد */
  name: z.string().trim().min(1).max(80),
  password: z.string().min(8, 'كلمة المرور 8 أحرف على الأقل'),
})
export type AcceptInviteReq = z.infer<typeof zAcceptInviteReq>

/** VER-01: ملخّص إصدار لقائمة السجل — بلا data (JSON قد يكون كبيرًا). القوائم لا تفكّ JSON (PERF-05). */
export const zVersionSummary = z.object({
  id: z.string().min(1),
  createdAt: z.string(),
  authorId: z.string().min(1),
  stepCount: z.number().int().nonnegative(),
  title: z.string(),
})
export type VersionSummaryDto = z.infer<typeof zVersionSummary>

/** VER-01: قائمة السجل — من الأحدث للأقدم */
export const zListVersions = z.object({
  items: z.array(zVersionSummary),
})
export type ListVersionsDto = z.infer<typeof zListVersions>

/** VER-01: تفاصيل نسخة كاملة — نفس شكل GuideDto ليعيد استعمال العارض بلا فرع */
export const zGuideVersionDetails = z.object({
  id: z.string().min(1),
  guideId: z.string().min(1),
  createdAt: z.string(),
  authorId: z.string().min(1),
  guide: zGuide,
})
export type GuideVersionDetailsDto = z.infer<typeof zGuideVersionDetails>

/** DTOP-03: اقتران تطبيق الديسكتوب برمز (نمط RFC 8628) — بلا كلمة سرّ داخل التطبيق */
export const zDeviceStart = z.object({ deviceName: z.string().trim().min(1).max(60) })
export const zDeviceToken = z.object({ deviceCode: z.string().min(20).max(80) })
export const zDeviceApprove = z.object({ userCode: z.string().min(8).max(12), approve: z.boolean() })

export interface DeviceStartDto {
  deviceCode: string
  userCode: string
  expiresIn: number
  interval: number
}
export interface DevicePendingDto {
  userCode: string
  deviceName: string
  createdAt: string
}
export interface DeviceDto {
  id: string
  deviceName: string
  createdAt: string
  lastUsedAt: string | null
}


// ——— م٢: إدارة المنصة ولوحة الشركة ———

/** حساب كما تراه إدارة المنصة: أعداد وحالة فقط، بلا أي محتوى */
export interface PlatformAccountDto {
  id: string
  kind: 'company' | 'partner'
  name: string
  status: AccountStatus
  statusReason: string | null
  plan: string
  createdAt: string
  retainUntil: string | null
  note: string | null
  members: number
  guides: number
  storageBytes: number
  lastActivityAt: string | null
  adminEmails: string[]
}

export interface PlatformAccountDetailDto extends PlatformAccountDto {
  pendingInvites: { email: string; role: string; createdAt: string }[]
  history: { action: string; at: string; actorEmail: string | null; meta: Record<string, unknown> | null }[]
  /** ش١: لحساب الشريك وحده — أنظمته وعدد أدلته الرسمية وعملائه */
  partner?: { systems: { id: string; name: string }[]; officialGuides: number; clients: number }
}

export interface PlatformSummaryDto {
  companies: Record<AccountStatus, number>
  partners: Record<AccountStatus, number>
  activeUsers30d: number
  guides: number
  storageBytes: number
  recent: PlatformAccountDto[]
}

export interface PlatformUserDto {
  id: string
  email: string
  name: string | null
  createdAt: string
  memberships: { accountId: string; accountName: string; kind: AccountKind; accountStatus: AccountStatus; role: string; status: string }[]
}

export interface PlatformAuditDto {
  id: string
  action: string
  targetKind: string
  targetId: string
  targetLabel: string | null
  actorEmail: string | null
  at: string
  meta: Record<string, unknown> | null
}

/** التحقق بخطوتين: السر يُعطى مرة واحدة قبل التسجيل */
export interface PlatformMfaDto {
  enrolled: boolean
  secret?: string
  otpauthUri?: string
}

// ——— ج١: الأنظمة بالنطاق، وشريك واحد لكل نظام (الخطة §١٢) ———

/** النظام كما تراه إدارة المنصة: نطاقاته (المعرّف الثابت)، ومقدّمو أدلته، وعدد الشركات التي أضافته */
export interface PlatformSystemDto {
  id: string
  name: string
  hidden: boolean
  createdAt: string
  domains: string[]
  providers: { id: string; name: string; status: AccountStatus; logoUrl?: string | null }[]
  companies: number
  logoUrl?: string | null
}

/** بطاقة نظام في «أنظمتنا»: هل أضافته الشركة، ومقدّموه، والشريك المختار، ونطاقات نسختها */
export interface CompanySystemDto {
  id: string
  name: string
  domains: string[]
  added: boolean
  providers: { id: string; name: string; officialGuides: number; logoUrl?: string | null }[]
  partnerId: string | null
  ownDomains: string[]
  logoUrl?: string | null
}

// ——— ش١: منصة الشريك (الخطة §٢٦) ———

/** الملف العام للشريك — ما تراه الشركات عنه */
export interface PartnerProfileDto {
  name: string
  description: string
  website: string
  logoUrl: string | null
}

/** ش٢: إشعار في الجرس — البيانات أسماء جاهزة للعرض */
export interface NotificationDto {
  id: string
  kind: 'partner.chosen' | 'partner.stopped' | 'provider.removed' | 'note.answered'
  data: { companyName?: string; partnerName?: string; systemName?: string; label?: string }
  createdAt: string
  readAt: string | null
}

export interface NotificationsDto {
  items: NotificationDto[]
  unread: number
}

/** ش٢: تقارير الشريك — أعداد بلا أسماء */
export interface PartnerReportsDto {
  activeCompanies: number
  guides: { id: string; title: string; systemName: string; readers: number; companies: number }[]
}

/** لوحة الشريك: أنظمته بأعدادها، وعملاؤه الفعّالون */
export interface PartnerConsoleDto {
  systems: { id: string; name: string; domains: string[]; officialGuides: number; clients: number; logoUrl: string | null }[]
  clients: { companyId: string; companyName: string; systemId: string; systemName: string; since: string }[]
}

/** نظام الدليل الرسمي وجمهوره، والخيارات التي يبني منها المحرر لوحته */
export interface OfficialDto {
  /** رسمي للعملاء، أو داخلي لفريق الشريك (الافتراض) كدليل أي شركة */
  official: boolean
  systemId: string | null
  audience: 'all' | 'listed'
  companyIds: string[]
  systems: { id: string; name: string }[]
  clients: { id: string; name: string }[]
}

/** هـ ج١ (HLP) «ما هذا؟» — الشرح دليل note صغير مخفيّ من كل قوائم الأدلة */

/** بطاقة الشريك صاحب الشرح — بلا أي هوية كاتب */
export interface NotePartnerCardDto {
  id: string
  name: string
  logoUrl: string | null
}

/** شرح زر كما يقرؤه موظف الشركة */
export interface NoteDto {
  id: string
  /** اسم الزر المقروء، مثل «تأكيد» */
  label: string
  /** جملة الشريك — ٢٠٠ حرف كحد أقصى */
  body: string
  /** مرساة الزر الآمنة (بلا ctx) كما تُطابَق في الصفحة */
  anchor: AnchorCandidateDto[]
  /** رموز المسار والـhash بلا استعلام — ما يفصل شاشة الفاتورة عن أمر الشراء */
  screenKey: string
  partner: NotePartnerCardDto
  /** الدليل المربوط إن بقي مقروءًا للشركة، وإلا null بلا رابط ميت */
  guide: { id: string; title: string } | null
}

/** رد /api/notes — شروح النظام وهل للشركة شريك يُسأل */
export interface NotesDto {
  system: { id: string; name: string } | null
  canRequest: boolean
  notes: NoteDto[]
}

/** مرسى خطوة دليل منشور — «هذا الزر في دليل X، الخطوة N» */
export interface NoteStepDto {
  guideId: string
  title: string
  no: number
  anchor: AnchorCandidateDto[]
  url: string
}

/** شرح الشريك كما يراه هو — إدارته من الإضافة على الشاشة نفسها */
export interface MyNoteDto extends NoteDto {
  suspended: boolean
  access: { owner: boolean; edit: boolean; publish: boolean; moderate: boolean }
  audience: 'all' | 'listed'
  companyIds: string[]
}

/** رد /api/notes/mine — شروح الشريك وأدلته الرسمية وعملاؤه على النظام */
export interface MyNotesDto {
  system: { id: string; name: string } | null
  notes: MyNoteDto[]
  guides: { id: string; title: string }[]
  clients: { id: string; name: string }[]
}

/** جسم نشر الشرح — الالتقاط كاملًا */
export interface NoteInput {
  systemId: string
  anchor: AnchorCandidateDto[]
  screenKey: string
  label: string
  body: string
  guideId?: string | null
  audience: 'all' | 'listed'
  companyIds?: string[]
}

/** هـ ج١: طلب شرح — ما يراه الشريك: الشركة والعدد وحدهما، بلا أسماء */
export interface HelpRequestDto {
  id: string
  label: string
  screenKey: string
  systemName: string
  companyName: string
  count: number
  updatedAt: string
}

/** صفحة «الحساب» في لوحة الشركة */
export interface CompanyAccountDto {
  name: string
  kind: AccountKind
  status: AccountStatus
  plan: string
  members: number
  guides: number
  storageBytes: number
}
