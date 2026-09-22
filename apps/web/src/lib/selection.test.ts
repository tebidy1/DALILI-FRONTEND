import { describe, expect, it } from 'vitest'
import { emptySelection, toggleSelect, rangeSelect, selectAll, isPicked } from './selection'

const ORDER = ['a', 'b', 'c', 'd']

/** LIB-05: منطق التحديد المتعدد النقي — تبديل/مدى/الكل بترتيب القائمة المعروضة */
describe('selection — التحديد المتعدد', () => {
  it('التفريغ يبدأ فارغًا بلا مرصاد', () => {
    const s = emptySelection()
    expect(s.ids).toEqual([])
    expect(s.anchor).toBeNull()
    expect(isPicked(s, 'a')).toBe(false)
  })

  it('تبديل بطاقة: تضاف إلى النهاية وتُزال عند إعادة النقر، ويصير مرصادًا', () => {
    let s = emptySelection()
    s = toggleSelect(s, 'a')
    expect(s.ids).toEqual(['a'])
    expect(s.anchor).toBe('a')
    s = toggleSelect(s, 'b')
    expect(s.ids).toEqual(['a', 'b'])
    expect(isPicked(s, 'b')).toBe(true)
    s = toggleSelect(s, 'a')
    expect(s.ids).toEqual(['b'])
    expect(isPicked(s, 'a')).toBe(false)
  })

  it('Shift+Click يستبدل التحديد بالمدى من المرصاد إلى المنقور بترتيب القائمة', () => {
    let s = toggleSelect(emptySelection(), 'a')
    s = toggleSelect(s, 'd') // المرصاد الآن d
    s = rangeSelect(s, 'c', ORDER)
    expect(s.ids).toEqual(['c', 'd'])
    expect(s.anchor).toBe('c')
  })

  it('Shift+Click بلا مرصاد (أو مرصاد غائب عن الصفحة) يحدّد المنقور وحده', () => {
    expect(rangeSelect(emptySelection(), 'c', ORDER).ids).toEqual(['c'])
    const stale = { ids: ['z'], anchor: 'z' }
    expect(rangeSelect(stale, 'b', ORDER).ids).toEqual(['b'])
  })

  it('تحديد الكل بترتيب القائمة', () => {
    expect(selectAll(emptySelection(), ORDER).ids).toEqual(ORDER)
  })

  it('صفحة جديدة بلا محددات: التحديد يبقى كما هو (لا انفجار)', () => {
    const s = toggleSelect(emptySelection(), 'a')
    expect(selectAll(s, []).ids).toEqual([])
  })
})
