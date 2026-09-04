import { describe, expect, it } from 'vitest'
import { hostOf, guidesCountAr } from './discover'

/** SRCH-04: المنطق النقي لشارة الاكتشاف — نطاق التبويب النشط وصياغة عدده عربيًا */
describe('hostOf — نطاق رابط التبويب', () => {
  it('https عادي → المضيف', () => {
    expect(hostOf('https://erp.example.com/invoices?page=2')).toBe('erp.example.com')
  })

  it('http ومنافذ ومسارات → المضيف بلا منفذ ولا مسار', () => {
    expect(hostOf('http://localhost:5174/g/abc')).toBe('localhost')
    expect(hostOf('http://portal.corp.sa:8080/x')).toBe('portal.corp.sa')
  })

  it('صفحات المتصفح الداخلية وغير الصالح → null (لا شارة)', () => {
    expect(hostOf('chrome://extensions/')).toBeNull()
    expect(hostOf('about:blank')).toBeNull()
    expect(hostOf('')).toBeNull()
    expect(hostOf('ليس رابطًا')).toBeNull()
  })

  it('الملفات المحلية → null (لا معنى لشارة على ملف)', () => {
    expect(hostOf('file:///C:/x.pdf')).toBeNull()
  })
})

describe('guidesCountAr — صياغة عدد الأدلة عربيًا', () => {
  it('المفنى والمثنى والجمع القليل والكثير', () => {
    expect(guidesCountAr(1)).toBe('دليل واحد')
    expect(guidesCountAr(2)).toBe('دليلان')
    expect(guidesCountAr(3)).toBe('٣ أدلة')
    expect(guidesCountAr(10)).toBe('١٠ أدلة')
    expect(guidesCountAr(11)).toBe('١١ دليلًا')
    expect(guidesCountAr(42)).toBe('٤٢ دليلًا')
  })
})
