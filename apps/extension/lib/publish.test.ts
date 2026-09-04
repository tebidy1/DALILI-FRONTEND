import { describe, expect, it } from 'vitest'
import { DEFAULT_MARK_COLOR } from '@dalili/core'
import { screenshotFromStored } from './publish'

describe('ANNO-02: النشر ينقل إطار الهدف كبيانات', () => {
  it('خطوة لها mark مخزّن → لقطة تحمل mark بلون اللوحة الافتراضي', () => {
    const shot = screenshotFromStored(
      { fileId: 'f1', fileUrl: '/files/f1', thumbFileId: 't1' },
      { autoBlurred: false, mark: { x: 10, y: 20, w: 80, h: 30 } },
    )
    expect(shot.mark).toEqual({ rect: { x: 10, y: 20, w: 80, h: 30 }, color: DEFAULT_MARK_COLOR })
  })

  it('خطوة بلا mark (تنقّل أو حقل حسّاس مطموس) → لقطة بلا mark لا بـ undefined صريح مزعج', () => {
    const shot = screenshotFromStored({ fileId: 'f1' }, { autoBlurred: true })
    expect(shot.mark).toBeUndefined()
    expect(shot.autoBlurred).toBe(true)
  })
})
