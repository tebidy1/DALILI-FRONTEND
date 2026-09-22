import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

/** PLAT-01: متجر كروم يرفض الامتداد بلا أيقونات — الافتراضي يجب أن يجدها كلها */
const SIZES = [16, 32, 48, 128] as const

describe('PLAT-01: أيقونات الامتداد', () => {
  for (const size of SIZES) {
    it(`أيقونة ${size}×${size} موجودة وهي PNG سليمة غير فارغة`, () => {
      const p = path.resolve(__dirname, '..', 'public', 'icons', `${size}.png`)
      const buf = readFileSync(p)
      // 16px بضغط PNG قد ينزل تحت 200 — المهم ليس ملفًا مبتورًا
      expect(buf.length).toBeGreaterThan(150)
      // بصمة PNG: 89 50 4E 47 0D 0A 1A 0A
      expect([...buf.slice(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    })
  }
})
