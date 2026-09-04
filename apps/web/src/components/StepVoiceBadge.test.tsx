// @vitest-environment jsdom
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { StepVoiceBadge } from './StepVoiceBadge'
import type { StepVoiceDto } from '@dalili/shared'

/**
 * VOX-09: 🎙 في المحرر والعارض — ▶ يعزف ملف الخطوة نفسه لا المسار الكامل،
 * والمعلق (فشل الرفع/التفريغ) يعرض زر إعادة تفريغ صادقًا يختفي بعد النجاح.
 */

const play = vi.fn().mockResolvedValue(undefined)
const pause = vi.fn()

beforeEach(() => {
  window.HTMLMediaElement.prototype.play = play as unknown as typeof HTMLMediaElement.prototype.play
  window.HTMLMediaElement.prototype.pause = pause as unknown as typeof HTMLMediaElement.prototype.pause
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    text: async () => JSON.stringify({ results: [] }),
    json: async () => ({ results: [] }),
  }))
})

afterEach(() => {
  vi.unstubAllGlobals()
  play.mockClear()
  pause.mockClear()
})

const uploaded: StepVoiceDto = { fileId: 'f1', fileUrl: '/files/f1', durationMs: 12_000 }
const pendingVoice: StepVoiceDto = { durationMs: 5_000, pending: true }

describe('StepVoiceBadge — 🎙 تعليق الخطوة', () => {
  it('يعرض المدة بالأرقام الهندية وزر ▶ — النقر يعزف الملف ويعزفه لا يوقفه', async () => {
    const { rerender } = render(<StepVoiceBadge voice={uploaded} guideId="g1" />)
    expect(screen.getByText('١٢ ث')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'شغّل تعليق الخطوة الصوتي' }))
    await waitFor(() => expect(play).toHaveBeenCalled())
    rerender(<StepVoiceBadge voice={uploaded} guideId="g1" />)
    expect(screen.getByRole('button', { name: 'أوقف تعليق الخطوة الصوتي' })).toBeTruthy()
  })

  it('التعليق المرفوع بلا pending لا يعرض زر إعادة إطلاقًا', () => {
    render(<StepVoiceBadge voice={uploaded} guideId="g1" />)
    expect(screen.queryByText('تعليق صوتي بانتظار التفريغ')).toBeNull()
  })

  it('بلاغ المالك: زر واحد نظيف — لا إيموجي ميك بجوار المثلث فيبدو زرين', () => {
    const { container } = render(<StepVoiceBadge voice={uploaded} guideId="g1" />)
    expect(container.querySelectorAll('button')).toHaveLength(1)
    const btn = container.querySelector('.step-voice-play') as HTMLElement
    expect(btn.textContent).not.toContain('🎙')
  })

  it('الزائر في العارض: المعلق يعرض لافتة الانتظار بلا زر إعادة', () => {
    render(<StepVoiceBadge voice={pendingVoice} guideId="g1" />)
    expect(screen.getByText('تعليق صوتي بانتظار التفريغ')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'شغّل تعليق الخطوة الصوتي' })).toBeNull() // لا ملف فلا ▶
    expect(screen.queryByRole('button', { name: 'أعد التفريغ' })).toBeNull()
  })

  it('المالك: زر إعادة التفريغ — النجاح يستدعي onTranscribed وتختفي اللافتة', async () => {
    const onTranscribed = vi.fn()
    const { rerender } = render(<StepVoiceBadge voice={pendingVoice} guideId="g1" canRetry onTranscribed={onTranscribed} />)
    expect(screen.getByText('تعليق صوتي بانتظار التفريغ')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'أعد التفريغ' }))
    await waitFor(() => expect(onTranscribed).toHaveBeenCalled())
    const called = vi.mocked(fetch).mock.calls[0]![0] as string
    expect(String(called)).toContain('/api/guides/g1/transcribe-steps')
    // الأب يمرر تعليقًا معالجًا → اللافتة تختفي
    rerender(<StepVoiceBadge voice={{ fileId: 'f2', durationMs: 5_000 }} guideId="g1" canRetry />)
    expect(screen.queryByText('تعليق صوتي بانتظار التفريغ')).toBeNull()
  })

  it('فشل التفريغ يعرض رسالة صادقة ولا يرمي', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('502')))
    render(<StepVoiceBadge voice={pendingVoice} guideId="g1" canRetry />)
    fireEvent.click(screen.getByRole('button', { name: 'أعد التفريغ' }))
    await waitFor(() => expect(screen.getByText('تعذّر تفريغ التعليق — أعد المحاولة')).toBeTruthy())
  })

  it('بلاغ المالك 2026-09-04: نجاح HTTP بنتيجة خطوة فاشلة يعرض خطأ الخادم الصادق — الزر الصامت ممنوع', async () => {
    const errorAr = 'لا يوجد ملف صوتي مرفوع لهذا التعليق — أعد رفعه'
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ results: [{ stepId: 's1', ok: false, errorAr }] }),
      json: async () => ({ results: [{ stepId: 's1', ok: false, errorAr }] }),
    }))
    const onTranscribed = vi.fn()
    render(<StepVoiceBadge voice={pendingVoice} guideId="g1" canRetry onTranscribed={onTranscribed} />)
    fireEvent.click(screen.getByRole('button', { name: 'أعد التفريغ' }))
    await waitFor(() => expect(screen.getByText(errorAr)).toBeTruthy())
    expect(onTranscribed).not.toHaveBeenCalled() // لم يُفرَّغ شيء — لا نكذب بالنجاح
  })
})
