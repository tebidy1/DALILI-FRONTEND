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

/**
 * طلب المالك 2026-10-02: الصوت المسجَّل على اللقطة يُشغَّل عند عرض الدليل من زرّ ظاهر
 * بنصّه («استمع للشرح») لا مثلثًا صغيرًا في رأس البطاقة، وبحركة أثناء التشغيل
 * (موجة + امتلاء بمقدار التقدّم). ومشغّل واحد يعزف في الصفحة — لا شرحان معًا.
 */
describe('StepVoiceBadge — مشغّل الشرح الصوتي (VOX-10)', () => {
  const second: StepVoiceDto = { fileId: 'f2', fileUrl: '/files/f2', durationMs: 8_000 }

  it('الزر يحمل نصًّا ظاهرًا «استمع للشرح» وموجة — لا أيقونة صمّاء', () => {
    const { container } = render(<StepVoiceBadge voice={uploaded} guideId="g1" />)
    const btn = container.querySelector('.step-voice-play')!
    expect(btn.textContent).toContain('استمع للشرح')
    expect(container.querySelectorAll('.step-voice-wave i').length).toBeGreaterThanOrEqual(4)
    expect(container.querySelector('.step-voice')!.classList.contains('is-playing')).toBe(false)
  })

  it('أثناء التشغيل: صنف is-playing (تتحرّك الموجة) والنص «إيقاف»، وعند انتهاء الملف يعود ساكنًا', async () => {
    const { container } = render(<StepVoiceBadge voice={uploaded} guideId="g1" />)
    const root = container.querySelector('.step-voice')!
    fireEvent.click(container.querySelector('.step-voice-play')!)
    await waitFor(() => expect(root.classList.contains('is-playing')).toBe(true))
    expect(container.querySelector('.step-voice-play')!.textContent).toContain('إيقاف')
    fireEvent.ended(container.querySelector('audio')!)
    expect(root.classList.contains('is-playing')).toBe(false)
    expect((root as HTMLElement).style.getPropertyValue('--p')).toBe('0')
  })

  it('التقدّم: timeupdate يملأ الزر بنسبة ما عُزف (المدة من بيانات الخطوة حين لا يعرفها المتصفح)', async () => {
    const { container } = render(<StepVoiceBadge voice={uploaded} guideId="g1" />)
    const root = container.querySelector('.step-voice') as HTMLElement
    const audio = container.querySelector('audio')!
    fireEvent.click(container.querySelector('.step-voice-play')!)
    await waitFor(() => expect(root.classList.contains('is-playing')).toBe(true))
    audio.currentTime = 6 // من ١٢ ثانية
    fireEvent.timeUpdate(audio)
    expect(Number(root.style.getPropertyValue('--p'))).toBeCloseTo(0.5)
  })

  it('مشغّل واحد في الصفحة: تشغيل شرح خطوة أخرى يوقف الأول', async () => {
    const { container } = render(
      <>
        <StepVoiceBadge voice={uploaded} guideId="g1" />
        <StepVoiceBadge voice={second} guideId="g1" />
      </>,
    )
    const [a, b] = Array.from(container.querySelectorAll('.step-voice'))
    fireEvent.click(a!.querySelector('.step-voice-play')!)
    await waitFor(() => expect(a!.classList.contains('is-playing')).toBe(true))
    pause.mockClear()
    fireEvent.click(b!.querySelector('.step-voice-play')!)
    await waitFor(() => expect(b!.classList.contains('is-playing')).toBe(true))
    expect(pause).toHaveBeenCalledTimes(1)
    // المتصفح يطلق pause على الأول — فيعود ساكنًا
    fireEvent.pause(a!.querySelector('audio')!)
    expect(a!.classList.contains('is-playing')).toBe(false)
  })
})
