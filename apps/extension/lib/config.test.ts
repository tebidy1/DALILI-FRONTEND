import { describe, expect, it } from 'vitest'
import { resolveBase } from './config'

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
