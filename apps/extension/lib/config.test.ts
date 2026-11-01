import { describe, expect, it } from 'vitest'
import { defaultBases, PROD_BASES, resolveBase } from './config'

describe('PLAT-02: عناوين بيئية', () => {
  it('بلا متغير أو فارغ → الافتراضي المحلي', () => {
    expect(resolveBase({}, 'VITE_API_BASE', 'http://localhost:8787')).toBe('http://localhost:8787')
    expect(resolveBase({ VITE_API_BASE: '   ' }, 'VITE_API_BASE', 'http://localhost:8787')).toBe(
      'http://localhost:8787',
    )
  })

  it('قيمة صالحة → تُستخدم مع كشف الفراغ الزائد', () => {
    expect(resolveBase({ VITE_API_BASE: 'https://api.dalili.sa/' }, 'VITE_API_BASE', 'x')).toBe(
      'https://api.dalili.sa',
    )
    expect(resolveBase({ VITE_WEB_BASE: ' https://dalili.sa// ' }, 'VITE_WEB_BASE', 'x')).toBe(
      'https://dalili.sa',
    )
  })

  it('مخطط ليس http(s) → يُرفض ويعود الافتراضي — لا حقن مخططات غريبة من إعداد بناء خاطئ', () => {
    expect(resolveBase({ VITE_API_BASE: 'ftp://evil' }, 'VITE_API_BASE', 'http://localhost:8787')).toBe(
      'http://localhost:8787',
    )
    expect(
      resolveBase({ VITE_API_BASE: 'javascript:alert(1)' }, 'VITE_API_BASE', 'http://localhost:8787'),
    ).toBe('http://localhost:8787')
  })
})

describe('PLAT-05: افتراضيات حسب وضع البناء — حزمة المتجر لا تُبنى على localhost', () => {
  it('وضع الإنتاج → النطاقان الحيّان حتى بلا ‎.env.production', () => {
    expect(defaultBases({ PROD: true })).toEqual({ api: PROD_BASES.api, web: PROD_BASES.web })
    expect(defaultBases({ MODE: 'production' })).toEqual({ api: PROD_BASES.api, web: PROD_BASES.web })
  })

  it('وضع التطوير أو بيئة فارغة → المضيف المحلي', () => {
    expect(defaultBases({})).toEqual({ api: 'http://localhost:8787', web: 'http://localhost:5174' })
    expect(defaultBases({ MODE: 'development', PROD: false })).toEqual({
      api: 'http://localhost:8787',
      web: 'http://localhost:5174',
    })
  })

  it('النطاقان الحيّان https وبلا شرطة ختامية — يُلصقان في مسارات /files و/g مباشرة', () => {
    for (const b of [PROD_BASES.api, PROD_BASES.web]) {
      expect(b).toMatch(/^https:\/\//)
      expect(b.endsWith('/')).toBe(false)
    }
  })
})

