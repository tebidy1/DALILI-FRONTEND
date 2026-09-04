import { describe, expect, it, vi } from 'vitest'
import { autoTranscribe } from './audio-publish'
import type { DaliliClient } from '@dalili/shared'

/** التفريغ التلقائي بعد النشر (قرار المالك 2026-08-30) — الفشل صادق ولا يمسّ الدليل */

function fakeClient() {
  return { transcribeGuide: vi.fn() } as unknown as DaliliClient
}

describe('autoTranscribe', () => {
  it('بلا صوت → نجاح فوري بلا أي نداء تفريغ', async () => {
    const client = fakeClient()
    const res = await autoTranscribe(client, 'g1', false)
    expect(res).toEqual({ ok: true })
    expect(client.transcribeGuide).not.toHaveBeenCalled()
  })

  it('بصوت → يستدعي apply على الخادم ويعيد عدد الملاحظات المملوءة', async () => {
    const client = fakeClient()
    vi.mocked(client.transcribeGuide).mockResolvedValue({ provider: 'groq', suggestions: [], applied: 3 })
    const res = await autoTranscribe(client, 'g9', true)
    expect(res).toEqual({ ok: true, applied: 3 })
    expect(client.transcribeGuide).toHaveBeenCalledWith('g9', expect.objectContaining({ apply: true }))
  })

  it('فشل الخادم/الشبكة → { ok: false } لا رمي — الدليل منشور واللافتة بالمحرر', async () => {
    const client = fakeClient()
    vi.mocked(client.transcribeGuide).mockRejectedValue(new Error('502'))
    await expect(autoTranscribe(client, 'g2', true)).resolves.toEqual({ ok: false })
  })
})
