import { describe, expect, it } from 'vitest'
import { creatorsOf, EMPTY_FILTERS, hasActiveFilters, searchGuides, type SearchRow } from './search'

const row = (id: string, over: Partial<SearchRow> = {}): SearchRow => ({
  id,
  title: `دليل ${id}`,
  updatedAt: '2026-10-01T00:00:00.000Z',
  ...over,
})

const rows: SearchRow[] = [
  row('a', { title: 'إصدار فاتورة', readerCount: 1, creatorName: 'سارة', updatedAt: '2026-10-05T00:00:00.000Z' }),
  row('b', { title: 'أمر شراء', pinned: true, creatorName: 'خالد' }),
  row('c', { title: 'طلب إجازة', fresh: 'updated', readerCount: 2, creatorName: 'سارة' }),
  row('d', { title: 'تسوية المخزون', readerCount: 5, creatorName: 'خالد', updatedAt: '2026-09-01T00:00:00.000Z' }),
  row('e', { title: 'فاتورة مورد', fresh: 'new', creatorName: 'منى', updatedAt: '2026-10-10T00:00:00.000Z' }),
]
const ids = (list: SearchRow[]) => list.map((g) => g.id)

describe('بحث اللوحة — ترتيب وفلاتر', () => {
  it('«الأنسب»: المهم ثم غير المقروء ثم الأكثر قراءة ثم الأحدث (كترتيب الخادم)', () => {
    expect(ids(searchGuides(rows, EMPTY_FILTERS))).toEqual(['b', 'c', 'e', 'd', 'a'])
  })

  it('«الأكثر قراءة» و«الأحدث» يتجاهلان الشارات', () => {
    expect(ids(searchGuides(rows, { ...EMPTY_FILTERS, sort: 'readers' }))).toEqual(['d', 'c', 'a', 'e', 'b'])
    expect(ids(searchGuides(rows, { ...EMPTY_FILTERS, sort: 'newest' }))).toEqual(['e', 'a', 'b', 'c', 'd'])
  })

  it('الكلمة تطابق العنوان بعد التطبيع العربي (الهمزة)', () => {
    expect(ids(searchGuides(rows, { ...EMPTY_FILTERS, query: 'اصدار' }))).toEqual(['a'])
    expect(ids(searchGuides(rows, { ...EMPTY_FILTERS, query: 'فاتورة' }))).toEqual(['e', 'a'])
  })

  it('شارات الحالة تجمع بـ«أو»: المهم أو الجديد أو المحدّث', () => {
    expect(ids(searchGuides(rows, { ...EMPTY_FILTERS, status: ['pinned'] }))).toEqual(['b'])
    expect(ids(searchGuides(rows, { ...EMPTY_FILTERS, status: ['new', 'updated'] }))).toEqual(['c', 'e'])
  })

  it('فلتر المنشئ يجتمع مع الكلمة والحالة بـ«و»', () => {
    expect(ids(searchGuides(rows, { ...EMPTY_FILTERS, creator: 'سارة' }))).toEqual(['c', 'a'])
    expect(ids(searchGuides(rows, { ...EMPTY_FILTERS, creator: 'سارة', status: ['updated'] }))).toEqual(['c'])
    expect(ids(searchGuides(rows, { ...EMPTY_FILTERS, creator: 'منى', query: 'شراء' }))).toEqual([])
  })

  it('المنشئون بلا تكرار وبترتيب أبجدي، ومن لا اسم له لا يظهر', () => {
    expect(creatorsOf([...rows, row('f')])).toEqual(['خالد', 'سارة', 'منى'])
  })

  it('الفلاتر النشطة: الكلمة وحدها ليست فلترًا، والترتيب غير الافتراضي فلتر', () => {
    expect(hasActiveFilters(EMPTY_FILTERS)).toBe(false)
    expect(hasActiveFilters({ ...EMPTY_FILTERS, query: 'x' })).toBe(false)
    expect(hasActiveFilters({ ...EMPTY_FILTERS, status: ['new'] })).toBe(true)
    expect(hasActiveFilters({ ...EMPTY_FILTERS, creator: 'خالد' })).toBe(true)
    expect(hasActiveFilters({ ...EMPTY_FILTERS, sort: 'newest' })).toBe(true)
  })
})
