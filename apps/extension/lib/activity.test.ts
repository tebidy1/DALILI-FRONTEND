import { describe, expect, it } from 'vitest'
import { EVENTS_CAP, EVENTS_KEY, createActivity, normalizeEvents, unreadCount, type ActivityEvent } from './activity'

/**
 * زر الجرس (2026-09-10): سجل «ما يتطلب انتباهك» — الأحداث الحقيقية التي كانت تظهر
 * لافتةً عابرة وتختفي (مسودة بعد فشل نشر، فشل تفريغ، بلوغ الحد، تبويب يحتاج F5)
 * تُجمع محليًا: الأحدث أولًا، سقف ثابت، وعلم «مقروء» يقود شارة الجرس.
 */

function world(seed: unknown[] = []) {
  const store: Record<string, unknown> = { [EVENTS_KEY]: seed }
  let tick = 1_000
  let n = 0
  const activity = createActivity({
    get: async (k) => ({ [k]: store[k] }),
    set: async (obj) => {
      Object.assign(store, obj)
    },
    now: () => (tick += 1_000),
    id: () => `e${++n}`,
  })
  return { activity, store: () => store[EVENTS_KEY] as ActivityEvent[] }
}

describe('normalizeEvents — تخزين غريب لا يكسر اللوحة', () => {
  it('غير المصفوفة أو العناصر الناقصة تُهمل بصمت', () => {
    expect(normalizeEvents(undefined)).toEqual([])
    expect(normalizeEvents('x')).toEqual([])
    expect(normalizeEvents([{ id: 'a' }, null, 7])).toEqual([])
  })

  it('الحدث السليم يمرّ وread الناقص يُقرأ غير مقروء', () => {
    const got = normalizeEvents([{ id: 'a', kind: 'draft', textAr: 'مسودة', ts: 5 }])
    expect(got).toEqual([{ id: 'a', kind: 'draft', textAr: 'مسودة', ts: 5, read: false }])
  })
})

describe('createActivity.push — الأحدث أولًا وبسقف', () => {
  it('يضيف الحدث الجديد في المقدمة غيرَ مقروء ويحفظه', async () => {
    const w = world()
    await w.activity.push('draft', 'دليلك محفوظ مسودة')
    await w.activity.push('limit', 'بلغت الحد')
    const list = w.store()
    expect(list.map((e) => e.kind)).toEqual(['limit', 'draft'])
    expect(list[0]).toMatchObject({ id: 'e2', textAr: 'بلغت الحد', read: false })
    expect(list[0]!.ts).toBeGreaterThan(list[1]!.ts)
  })

  it(`يقصّ الأقدم فوق السقف ${EVENTS_CAP}`, async () => {
    const w = world()
    for (let i = 0; i < EVENTS_CAP + 3; i++) await w.activity.push('tab', `حدث ${i}`)
    const list = w.store()
    expect(list).toHaveLength(EVENTS_CAP)
    expect(list[0]!.textAr).toBe(`حدث ${EVENTS_CAP + 2}`)
    expect(list.at(-1)?.textAr).toBe('حدث 3')
  })

  it('المرحلة ٣: الحدث يحمل رابط الحل (href) ويبقى بعد التخزين والقراءة', async () => {
    const w = world()
    await w.activity.push('stt', 'تعذّر تفريغ التعليقات — أعد المحاولة من المحرر', 'http://localhost:5174/g/g9')
    const list = w.store()
    expect(list[0]!.href).toBe('http://localhost:5174/g/g9')
    // الحدث بلا رابط يبقى بلا رابط — لا حقل زائف
    await w.activity.push('limit', 'بلغت الحد')
    const after = w.store()
    expect(after[0]!.href).toBeUndefined()
  })

  it('نوع publish مقبول — النشر الناجح مرجع دائم في الجرس برابط الدليل', async () => {
    const w = world()
    await w.activity.push('publish', 'نُشر دليلك بنجاح — افتحه متى شئت', 'http://localhost:5174/g/g9')
    const list = w.store()
    expect(list[0]).toMatchObject({ kind: 'publish', href: 'http://localhost:5174/g/g9', read: false })
  })

  it('تكرار الحدث نفسه وهو ما زال غير مقروء يحدّث وقته بدل تكديس نسخ', async () => {
    const w = world()
    await w.activity.push('tab', 'تبويب يحتاج F5')
    await w.activity.push('tab', 'تبويب يحتاج F5')
    const list = w.store()
    expect(list).toHaveLength(1)
    expect(list[0]!.ts).toBe(3_000)
  })

  it('الحدث نفسه بعد قراءته يظهر من جديد غيرَ مقروء (وقوع جديد يستحق شارة)', async () => {
    const w = world()
    await w.activity.push('draft', 'مسودة')
    await w.activity.markAllRead()
    await w.activity.push('draft', 'مسودة')
    const list = w.store()
    expect(list).toHaveLength(2)
    expect(list[0]!.read).toBe(false)
    expect(list[1]!.read).toBe(true)
  })
})

describe('القراءة والشارة', () => {
  it('list يعيد المخزَّن مطبَّعًا', async () => {
    const w = world([{ id: 'a', kind: 'stt', textAr: 'فشل التفريغ', ts: 1 }, 'قمامة'])
    expect(await w.activity.list()).toEqual([{ id: 'a', kind: 'stt', textAr: 'فشل التفريغ', ts: 1, read: false }])
  })

  it('unreadCount يعدّ غير المقروء فقط', () => {
    const evs = normalizeEvents([
      { id: 'a', kind: 'draft', textAr: 'x', ts: 1, read: true },
      { id: 'b', kind: 'draft', textAr: 'y', ts: 2 },
      { id: 'c', kind: 'limit', textAr: 'z', ts: 3, read: false },
    ])
    expect(unreadCount(evs)).toBe(2)
  })

  it('markAllRead يعلّم الكل مقروءًا ويحفظ — فتح الجرس يطفئ الشارة', async () => {
    const w = world()
    await w.activity.push('draft', 'أ')
    await w.activity.push('stt', 'ب')
    const after = await w.activity.markAllRead()
    expect(after.every((e) => e.read)).toBe(true)
    expect(unreadCount(w.store())).toBe(0)
  })
})
