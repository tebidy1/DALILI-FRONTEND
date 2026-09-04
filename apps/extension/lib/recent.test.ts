import { describe, expect, it } from 'vitest'
import { filterByTitle, searchHref, relativeTimeAr, type RecentGuide } from './recent'

/**
 * منطق اللوحة الجانبية النقي: تصفية الأدلة الأخيرة فوريًا، رابط البحث الكامل، والزمن النسبي العربي.
 * المرئي (التخطيط والأنماط) يؤكده المالك حيًا؛ هذه الدوال قابلة للاختبار الكامل بلا DOM.
 */

const g = (title: string, id = title): RecentGuide => ({ id, title, updatedAt: '2026-08-30T00:00:00Z', stepCount: 3 })

describe('filterByTitle', () => {
  const list = [g('حفظ الفاتورة'), g('إنشاء طلب شراء'), g('تسجيل موظف جديد')]

  it('استعلام فارغ يعيد القائمة كما هي', () => {
    expect(filterByTitle(list, '   ')).toEqual(list)
  })

  it('يطابق العنوان بجزء من النص', () => {
    expect(filterByTitle(list, 'طلب').map((x) => x.title)).toEqual(['إنشاء طلب شراء'])
  })

  it('التطبيع يتجاوز اختلاف الهمزة والتاء المربوطة (مطابقة عربية متينة)', () => {
    // «فاتوره» بالهاء يطابق «الفاتورة» بالتاء المربوطة بعد التطبيع
    expect(filterByTitle(list, 'فاتوره').map((x) => x.title)).toEqual(['حفظ الفاتورة'])
  })

  it('بلا تطابق يعيد فارغًا', () => {
    expect(filterByTitle(list, 'xyz')).toEqual([])
  })
})

describe('searchHref', () => {
  it('يبني رابط بحث الويب مرمّزًا للاستعلام المقلّم', () => {
    expect(searchHref('http://localhost:5174', ' حفظ ')).toBe(
      'http://localhost:5174/search?q=' + encodeURIComponent('حفظ'),
    )
  })

  it('استعلام فارغ → null (لا فتح بحث بلا كلمة)', () => {
    expect(searchHref('http://localhost:5174', '   ')).toBeNull()
  })
})

describe('relativeTimeAr', () => {
  const now = Date.parse('2026-08-30T12:00:00Z')

  it('أقل من دقيقة → «الآن»', () => {
    expect(relativeTimeAr('2026-08-30T11:59:30Z', now)).toBe('الآن')
  })

  it('دقائق وساعات وأيام بأرقام عربية', () => {
    expect(relativeTimeAr('2026-08-30T11:45:00Z', now)).toBe('منذ ١٥ دقيقة')
    expect(relativeTimeAr('2026-08-30T09:00:00Z', now)).toBe('منذ ٣ ساعة')
    expect(relativeTimeAr('2026-08-27T12:00:00Z', now)).toBe('منذ ٣ يوم')
  })
})
