import { describe, expect, it } from 'vitest'
import { migrateGuide, primarySourceOf, siteLabel, type DesktopFacts } from '@dalili/core'
import { zGuide } from '@dalili/shared'
import fixture from './__fixtures__/excel-session.json'
import { createRecorderSession, type Bridge, type FramePickResult } from './session'

/** ٣ج-٣ — القبول بالمحاكاة: fixture «مسجَّل» (مكتوب يدويًّا على عقد §٣.٢ — التصريح
 *  داخل الملفّ نفسه) يُمرَّر عبر الجلسة نفسها التي ستغذّيها المستشعرات الحيّة:
 *  أحداث input/facts/tick بترتيبها الزمني، وframe_pick/facts_refresh من خرائط
 *  الـfixture. الناتج دليل v2 يمرّ zGuide ويثبت أمام migrateGuide — بلا شبكة
 *  ولا مؤقّتات: الساعة من نبضات الـfixture حصرًا. */

interface FixtureShape {
  declared: string
  monitor: { x: number; y: number; w: number; h: number; dpi: number }
  picks: Record<string, FramePickResult>
  refresh: Record<string, unknown>
  events: Array<Record<string, unknown>>
}

const fx = fixture as unknown as FixtureShape

/** جسر المُشغِّل: يخدم الأطر والخرائط ويسجّل النداءات بترتيبها */
function replayBridge() {
  const handlers = new Map<string, Array<(p: unknown) => void>>()
  const picks: Array<{ seq: number; which: string }> = []
  const refreshCalls: number[] = []
  const blurCalls: Array<{ localId: string; rects: Array<{ x: number; y: number; w: number; h: number }> }> = []
  const bridge: Bridge = {
    listen(evt, cb) {
      const list = handlers.get(evt) ?? []
      list.push(cb)
      handlers.set(evt, list)
      return () => {}
    },
    async invoke(_cmd, args) {
      picks.push({ seq: args.seq, which: args.which })
      const p = fx.picks[String(args.seq)]
      if (!p) throw new Error(`لا إطار مخزَّن للـseq ${args.seq}`)
      return structuredClone(p)
    },
    async factsRefresh(seq) {
      refreshCalls.push(seq)
      return (fx.refresh[String(seq)] as DesktopFacts | { seq: number; error: string }) ?? null
    },
    async frameBlur(localId, rects) {
      blurCalls.push({ localId, rects })
    },
  }
  const emit = (evt: string, p: unknown) => {
    for (const cb of handlers.get(evt) ?? []) cb(p)
  }
  return { bridge, emit, picks, refreshCalls, blurCalls }
}

/** توجيه أحداث الـfixture حسب شكل السلك: kind ⇐ input، وseq ⇐ facts، وإلّا tick */
function replay(emit: (evt: string, p: unknown) => void) {
  for (const e of fx.events) {
    const v = e as Record<string, unknown>
    if (v.kind === 'down' || v.kind === 'up' || v.kind === 'key') emit('sensor://input', e)
    else if (typeof v.seq === 'number') emit('sensor://facts', e)
    else emit('sensor://tick', e)
  }
}

describe('٣ج-٣ — القبول بالمحاكاة: fixture مسجَّل ⇐ دليل يمرّ zGuide', () => {
  it('مشهد Excel المعلَن يُبنى جلسةً ويخرج دليل v2 صالحًا مستقرًّا أمام الترحيل', async () => {
    const { bridge, emit, picks, refreshCalls, blurCalls } = replayBridge()
    const session = createRecorderSession(bridge)
    replay(emit)
    const guide = await session.stop()

    // العقد النهائيّ: الدليل يمرّ zGuide
    const parsed = zGuide.safeParse(guide)
    if (!parsed.success) console.error('[accept] zGuide issues:', JSON.stringify(parsed.error.issues, null, 2))
    expect(parsed.success).toBe(true)

    // تسلسل الأنواع: تبويب · تبديل نافذة · خليّة · تبويب · زرّ · كتابة بقيمة ·
    // اختيار قائمة · حوار + حقل سرّ (٩ خطوات، أول navigate عنوانها Book1)
    expect(guide.steps.map((s) => s.kind)).toEqual([
      'click',
      'navigate',
      'click',
      'click',
      'click',
      'input',
      'select',
      'navigate',
      'input',
    ])

    // الهويّة والعنوان العربيّ من مصدر الديسكتوب
    expect(guide.title).toBe('دليل: Book1 - Excel')
    expect(primarySourceOf(guide.steps)).toBe('app:EXCEL.EXE')
    expect(siteLabel(primarySourceOf(guide.steps))).toBe('Excel')

    // كل نقرة مرساتها automationId أوّلًا (حيث توفّر في الحقائق)
    for (const s of guide.steps) {
      if (s.kind === 'click') expect(s.target.anchor?.[0]?.k).toBe('automationId')
    }

    // القيمة النهائيّة للحقل من facts_refresh لا قيمة ما قبل الكتابة ('')
    expect(guide.steps[5]!.value).toBe('B2')
    expect(guide.steps[5]!.title).toBe('في حقل «مربع الاسم» أدخل «B2»')
    expect(refreshCalls).toEqual([5])

    // اختيار القائمة بقيمتها
    expect(guide.steps[6]!.value).toBe('Arial')
    expect(guide.steps[6]!.title).toBe('اختر «Arial» من قائمة «الخط»')

    // السرّ: حسّاس بلا قيمة مهما حدث — وبلا نداء refresh أصلًا، ولقطته محروقة
    // على الجهاز (٣ج-٤): مستطيل العنصر ببكسل الصورة + autoBlurred بعقد ScreenshotMeta
    const pwd = guide.steps[8]!
    expect(pwd.sensitive).toBe(true)
    expect(pwd.value).toBeUndefined()
    expect(pwd.title).toBe('في حقل «كلمة السرّ» أدخل قيمة سرية')
    expect(pwd.screenshot).toMatchObject({
      blurRects: [{ x: 120, y: 150, w: 220, h: 30 }],
      autoBlurred: true,
    })
    expect(blurCalls).toEqual([{ localId: 'frame-10', rects: [{ x: 120, y: 150, w: 220, h: 30 }] }])
    // وكل اللقطات غير الحسّاسة بلا طمس (خطوات navigate بلا لقطة أصلًا)
    for (const [i, s] of guide.steps.entries()) {
      if (i !== 8 && s.screenshot && !('missing' in s.screenshot)) {
        expect(s.screenshot).toMatchObject({ blurRects: [] })
      }
    }

    // سياسة اللقطة before/after بترتيب الإيماءات (DataItem مجهولة السياسة ⇐ before)
    expect(picks).toEqual([
      { seq: 1, which: 'before' },
      { seq: 2, which: 'before' },
      { seq: 3, which: 'before' },
      { seq: 4, which: 'before' },
      { seq: 5, which: 'after' },
      { seq: 9, which: 'after' },
      { seq: 10, which: 'after' },
    ])

    // علامة الإبراز على نقرة التبويب: مستطيل العنصر الفيزيائي نفسه (شاشة الأصل 0,0)
    expect(guide.steps[3]!.screenshot).toMatchObject({
      fileId: 'frame-3',
      mark: { rect: { x: 170, y: 90, w: 90, h: 33 }, color: '#ea580c' },
    })

    // ثبات أمام الترحيل — نفس حارس النواة القائم
    expect(migrateGuide(structuredClone(guide))).toEqual(guide)
  })
})
