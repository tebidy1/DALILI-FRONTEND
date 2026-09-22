import { describe, expect, it } from 'vitest'
import { capabilities, capsPanel } from './capabilities'

/** CAP-19: تدهور معلن لا صامت — ما يعمل وما لا يعمل على سطح الامتداد اليوم */
describe('capabilities', () => {
  const caps = capabilities()

  it('الالتقاط والطمس المباشر والتعليم متاحة', () => {
    expect(caps.find((c) => c.id === 'capture')?.ok).toBe(true)
    expect(caps.find((c) => c.id === 'manualBlur')?.ok).toBe(true)
    expect(caps.find((c) => c.id === 'marker')?.ok).toBe(true)
  })

  it('الصوت متاح (VOX P2) وتطبيقات سطح المكتب والإرشاد معلنة غير متاحة مع مرحلتها', () => {
    const voice = caps.find((c) => c.id === 'voice')
    expect(voice?.ok).toBe(true)
    expect(voice?.label).toBeTruthy()

    const desktop = caps.find((c) => c.id === 'desktopApps')
    expect(desktop?.ok).toBe(false)

    const guideMe = caps.find((c) => c.id === 'guideMe')
    expect(guideMe?.ok).toBe(false)
  })

  it('كل بند له عنوان عربي — القائمة تُعرض كما هي للمستخدم', () => {
    for (const c of caps) {
      expect(c.label.length).toBeGreaterThan(3)
    }
  })
})

/** CAP-19 (بلاغ المالك 2026-08-30: «لم أفهم القصد منها»): عنوان يشرح الغرض + مفتاح رموز */
describe('نصوص لوحة القدرات — مفهومة بلا شرح خارجي', () => {
  it('العنوان يجيب «ماذا أفعل بهذه القائمة؟» — يذكر المفعّل والقادم معًا', () => {
    expect(capsPanel().title).toContain('الآن')
    expect(capsPanel().title).toContain('لاحق')
  })

  it('المفتاح يفسّر الرمزين للمستخدم: ✓ يعمل — و— قادم', () => {
    expect(capsPanel().legend).toContain('✓')
    expect(capsPanel().legend).toContain('—')
    expect(capsPanel().legend.length).toBeGreaterThan(20)
  })

  it('سطر تمهيدي يوضح أن القائمة خطة صادقة لا رسالة خطأ', () => {
    expect(capsPanel().intro.length).toBeGreaterThan(20)
  })
})
