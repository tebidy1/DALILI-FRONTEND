import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, it, expect } from 'vitest'

// بوّابة الفصل النظيف للنوافذ (طلب المالك 2026-09-19: «الشاشات والتفاعلات
// منفصلة عن الزرّ الرئيسيّ العائم كما في المرجع»): **نافذتان** — ‏main
// الحصاة الدائمة ٤٤ الكحليّة لا تتحوّل، وpopout المنبثقة الفاتحة تعرض
// بطاقات المرجع فوق الحصاة (تحاذاة يمنى وفجوة ١٢). بلا قصّ نوافذ ولا
// كبسولة ولا انحناء CSS على الحوافّ — الاستدارة للنظام، والتلميحات
// ويندوز الأصلية. انعكاس أيّ بند يعيد التشوّه الذي برّره إعادة البناء.
const here = fileURLToPath(new URL('.', import.meta.url))

interface WinCfg extends Record<string, unknown> {
  label?: string
}

const readConf = () =>
  JSON.parse(
    readFileSync(join(here, '..', 'src-tauri', 'tauri.conf.json'), 'utf8'),
  ) as { app: { windows: WinCfg[] } }

const readHtml = () => readFileSync(join(here, '..', 'index.html'), 'utf8')
const norm = (s: string) => s.replace(/\s+/g, ' ')

describe('النوافذ: حصاة دائمة + منبثقة مخفيّة — لا تحوّلٌ على الزرّ', () => {
  const conf = readConf()
  const main = conf.app.windows.find((w) => w.label === 'main')!
  const popout = conf.app.windows.find((w) => w.label === 'popout')!

  it('نافذتان بلا ثالث: main الحصاة وpopout المنبثقة', () => {
    expect(conf.app.windows).toHaveLength(2)
    expect(main).toBeTruthy()
    expect(popout).toBeTruthy()
  })

  it('الحصاة ٤٤×٤٤ كحليّة دائمة — مقاسها لا تتغيّره أيّ بطاقة', () => {
    expect(main.width).toBe(44)
    expect(main.height).toBe(44)
    expect(main.backgroundColor).toBe('#1C2B33')
    expect(main.decorations).toBe(false)
    expect(main.alwaysOnTop).toBe(true)
    expect(main.resizable).toBe(false)
    expect(main.skipTaskbar).toBe(true)
    expect(main.shadow).toBe(false)
  })

  it('المنبثقة فاتحة مخفيّة عند الإقلاع — تظهر فقط بأمر الحصاة', () => {
    expect(popout.label).toBe('popout')
    expect(popout.visible).toBe(false)
    expect(popout.backgroundColor).toBe('#FCFCFC')
    expect(popout.decorations).toBe(false)
    expect(popout.alwaysOnTop).toBe(true)
    expect(popout.skipTaskbar).toBe(true)
    expect(popout.shadow).toBe(false)
    expect(popout.resizable).toBe(false)
  })

  it('تدرّج المرجع نفسه للجسم — والمنبثقة الفاتحة عند الدور المنبثق', () => {
    expect(norm(readHtml())).toContain(
      'background: linear-gradient(175deg, #243946 0%, #1c2b33 100%);',
    )
    expect(norm(readHtml())).toContain('body[data-win="popout"] { background: #fcfcfc; }')
  })

  it('لا قصّ نوافذ في Rust إطلاقًا — والفرق بين النافذتين خلفيّةٌ ومقاسٌ فقط', () => {
    const lib = readFileSync(join(here, '..', 'src-tauri', 'src', 'lib.rs'), 'utf8')
    for (const banned of [
      'SetWindowRgn',
      'CreateEllipticRgn',
      'CreateRoundRectRgn',
      'CombineRgn',
      'set_window_layout',
      'set_window_shape',
      'WidgetLayout',
      'LayoutSpec',
      'HRGN',
    ]) {
      expect(lib).not.toContain(banned)
    }
    // استدارة ويندوز ١١ النظاميّة للنافذتين — WDA للاثنتين (الودجة لا
    // تظهر في لقطاتها)، وفرض مقاس الحصاة للـmain حصرًا
    expect(lib).toContain('w.label() == "main"')
    expect(lib).toContain('DWMWCP_ROUND')
    expect(lib).not.toContain('DWMWCP_DONOTROUND')
    expect(lib).toContain('DWMWA_BORDER_COLOR')
    expect(lib).toContain('WDA_EXCLUDEFROMCAPTURE')
    expect(lib).toContain('0x1c, 0x2b, 0x33, 255')
    expect(lib).toContain('0xfc, 0xfc, 0xfc, 255')
    expect(lib).toContain('WS_CAPTION')
    expect(lib).toContain('WS_THICKFRAME')
  })
})

describe('قائمة البدء: بطاقة المرجع حرفًا — خياران لا ثالث', () => {
  const n = norm(readHtml())

  it('خيارا البدء بنصّيهما وأنماطهما المنسوخة من المرجع', () => {
    expect(n).toContain('id="menuStart"')
    expect(n).toContain(
      '<button class="cap-btn primary" id="btnCap" type="button"><b>التقاط</b></button>',
    )
    expect(n).toContain('cap-btn secondary')
    expect(n).toContain('التقاط مع تعليق صوتي')
    expect(n).toContain('<p class="menu-cap">اختر كيف تريد أن يبدأ التوثيق</p>')
    expect(n).toContain('.cap-btn.primary { background: #1c2b33;')
    expect(n).toContain('min-height: 40px;')
    expect(n).toContain('min-height: 36px;')
    expect(n).toContain('M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z')
  })

  it('الطبقات مفصولة: البطاقات لنافذة المنبثقة وحدها — وعناصر الجولات غير المنفَّذة غائبة', () => {
    expect(n).toContain('body[data-win="popout"][data-form="menu"] .wcard { display: block; }')
    for (const banned of [
      'id="flash"',
      'id="confirm"',
      'id="settings"',
      'id="pillz"',
      'id="chip"',
      'id="building"',
      'class="pebble"',
      'id="pebble"',
    ]) {
      expect(n).not.toContain(banned)
    }
    expect(n).toContain('<main id="app"')
  })
})

describe('شريط التحكّم: مستطيل بلا كلمات — أزرار المرجع وتلميحات النظام', () => {
  const html = readHtml()
  const n = norm(html)

  it('الأزرار بترتيب المرجع: إنهاء أخضر قمةً، فإلغاء أحمر، ففاصل، فإيقاف، فميك', () => {
    expect(n).toContain('id="strip"')
    expect(n).toContain('<button class="sbtn sfinish" id="stripFinish"')
    expect(n).toContain('<button class="sbtn sdanger" id="stripCancel"')
    expect(n).toContain('<span class="ssep" role="separator"></span>')
    expect(n).toContain('id="stripPause"')
    expect(n).toContain('id="stripMic"')
    expect(n).toContain('.sbtn.sfinish { background: #3a7d44;')
    expect(n).toContain('.sbtn.sfinish:hover { background: #2f6238; }')
    expect(n).toContain('.sbtn.sdanger { color: #ff9b93; }')
    expect(n).toContain('M5 13l4 4L19 7')
    expect(n).toContain('M3 6h18M8 6V4h8v2m-9 0 1 14h8l1-14')
  })

  it('لا زرّ إخفاء في الشريط — الإخفاء بنقرة الحصاة نفسها بعد الفصل (طلب المالك)', () => {
    expect(n).not.toContain('id="stripHide"')
    expect(n).not.toContain('إخفاء التحكّم')
    expect(n.split('<span class="ssep"').length - 1).toBe(1)
  })

  it('أسماء الأزرار تلميحات ويندوز الأصلية (title) — لا تلميحات CSS المقصوصة', () => {
    expect(n).toContain('title="إنهاء وشِحْن الدليل"')
    expect(n).toContain('title="إلغاء التسجيل"')
    expect(n).toContain('title="إيقاف مؤقت"')
    expect(n).toContain('title="تعليق صوتي"')
    expect(n).not.toContain('data-tip')
  })

  it('مستطيل لا كبسولة (أمر المالك) — والشريط لنافذة المنبثقة وحدها', () => {
    expect(n).not.toContain('border-radius: 26px')
    expect(n).not.toContain('border-radius: 999px')
    expect(n).toContain('border: 1px solid rgba(255, 255, 255, 0.14);')
    expect(n).toContain('body[data-win="popout"][data-form="strip"] .strip { display: flex; }')
    expect(html).not.toContain('data-tauri-drag-region')
  })

  it('نبضة التعليق الصوتي ونبضة الجلسة على الحصاة — وحركة صعودٍ متدرّجة', () => {
    expect(n).toContain('id="micDot"')
    expect(n).toContain('body.voice #micDot')
    expect(n).toContain('rec-pulse')
    expect(n).toContain('body[data-win="main"].session:not(.voice):not(.paused) .recdot {')
    expect(n).toContain('sbtn-rise')
    expect(n).toContain('body[data-win="popout"][data-form="strip"] .strip > :nth-child(5) { animation-delay: 0.22s; }')
  })
})

describe('تفاعلات الجلسة (خطوات المرجع ٦–٨): إيقافٌ بشريحة وإلغاءٌ بتأكيد وإنهاءٌ بالبناء والتوست', () => {
  const n = norm(readHtml())

  it('٦ شريحة الإيقاف: نصّ المرجع ونقرتها تُتابع', () => {
    expect(n).toContain('id="chipPaused"')
    expect(n).toContain('موقوف مؤقتًا — نقراتك لا تُصوَّر')
    expect(n).toContain('.chipbar .cdot {')
    expect(n).toContain('body[data-win="popout"][data-form="chip"] .chipbar { display: flex; }')
  })

  it('٧ تأكيد الإلغاء: لا يُحذف شيء بنقرة غفلة — نصّا الزرّين من المرجع', () => {
    expect(n).toContain('id="confirmBox"')
    expect(n).toContain('<h4>إلغاء التسجيل؟</h4>')
    expect(n).toContain('سيُحذف كل شيء: <b id="confirmN">٠ خطوات</b> ولم يُشحن شيء بعد.')
    expect(n).toContain('<button class="cbtn red" id="btnYes" type="button">نعم، احذف الكل</button>')
    expect(n).toContain('<button class="cbtn" id="btnNo" type="button">متابعة التسجيل</button>')
    expect(n).toContain('.cbtn.red { background: #c4453d;')
    expect(n).toContain('body[data-win="popout"][data-form="confirm"] .confirm-card { display: block; }')
  })

  it('٨ الإنهاء: بناءٌ بشريط تقدّم ودوّار ثم توست الوصول بعددها الحقيقي', () => {
    expect(n).toContain('id="buildBox"')
    expect(n).toContain('جارٍ بناء الدليل…')
    expect(n).toContain('.bfill {')
    expect(n).toContain('bfill-run 1.6s ease-out forwards')
    expect(n).toContain('spin 0.9s linear infinite')
    expect(n).toContain('id="toastBox"')
    expect(n).toContain('وصل الدليل إلى مساحتك')
    expect(n).toContain('id="toastSub"')
    expect(n).toContain('body[data-win="popout"][data-form="toast"] .toast-card { display: flex; }')
  })

  it('لغة الحصاة: ميكروفون أحمر نابض أثناء التعليق وعلامة ▶ عند الإيقاف (طلب المالك)', () => {
    expect(n).toContain('body[data-win="main"].voice:not(.paused) .picon-mic {')
    expect(n).toContain('body[data-win="main"].paused .picon-play { display: block; }')
    expect(n).toContain('body[data-win="main"].session:not(.voice):not(.paused) .recdot {')
    expect(n).toContain('mic-breathe')
    expect(n).toContain('.picon-play {')
  })
})

describe('لحظة الالتقاط وعجلات التدريب (خطوتا المرجع ٤ و٩): لقطةٌ تذوب وحبّةٌ لجولتين', () => {
  const n = norm(readHtml())
  const main = readFileSync(join(here, 'main.ts'), 'utf8')

  it('٤ بطاقة اللقطة الحقيقيّة: بكسلات الخطوة الفعلية وحلقة العلامة على موضعها و«تراجع»', () => {
    expect(n).toContain('id="flashBox"')
    expect(n).toContain('<img class="shot-img" id="shotImg" alt="" />')
    expect(n).toContain('<span class="shot-ring" id="shotRing"></span>')
    expect(n).toContain('.flash .shot-ring {')
    expect(n).toContain('border: 1.5px solid #ea580c;')
    // الزجاجية: تعبئة خفيفة بلون الإطار تميّز دون إخفاء (طلب المالك 2026-09-27)؛ السمك أرفع بطلبه 2026-09-29
    expect(n).toContain('background: rgba(234, 88, 12, 0.2);')
    expect(n).toContain('<button class="undo" id="btnUndo" type="button">تراجع</button>')
    expect(n).toContain('id="flashStep"')
    // شارة `flashVoice` رُفعت 2026-09-30/ب: زرّ المايك في الصفّ نفسه يقول ما
    // كانت تقوله، والموجة أثناء التسجيل أوضح منها — وبقاؤها كان يزاحم صفًّا
    // واحدًا عرضه ٢٣٠. تبقى الشهادة بغيابها كي لا تعود سهوًا
    expect(n).not.toContain('id="flashVoice"')
    // block ⇐ flex بالقرار نفسه: البطاقة عمودٌ مرن تأكل اللقطةُ فيه الفائض
    // فلا تبقى مساحةٌ بيضاء تحت الصفّ حين تختفي الموجة
    expect(n).toContain('body[data-win="popout"][data-form="flash"] .flash { display: flex; animation: pop-in 0.3s ease; }')
    expect(main).toContain('prepareFlash(')
    // I18N-01: تسمية الخطوة والأرقام الشرقية عبر i18n.ts (السلسلة الشرقيّة هناك)
    expect(main).toContain("t('dt.stepN'")
    expect(readFileSync(join(here, 'i18n.ts'), 'utf8')).toContain('٠١٢٣٤٥٦٧٨٩')
    // اللقطة الحقيقيّة: البكسلات وحلقة العلامة تصلان حمولةَ بروتوكول — وهي
    // الآن جزءٌ من `FlashView` الذي تبنيه الآلة، والواجهة تمرّره كما هو
    expect(main).toContain('shot: view.shot')
  })

  it('٩ الحبّة الكاملة: شارة «أول جولتين ثم تنطوي» وزران مكتوبان — ثم تنطوي للقائمة', () => {
    expect(n).toContain('id="pillzBox"')
    expect(n).toContain('<span class="train-tag">أول جولتين ثم تنطوي</span>')
    expect(n).toContain('<button class="cap-btn primary" id="btnPillz" type="button"><b>ابدأ الالتقاط</b></button>')
    expect(n).toContain('ابدأ مع تعليق صوتي')
    expect(n).toContain('.pillzbox .cap-btn.primary {')
    expect(n).toContain('min-height: 44px;')
    expect(n).toContain('id="btnPillzV"')
    expect(main).toContain("'btnPillz', 'btnPillzV'")
    expect(main).toContain('tours += 1')
    // شارة التدريب داخل النافذة (المرجع كان يفيض بها خارجها — WDA يمنع)
    expect(n).toContain('.pillzbox .train-tag {')
  })

  // ثم صغرت إلى ١٥٨ بقرار المالك 2026-09-30/ب («مساحة بيضاء كبيرة لا داعي
  // لها»): الصفّان صفٌّ واحد (−٣٠) والحشو ٦⇐٤ (−٤) وفراغُ الموجة لم يعد
  // يُحجَز (−١٨) — العمود المرن يعطيها من اللقطة ساعةَ تظهر بلا قفزةِ نافذة
  it('البطاقتان بمقاسَي المرجع في عقد المنبثقة', () => {
    const src = readFileSync(join(here, 'recorder', 'expand.ts'), 'utf8')
    expect(src).toContain('flash: { w: 240, h: 158 }')
    expect(src).toContain('pillz: { w: 340, h: 168 }')
  })
})

describe('تجميد التصميم — عقد مرحلة الربط الحقيقيّ (طلب المالك 2026-09-20: «التصميم يبقى كما هو»)', () => {
  const n = norm(readHtml())
  const main = readFileSync(join(here, 'main.ts'), 'utf8')
  const expand = readFileSync(join(here, 'recorder', 'expand.ts'), 'utf8')

  it('مقاسات الحصاة والبطاقات العشر مجمّدة حرفًا — أي تعديل لازمه قرار تصميمٍ معلن', () => {
    expect(expand).toContain('SQUARE_SIZE = { w: 44, h: 44 }')
    expect(expand).toContain('GAP_ABOVE = 12')
    for (const s of [
      'menu: { w: 246, h: 152 }',
      'strip: { w: 48, h: 183 }',
      'chip: { w: 224, h: 30 }',
      'confirm: { w: 252, h: 150 }',
      'build: { w: 210, h: 60 }',
      'toast: { w: 224, h: 56 }',
      'flash: { w: 240, h: 158 }', // −٦٠: صفٌّ واحد وحشوٌ أضيق وعمودٌ مرن (2026-09-30/ب)
      'pillz: { w: 340, h: 168 }',
      'settings: { w: 246, h: 114 }', // I18N-01: صفّ اللغة الثالث
      'account: { w: 260, h: 228 }',
    ]) {
      expect(expand).toContain(s)
    }
  })

  it('الألوان والتدرّج والخطّ المقيَّس مجمّدة', () => {
    expect(n).toContain('linear-gradient(175deg, #243946 0%, #1c2b33 100%)')
    expect(n).toContain('#fcfcfc')
    expect(n).toContain('#1c2b33')
    expect(n).toContain('#3a7d44')
    expect(n).toContain('#c4453d')
    expect(n).toContain('#ff9b93')
    expect(n).toContain('#f4f2ec')
    expect(n).toContain("'IBM Plex Sans Arabic', 'Segoe UI', Tahoma, sans-serif")
  })

  // المدّة تغيّرت بقرار المالك 2026-09-30: ٢.٣ث كانت تُعجّل المستخدم عن زرّ
  // المايك — وسببُ بقاء البطاقة أصلًا أن يبلغه. والمهلة انتقلت من مؤقّت
  // المنبثقة إلى آلة `flash-card` المقودة بـsensor://tick (مؤقّتات WebView
  // تُخنَق في نافذةٍ غير مركَّز عليها، والمستخدم في تطبيقٍ آخر بطبيعة العمل)
  it('المدّد المجمّدة: توست الوصول ٣.٤ث — وذوبان اللقطة لم يعد مؤقّتَ منبثقة', () => {
    expect(main).toContain('}, 3400)')
    expect(main).not.toContain('}, 2300)')
    // العدد نفسه يسكن الآلة لا الواجهة — وهو ٣ث بقرار المالك 2026-09-30/ب
    // («الانتظار يفترض ألّا يتعدّى الثلاث ثوانٍ»): ٨ث كانت تحجب العمل، وبدء
    // التسجيل يُلغي المهلة أصلًا فلا تقطع الثلاثُ تعليقًا جاريًا
    expect(readFileSync(join(here, 'recorder', 'flash-card.ts'), 'utf8')).toContain(
      'FLASH_HOLD_MS = 3000',
    )
  })

  it('main.ts واجهةٌ فقط: ممنوع استيراد منطق التشغيل مباشرةً — الربط الحقيقيّ عبر المتحكّم (والجسور سطورُ توصيلٍ مسموحة يمرّرها للمتحكّم) لا عبر تسرّب الوحدات إلى الواجهة', () => {
    for (const banned of [
      "from './recorder/session'",
      "from './recorder/deliver'",
      "from './recorder/voice-memo'",
      "from './recorder/auto-memo'",
      "from './recorder/media-recorder'",
      "from './recorder/arm'",
      "from './recorder/auth-ui'",
      "from '@dalili/core'",
      "from './recorder/widget'",
    ]) {
      expect(main).not.toContain(banned)
    }
  })

  it('حقول البيانات الحقيقيّة معرَّفة بمعرّفاتٍ ثابتة — الربط الحقيقيّ (مرحلة ١) استبدل ديمو المرجع', () => {
    expect(n).toContain('<img class="shot-img" id="shotImg" alt="" />')
    expect(n).toContain('<span class="shot-ring" id="shotRing"></span>')
    expect(n).toContain('<b id="confirmN">٠ خطوات</b>')
    expect(n).toContain('id="toastSub"')
    expect(n).toContain('وصل الدليل إلى مساحتك')
  })

  it('آليّة الإعدادات (طلب المالك 2026-09-20: ترس القائمة كالتطبيق الأول) — ترسٌ في القائمة والحبّة يفتح صفّي mrow', () => {
    // الترس في رأس القائمة — والقائمة نفسها بخيارَيها لم تتمسّ
    expect(n).toContain('<button class="gear" id="menuGear" type="button" title="الإعدادات"')
    expect(n).toContain('id="pillzGear"')
    expect(n).toContain('<button class="cap-btn primary" id="btnCap" type="button"><b>التقاط</b></button>')
    expect(n).toContain('.menu-head .gear {')
    // صفّا mrow من المرجع: الربط بحالةٍ حيّة، وإنهاء التطبيق بالأحمر الوظيفيّ
    expect(n).toContain('id="settingsBox"')
    expect(n).toContain('<button class="mrow" id="rowLink" type="button">')
    expect(n).toContain('<span class="st" id="linkState">…</span>')
    expect(n).toContain('<button class="mrow danger" id="rowExit" type="button">')
    expect(n).toContain('إنهاء التطبيق')
    expect(n).toContain('.mrow .st {')
    expect(n).toContain('.mrow.danger:hover {')
  })

  it('بطاقة الحساب بحالاتها الثلاث (تصميم المالك المعتمد) — والرمز السرّي لا يعبر أبدًا', () => {
    expect(n).toContain('id="accountBox"')
    expect(n).toContain('id="pairCode"')
    expect(n).toContain('data-show="unpaired"')
    expect(n).toContain('data-show="pairing"')
    expect(n).toContain('data-show="paired"')
    expect(n).toContain('id="btnPair"')
    expect(n).toContain('id="btnOpenVerify"')
    expect(n).toContain('id="btnForget"')
    expect(n).toContain('ربط هذا الجهاز')
    expect(n).toContain('فتح صفحة الموافقة')
    expect(n).toContain('فك الربط')
    expect(n).toContain('.acct .pcode {')
    expect(n).toContain('letter-spacing: 3px')
    // الحالة تُرسم عبر data-phase من مرآة المتحكّم
    expect(main).toContain('document.body.dataset.phase = authSnapshot.phase')
    expect(main).toContain('authSnapshot = p.auth ?? { phase: ')
  })

  it('مصادقة المتحكّم والإغلاق الرسميّ: pairStart/openVerify/forget وapp_exit عبر الجسر', () => {
    expect(main).toContain('const desktopAuth = createDesktopAuth()')
    expect(main).toContain("await controller.pairStart()")
    expect(main).toContain('void appCtl.exit()')
    expect(main).toContain('if (authState.phase === \'unpaired\') await controller.pairStart()')
    expect(main).toContain("apply('settings')")
  })
})

describe('main.ts: حصاةٌ مصدرَ حقيقةٍ تُصدر الأوامر، ومنبثقةٌ تعرض وتردّ — صفر invoke', () => {
  const main = readFileSync(join(here, 'main.ts'), 'utf8')

  it('لا يستدعي أيّ أمر Rust إطلاقًا (واجهة فقط — لا أسلاك تشغيل)', () => {
    expect(main).not.toMatch(/invoke\s*(?:<[^>]*>)?\s*\(/)
    expect(main).not.toContain('set_window_layout')
  })

  it('الفرع بنافذتي Tauri: main مصدرُ الحقيقة وpopout عارضة البطاقات', () => {
    expect(main).toContain("win.label === 'main'")
    expect(main).toContain("document.body.dataset.win = isPebble ? 'main' : 'popout'")
    expect(main).toContain("emit('widget-popout'")
    expect(main).toContain("listen('widget-popout'")
    expect(main).toContain("listen('widget-state'")
    expect(main).toContain("emit('widget-state'")
  })

  it('الحصاة تنبثق وتخفي بالتناوب: شريطٌ في الجلسة، وعجلات التدريب أول جولتين ثم القائمة', () => {
    expect(main).toContain('function togglePopout()')
    expect(main).toContain('function hidePopout()')
    expect(main).toContain("session ? 'strip' : idleForm()")
    expect(main).toContain("tours < 2 ? 'pillz' : 'menu'")
    expect(main).toContain('itqan.widget.tours')
    expect(main).toContain('popoutAbove(')
    expect(main).toContain('POPOUT_SIZES[')
  })

  it('أزرار المنبثقة كلها مربوطة: الخياران والإيقاف والإلغاء والميك والإنهاء — والميك يخفي القائمة', () => {
    expect(main).toContain("'btnCap', 'btnCapV'")
    expect(main).toContain("'stripPause'")
    expect(main).toContain("'stripCancel'")
    expect(main).toContain("'stripMic'")
    expect(main).toContain("'stripFinish'")
    expect(main).toContain("'chipPaused'")
    expect(main).toContain("'btnYes'")
    expect(main).toContain("'btnNo'")
    // المرحلة ٢: الميك قرار صوتٍ يمرّ للمتحكّم لا شعارًا محليًّا
    expect(main).toContain('voiceToggle: true')
    expect(main).toContain('hideSelf()')
    expect(main).toContain('stopPropagation()')
  })

  it('مسار الإنهاء الحقيقيّ: البناء يجري بينما يرفع تنسيقُ التسليم، والتوست عند الوصول فقط وغير المقترن يُدعى للربط', () => {
    expect(main).toContain("emit('widget-state', { finish: true })")
    expect(main).toContain('void controller.finish()')
    expect(main).toContain('if (e.arrived)')
    expect(main).toContain("else if (e.t === 'pairing-needed')")
    expect(main).toContain("if (form !== 'toast') return")
    expect(main).toContain('}, 3400)')
  })

  it('لغة الحصاة تبثّ للمنبثقة: الإيقاف يعلن حالته والصوت يرتدّ من المتحكّم — والنقر أثناء الإيقاف يُستأنف', () => {
    expect(main).toContain("void emit('widget-state', { paused: true })")
    expect(main).toContain("void emit('widget-state', { voice: e.on })")
    expect(main).toContain('void emit(\'widget-state\', { paused: false })')
    expect(main).toContain('if (paused) {')
  })

  it('السحب >٦px ينقل الحصاة فيخفي المنبثقة أولًا — والنقرة بعد السحب ميتة', () => {
    expect(main).toContain('startDragging()')
    expect(main).toContain('hidePopout()')
    expect(main).toContain('if (dragged) return')
    expect(main).toContain('> 6')
  })

  it('الموضع يُحفظ ويُسترجع على مقاس المربع', () => {
    expect(main).toContain('restorePlacement')
    expect(main).toContain('trackPlacement')
    expect(main).toContain('SQUARE_SIZE')
  })
})

describe('الإشارة الفوريّة ونقر الحصاة أثناء الالتقاط (بلاغ المالك 2026-09-19: «لا ينتظر المستخدم ولا تتشكك»)', () => {
  it('اللقطة والتوست محيطيّان: نقر الحصاة عليهما يستبدلهما بالبطاقة المقصودة لا يخفيهما — فالقائمة تظهر دائمًا', () => {
    // البلاغ: النقر أثناء الالتقاط كان يخفي اللقطة المفتوحة فيبدو كأن القائمة لا تظهر،
    // ثم تقفز لقطة الخطوة التالية متأخرة فيبدو كأن النقر «يحسب لقطة»
    expect(main).toContain("if (openForm === 'flash' || openForm === 'toast')")
    // `cardYield` حلّ محلّ علم `pendingCapture`: الآلة تُسلّم مكانها لبطاقة
    // المستخدم وتحفظ أيّ تعليقٍ جارٍ — بدل علمٍ في الواجهة لا يعرف عن الصوت شيئًا
    expect(main).toContain('controller.cardYield()\n        void openPopout()')
    // بطاقة المستخدم (قائمة/شريط/حساب…) تظل بالتناوب كالمرجع
    expect(main).toContain('hidePopout()\n      return\n    }\n    void openPopout()')
  })

  // مواصفة 2026-09-30: الواجهة **ترسم** ولا تقرّر. توزُّعُ قرار البطاقة على
  // ثلاثة أماكن (أعلامٌ هنا · مؤقّتٌ في المنبثقة · صوتٌ في المتحكّم) هو ما جعل
  // نقرةً ثانية قبل ذوبان الأولى تبدو ضائعة — والقرار كلّه في الآلة الآن
  it('البطاقة حدثٌ واحد يُرسم: main.ts بلا أعلام قرارٍ خاصّة بها', () => {
    expect(main).toContain("e.t === 'card'")
    // الأعلام الثلاثة القديمة ماتت — لا قرار في الواجهة
    expect(main).not.toContain('pendingCapture')
    expect(main).not.toContain("e.t === 'capturing'")
    expect(main).not.toContain("e.t === 'dropped'")
  })

  it('البطاقة تُستبدل فورًا بلقطةٍ أحدث — الآلة تملك الانتقال لا الواجهة', () => {
    const fc = readFileSync(join(here, 'recorder', 'flash-card.ts'), 'utf8')
    // الحالات الأربع بأسمائها، والمهلة تُلغى عند كل التقاطٍ جديد
    for (const s of ["'idle'", "'pending'", "'shown'", "'recording'"]) {
      expect(fc).toContain(s)
    }
    expect(fc).toContain('saveIfRecording')
  })

  // علّة العلامة الغائبة (بلاغ المالك 2026-09-30): الحلقة كانت تُوضع بضرب
  // إحداثيّ الشاشة الكاملة (1920) في مقياس المصغّرة (~480) فتقع مئات البكسلات
  // خارج صندوق اللقطة (`overflow:hidden`) فلا تُرى قطّ. النِّسَب المئويّة من
  // النواة تُضرب في **الصورة المعروضة** فتصيب مهما اختلفت الدقّة
  it('حلقة العلامة تُوضع من نِسَب الإطار على الصورة المعروضة — لا بكسلات خامًا', () => {
    // لا ضربَ إحداثيّ بكسل في مقياس المصغّرة بعد اليوم
    expect(main).not.toContain('(m.x + m.w / 2) * scale')
    // النِّسَب تُضرب في أبعاد الصورة كما رُسمت (rw/rh)
    expect(main).toContain('(m.left + m.width / 2) / 100) * rw')
    expect(main).toContain('(m.top + m.height / 2) / 100) * rh')
  })

  it('حدٌّ أدنى لقطر الحلقة كي تبقى مرئيّة: ٤٨px على شاشة 1920 داخل صندوق ٢٣٦ تصير ٦px', () => {
    expect(main).toContain('RING_MIN_PX')
    expect(main).toContain('Math.max(')
  })

  it('بطاقة الانتظار في المنبثقة: صندوق اللقطة ينبض مصمتًا بلا بكسلات (تكييف WDA) ثم تمتلئ', () => {
    expect(html).toContain('.flash .shot.wait')
    expect(html).toContain('@keyframes shotwait')
    expect(main).toContain("shotBox.classList.toggle('wait', pending || !shot)")
    // الرقم يظهر من لحظة القفز كما طلب المالك («يظهر فيها مثلا رقم اللقطة»)
    expect(main).toContain("t('dt.stepN', { n: arDigits(step) })")
  })

  // ميك الخطوة على البطاقة (طلب المالك 2026-09-30): «زر المايك اسفل اشعار
  // الشاشة الملتقطة، وعند التسجيل يظهر نفس الانميشن الذي في اضافة الكروم»
  // ثم صار صفًّا **واحدًا** بطلبه 2026-09-30/ب: «زر التعليق الصوتي ليس كلمة
  // بل مايك، واجعل سطر الأزرار سطرًا واحدًا أسفل شاشة الإشعار به زر إلغاء
  // وتسجيل ورقم اللقطة، وعند الضغط على المايك تظهر أزرار التحكّم في التسجيل»
  it('صفٌّ واحد أسفل اللقطة: رقمها · مايكٌ أيقونةً · إلغاء — وأثناء التسجيل زرّاه', () => {
    const n = norm(html)
    expect(n).toContain('id="flashMic"')
    expect(n).toContain('id="flashStop"')
    expect(n).toContain('id="flashCancel"')
    // الثلاثة مع الرقم و«تراجع» في `frow` وحدها — لا صفَّ `mrow` ثانٍ في البطاقة
    const frow = n.slice(n.indexOf('<div class="frow">'), n.indexOf('</div>', n.indexOf('id="btnUndo"')))
    for (const id of ['flashStep', 'flashMic', 'flashStop', 'flashCancel', 'btnUndo'])
      expect(frow).toContain(`id="${id}"`)
    expect(n).not.toContain('<div class="mrow">')
    // أيقونةٌ بلا كلمة: لا عنصرَ نصٍّ داخل الزرّ، والاسم في تلميح i18n
    expect(n).not.toContain('flashMicLabel')
    expect(readFileSync(join(here, 'i18n.ts'), 'utf8')).toContain(
      "['#flashBox #flashMic', 'title', 'dt.memoAdd']",
    )
    // ضغطُها يعود بالقناة القائمة إلى المتحكّم — لا آليّة جديدة
    expect(main).toContain("emit('widget-state', { micToggle: true })")
    expect(main).toContain("emit('widget-state', { memoCancel: true })")
    expect(main).toContain('controller.cardMic()')
    expect(main).toContain('controller.cardCancelMemo()')
  })

  it('موجة التسجيل منقولة من الإضافة كما هي: transform وحده بلا rAF', () => {
    const n = norm(html)
    expect(n).toContain('memo-wave')
    expect(n).toContain('@keyframes dl-memo-wave')
    expect(n).toContain('transform: scaleY(.22)')
    // التأخير السالب المتدرّج هو ما يصنع سفر الموجة أفقيًّا
    expect(n).toContain('animation-delay: calc(var(--i) * -85ms)')
  })
  const main = readFileSync(join(here, 'main.ts'), 'utf8')
  const html = readHtml()
})

describe('expand.ts: عقد المنبثقة — تحاذاة يمنى وفجوة ١٢ فوق الحصاة', () => {
  const src = readFileSync(join(here, 'recorder', 'expand.ts'), 'utf8')
  const test = readFileSync(join(here, 'recorder', 'expand.test.ts'), 'utf8')

  it('مقاسات البطاقات الستّ ورياضيّات التثبيت محرودة بالاختبارات', () => {
    expect(src).toContain('SQUARE_SIZE = { w: 44, h: 44 }')
    expect(src).toContain('menu: { w: 246, h: 152 }')
    expect(src).toContain('strip: { w: 48, h: 183 }')
    expect(src).toContain('chip: { w: 224, h: 30 }')
    expect(src).toContain('confirm: { w: 252, h: 150 }')
    expect(src).toContain('build: { w: 210, h: 60 }')
    expect(src).toContain('toast: { w: 224, h: 56 }')
    expect(src).toContain('GAP_ABOVE = 12')
    expect(src).toContain('export function popoutAbove(')
    expect(test).toContain('popoutAbove(')
    expect(test).toContain('1425')
    expect(test).toContain('657')
  })
})

describe('المرحلة ٢ — الصوت الحقيقي: الميك قرارٌ يعبر للمتحكّم والحالة ترتدّ صادقة', () => {
  const main = readFileSync(join(here, 'main.ts'), 'utf8')

  it('voiceToggle يمرّ من الشريط إلى متحكّم الحصاة — الواجهة صمّاء على مصدر الصوت', () => {
    expect(main).toContain('if (p.voiceToggle === true)')
    expect(main).toContain('void controller.toggleVoice()')
    // الحصاة تلتزم مرآتها من أحداث المتحكّم حصرًا وتصدّرها للمنبثقة
    expect(main).toContain("e.t === 'voice'")
    expect(main).toContain('voice = e.on')
    expect(main).toContain("void emit('widget-state', { voice: e.on })")
  })

  it('المنبثقة تستقبل صدى حالة الصوت فتحيا نقطةَ الميك في الشريط المفتوح', () => {
    expect(main).toContain("const p = e.payload as { steps?: number; voice?: boolean }")
    expect(main).toContain("if (typeof p.voice === 'boolean')")
  })
})

describe('حارس بطاقة البناء (بلاغ المالك 2026-09-19: «علق عند جارٍ بناء الدليل»)', () => {
  const main = readFileSync(join(here, 'main.ts'), 'utf8')

  it('البناء لا يعلق للأبد: ساهر ١٥ث يُنهي البطاقة بصدق وينصّ على الرفع الآجل', () => {
    expect(main).toContain('armFinishWatchdog()')
    expect(main).toContain('finishSettled = false')
    expect(main).toContain('}, 15000)')
    // حدث ended (وصول أو فشل صادق) يطفئ الساهر أولًا
    expect(main).toContain('finishSettled = true')
    expect(main).toContain('clearTimeout(finishWatchdog)')
    // التعثر: جلسة الواجهة تنتهي والبطاقة تُخفى — والدليل في الطابور يُرفع آجلًا
    expect(main).toContain("if (popoutOpen && openForm === 'build') void emit('widget-popout', { action: 'hide' })")
  })
})
