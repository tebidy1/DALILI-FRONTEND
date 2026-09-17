import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, it, expect } from 'vitest'

// بوّابة قشرة الودجة العائمة (٣هـ-١): قيم النافذة مثبّتة في الإعداد —
// انعكاس أيّ قيمة منها يكسر الودجة (تسقط من الطفو أو تظهر بالإطار
// أو تعود لمكتب المهام فتراها لقطات المستخدم نافذةً عاديّة)
const here = fileURLToPath(new URL('.', import.meta.url))

describe('قشرة الودجة العائمة (٣هـ-١)', () => {
  const conf = JSON.parse(
    readFileSync(join(here, '..', 'src-tauri', 'tauri.conf.json'), 'utf8'),
  ) as {
    app: { windows: Array<Record<string, unknown>> }
  }
  const win = conf.app.windows[0]!

  it('النافذة الوحيدة ودجة: بلا إطار، عائمة دائمًا، غير قابلة للتحجيم، خارج مكتب المهام', () => {
    expect(conf.app.windows).toHaveLength(1)
    expect(win.decorations).toBe(false)
    expect(win.alwaysOnTop).toBe(true)
    expect(win.resizable).toBe(false)
    expect(win.skipTaskbar).toBe(true)
    expect(win.fullscreen).toBe(false)
  })

  it('أبعاد الودجة الصغيرة 320×72', () => {
    expect(win.width).toBe(320)
    expect(win.height).toBe(72)
  })

  it('الشفافية مفعّلة في الإعداد — الزجاج (قرار المالك) يتطلّب نافذة شفّافة', () => {
    expect(win.transparent).toBe(true)
  })

  it('منطقة السحب data-tauri-drag-region على جذر القشرة', () => {
    const html = readFileSync(join(here, '..', 'index.html'), 'utf8')
    expect(html).toContain('data-tauri-drag-region')
  })

  // السحب الفعلي (طلب المالك ٢٠٢٦-٠٩-١٧): بلا هذه الصلاحية تُرفض نداءات
  // start_dragging صامتةً فتبقى الودجة ملزوقة بمكانها مهما سُحبت
  it('صلاحية السحب core:window:allow-start-dragging مركّبة في القدرات', () => {
    const caps = JSON.parse(
      readFileSync(join(here, '..', 'src-tauri', 'capabilities', 'default.json'), 'utf8'),
    ) as { permissions: string[] }
    expect(caps.permissions).toContain('core:window:allow-start-dragging')
  })

  // النقر المزدوج على سطح السحب لا يجوز أن يكبّر ودجةً عائمة (تكبير يفسد
  // مقاس الحبة ٣٢٠×٧٢ والزجاج) — maximizable:false يحسم سلوك السمة المدمجة
  it('الودجة غير قابلة للتكبير (maximizable:false)', () => {
    expect(win.maximizable).toBe(false)
  })

  // زر الترس أيقونة SVG حقيقية لا رمز نصّي — يُقرأ «إعدادات» من النظرة الأولى
  it('زر الترس أيقونة إعدادات SVG', () => {
    const html = readFileSync(join(here, '..', 'index.html'), 'utf8')
    expect(html).toMatch(/id="gearBtn"[\s\S]*?<svg/)
  })

  // قائمة الإعدادات تنتهي بزر «إنهاء التطبيق» — الخروج الكامل من الودجة
  it('قائمة الإعدادات فيها زر إنهاء التطبيق (id=exitBtn)', () => {
    const html = readFileSync(join(here, '..', 'index.html'), 'utf8')
    expect(html).toContain('id="exitBtn"')
    expect(html).toContain('إنهاء التطبيق')
  })

  // انحدار حاسم (٢٠٢٦-٠٩-١٧): الحبة واللوحة تستعملان `display:flex`، وهي
  // تساوي محدّد المتصفّح `[hidden]{display:none}` وتأتي بعده فتغلبه — فلا
  // تُخفي خاصيّةُ hidden الحبةَ في وضع التسجيل، وتُسحق اللوحة لشريط. لا بدّ
  // من قاعدة تجعل hidden آمرًا، وإلا عادت علّة «تتمدّد النافذة ولا يظهر شيء».
  it('خاصيّة hidden تحجب فعلًا رغم قواعد display اللاحقة (`[hidden]{display:none!important}`)', () => {
    const html = readFileSync(join(here, '..', 'index.html'), 'utf8')
    const normalized = html.replace(/\s+/g, ' ')
    expect(normalized).toMatch(/\[hidden\]\s*\{\s*display:\s*none\s*!important;?\s*\}/)
  })
})

// تكافؤ شريط التسجيل مع الإضافة (المرحلة ١): الأزرار في الأسفل بترتيب
// الإضافة (إيقاف · طمس · إلغاء) ثم إنهاء عريض، والطمس معطَّل بقصّته
// الصادقة — المستخدم لا يفكّر (طلب المالك ٢٠٢٦-٠٩-١٧)
describe('تكافؤ شريط التسجيل مع الإضافة (المرحلة ١)', () => {
  const html = readFileSync(join(here, '..', 'index.html'), 'utf8')
  const norm = html.replace(/\s+/g, ' ')

  it('زر الطمس موجود ومعطَّل بتلميح «يعمل تلقائيًّا»', () => {
    expect(norm).toMatch(/id="blurBtn"[^>]*\bdisabled\b/)
    expect(norm).toContain('الطمس يعمل تلقائيًّا')
  })

  it('ترتيب أدوات الشريط: إيقاف ثم طمس ثم إلغاء (نمط الإضافة)', () => {
    const iPause = norm.indexOf('id="pauseBtn"')
    const iBlur = norm.indexOf('id="blurBtn"')
    const iCancel = norm.indexOf('id="cancelBtn"')
    expect(iPause).toBeGreaterThan(-1)
    expect(iPause).toBeLessThan(iBlur)
    expect(iBlur).toBeLessThan(iCancel)
  })

  it('قائمة الخطوات فوق شريط التحكّم (steps قبل capbar في DOM)', () => {
    expect(norm.indexOf('id="steps"')).toBeLessThan(norm.indexOf('class="capbar"'))
  })

  it('زر الإنهاء عريض في الشريط السفليّ (cap-finish)', () => {
    expect(norm).toMatch(/class="[^"]*cap-finish[^"]*"[^>]*id="finishBtn"|id="finishBtn"[^>]*class="[^"]*cap-finish/)
  })
})
