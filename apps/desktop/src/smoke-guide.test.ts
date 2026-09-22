import { describe, expect, it } from 'vitest'
import { zGuide } from '@dalili/shared'
import { buildDemoDesktopGuide } from './demo-guide'

describe('دخان القشرة: دليل خطوة-ديسكتوب يُبنى عبر النواة ويطابق العقد', () => {
  const guide = buildDemoDesktopGuide()

  it('يمرّ عبر zGuide بلا رفض', () => {
    expect(zGuide.safeParse(guide).success).toBe(true)
  })

  it('الخطوة الأولى مصدرها سطح المكتب بمعرّف التطبيق المعلن', () => {
    const src = guide.steps[0]?.source
    expect(src).toMatchObject({ kind: 'desktop', appId: 'app:EXCEL.EXE' })
  })
})
