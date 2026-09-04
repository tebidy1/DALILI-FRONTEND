import { describe, expect, it, vi } from 'vitest'
import { autoTranscribeSteps, uploadMemo } from './voice-memo-upload'

/** VOX-09: رفع التعليق بعد النشر — مقاطع webm تُجمع ملفًا واحدًا، والفشل يبقي pending صادقًا */

function fakeClient(over: Partial<{ upload: ReturnType<typeof vi.fn>; transcribe: ReturnType<typeof vi.fn> }> = {}) {
  return {
    uploadBlob: over.upload ?? vi.fn().mockResolvedValue({ fileId: 'file-1' }),
    transcribeSteps: over.transcribe ?? vi.fn().mockResolvedValue({ results: [] }),
  } as unknown as Parameters<typeof uploadMemo>[0] & { uploadBlob: ReturnType<typeof vi.fn>; transcribeSteps: ReturnType<typeof vi.fn> }
}

describe('uploadMemo — رفع تعليق خطوة', () => {
  it('يجمع المقاطع blob واحد audio/webm ويعيد حقل الخطوة بملفه ومدته', async () => {
    const client = fakeClient()
    const voice = await uploadMemo(client, { chunks: ['QUJD', 'REVG'], durationMs: 7000, pending: true })
    const blob = vi.mocked(client.uploadBlob).mock.calls[0]![0] as Blob
    expect(blob.type).toBe('audio/webm')
    expect(blob.size).toBe(6) // ABC + DEF
    expect(voice).toEqual({ fileId: 'file-1', fileUrl: expect.stringContaining('/files/file-1'), durationMs: 7000, pending: undefined })
  })

  it('بلا مقاطع يبقي pending بصدق ولا يرفع شيئًا', async () => {
    const client = fakeClient()
    const voice = await uploadMemo(client, { chunks: [], durationMs: 3000, pending: true })
    expect(voice.pending).toBe(true)
    expect(voice.fileId).toBeUndefined()
    expect(client.uploadBlob).not.toHaveBeenCalled()
  })
})

describe('autoTranscribeSteps — التفريغ التلقائي للتعليقات', () => {
  it('بلا تعليقات لا يستدعي الخادم أصلًا', async () => {
    const client = fakeClient()
    await autoTranscribeSteps(client, 'g1', false)
    expect(client.transcribeSteps).not.toHaveBeenCalled()
  })

  it('مع تعليقات يستدعي transcribe-steps والفشل يعاد ok:false', async () => {
    const ok = fakeClient()
    await autoTranscribeSteps(ok, 'g1', true)
    expect(ok.transcribeSteps).toHaveBeenCalledWith('g1', expect.any(AbortSignal))

    const bad = fakeClient({ transcribe: vi.fn().mockRejectedValue(new Error('502')) })
    expect((await autoTranscribeSteps(bad, 'g1', true)).ok).toBe(false)
  })
})
