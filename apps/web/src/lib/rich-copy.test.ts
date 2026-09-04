import { afterEach, describe, expect, it, vi } from 'vitest'
import type { HtmlGuide } from '@dalili/core'
import { buildRichHtml } from './rich-copy'

const now = new Date().toISOString()
function guideWith(fileId: string): HtmlGuide {
  return {
    schemaVersion: 1,
    locale: 'ar',
    dir: 'rtl',
    createdAt: now,
    updatedAt: now,
    id: 'g1',
    title: 'دليل',
    steps: [
      { id: 's1', kind: 'click', title: 'خطوة', target: {}, sensitive: false, url: 'u', pageTitle: 'p', ts: 1, screenshot: { fileId, blurRects: [] } },
    ],
  } as unknown as HtmlGuide
}

afterEach(() => vi.unstubAllGlobals())

describe('buildRichHtml — تضمين الصور data-URI (VIEW-10)', () => {
  it('يجلب اللقطة ويضمّنها كـ data-URI في الـHTML', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, blob: async () => new Blob([new Uint8Array([1, 2, 3])], { type: 'image/png' }) }),
    )
    const html = await buildRichHtml(guideWith('abc'), 'http://host')
    expect(html).toMatch(/<img[^>]+src="data:image\/png;base64,/)
    expect(html).not.toContain('http://host/files/abc')
  })

  it('فشل الجلب يسقط لرابط مطلق للنطاق العام — لا ينهار النسخ', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }))
    const html = await buildRichHtml(guideWith('abc'), 'http://host')
    expect(html).toContain('http://host/files/abc')
    expect(html).not.toContain('data:image')
  })
})
