// @vitest-environment jsdom
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DaliliApiError, type GuideDetailsDto, type StepDto } from '@dalili/shared'
import { GuideReader, type ReaderDeps } from './GuideReader'
import { clearReaderCache } from './useGuideReader'

afterEach(() => {
  cleanup()
  clearReaderCache()
})

const step = (over: Partial<StepDto> = {}): StepDto => ({
  id: over.id ?? 's1', kind: 'click', title: 'انقر «حفظ»', target: {}, sensitive: false,
  url: 'https://app.test', pageTitle: 'T', ts: 1, ...over,
})

function details(over: Partial<GuideDetailsDto> = {}, steps: StepDto[] = [step()]): GuideDetailsDto {
  return {
    guide: {
      id: 'g1', schemaVersion: 1, title: 'إصدار فاتورة', description: 'وصف قصير',
      locale: 'ar', dir: 'rtl', createdAt: '2026-09-01T00:00:00Z', updatedAt: '2026-09-01T00:00:00Z', steps,
    },
    share: null,
    visibility: 'workspace',
    ...over,
  }
}

function deps(over: Partial<ReaderDeps> = {}): ReaderDeps {
  return {
    apiBase: 'http://api',
    webBase: 'http://web',
    load: vi.fn().mockResolvedValue(details()),
    createShare: vi.fn().mockResolvedValue({ token: 'new', shareUrl: 'http://api/s/new', views: 0 }),
    startTrain: vi.fn().mockResolvedValue({ ok: true }),
    copyText: vi.fn().mockResolvedValue(undefined),
    openTab: vi.fn(),
    ...over,
  }
}

describe('GuideReader — PNL-01', () => {
  it('هيكل عظمي أثناء التحميل ثم العنوان والبطاقة المرقّمة', async () => {
    const { container } = render(<GuideReader guideId="g1" deps={deps()} onBack={() => {}} />)
    expect(container.querySelector('.reader-skeleton')).not.toBeNull()
    expect(await screen.findByRole('heading', { name: 'إصدار فاتورة' })).toBeTruthy()
    expect(screen.getByText('انقر «حفظ»')).toBeTruthy()
    expect(screen.getByText('١')).toBeTruthy()
  })

  it('التركيز ينتقل إلى «رجوع» عند الفتح، وEsc يرجع', async () => {
    const onBack = vi.fn()
    render(<GuideReader guideId="g1" deps={deps()} onBack={onBack} />)
    const back = screen.getByRole('button', { name: 'رجوع إلى القائمة' })
    expect(document.activeElement).toBe(back)
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onBack).toHaveBeenCalled()
  })

  it('خطأ 404 → رسالة محدّدة + إعادة المحاولة + فتح في المتصفح', async () => {
    const d = deps({ load: vi.fn().mockRejectedValue(new DaliliApiError(404, 'x')) })
    render(<GuideReader guideId="g1" deps={d} onBack={() => {}} />)
    expect((await screen.findByRole('alert')).textContent).toContain('الدليل غير موجود')
    fireEvent.click(screen.getByRole('button', { name: 'افتح في المتصفح ↗' }))
    expect(d.openTab).toHaveBeenCalledWith('http://web/g/g1')
  })

  it('«دربني» مخفي بلا مراسٍ', async () => {
    render(<GuideReader guideId="g1" deps={deps()} onBack={() => {}} />)
    await screen.findByRole('heading', { name: 'إصدار فاتورة' })
    expect(screen.queryByRole('button', { name: /دربني/ })).toBeNull()
  })

  it('«دربني» ظاهر بمرساة، ويرسل الدليل نفسه، والفشل يُعرض', async () => {
    const d = deps({
      load: vi.fn().mockResolvedValue(details({}, [step({ target: { anchor: [{ k: 'id', v: 'save' }] } })])),
      startTrain: vi.fn().mockResolvedValue({ ok: false, errorAr: 'افتح الصفحة الهدف أولًا' }),
    })
    render(<GuideReader guideId="g1" deps={d} onBack={() => {}} />)
    fireEvent.click(await screen.findByRole('button', { name: /دربني/ }))
    await waitFor(() => expect(screen.getByText('افتح الصفحة الهدف أولًا')).toBeTruthy())
    expect((d.startTrain as ReturnType<typeof vi.fn>).mock.calls[0]![0].id).toBe('g1')
  })

  it('نسخ الرابط مع مشاركة قائمة: ينسخ ولا ينشئ رمزًا جديدًا أبدًا', async () => {
    const d = deps({ load: vi.fn().mockResolvedValue(details({ share: { token: 'old', shareUrl: 'http://api/s/old', views: 3 } })) })
    render(<GuideReader guideId="g1" deps={d} onBack={() => {}} />)
    fireEvent.click(await screen.findByRole('button', { name: /نسخ الرابط/ }))
    await waitFor(() => expect(d.copyText).toHaveBeenCalledWith('http://web/s/old'))
    expect(d.createShare).not.toHaveBeenCalled()
    expect(await screen.findByRole('button', { name: /نُسخ/ })).toBeTruthy()
  })

  it('منشور بلا مشاركة: ينشئ مرة واحدة ثم ينسخ، والنقرة الثانية لا تنشئ مجددًا', async () => {
    const d = deps()
    render(<GuideReader guideId="g1" deps={d} onBack={() => {}} />)
    fireEvent.click(await screen.findByRole('button', { name: /نسخ الرابط/ }))
    await waitFor(() => expect(d.copyText).toHaveBeenCalledWith('http://web/s/new'))
    fireEvent.click(await screen.findByRole('button', { name: /نُسخ|نسخ الرابط/ }))
    await waitFor(() => expect(d.copyText).toHaveBeenCalledTimes(2))
    expect(d.createShare).toHaveBeenCalledTimes(1)
  })

  it('خاص بلا مشاركة: يفتح المحرر ويشرح، بلا إنشاء', async () => {
    const d = deps({ load: vi.fn().mockResolvedValue(details({ visibility: 'private' })) })
    render(<GuideReader guideId="g1" deps={d} onBack={() => {}} />)
    fireEvent.click(await screen.findByRole('button', { name: /نسخ الرابط/ }))
    expect(d.openTab).toHaveBeenCalledWith('http://web/g/g1')
    expect(screen.getByText(/الدليل خاص/)).toBeTruthy()
    expect(d.createShare).not.toHaveBeenCalled()
  })

  it('فشل النسخ رسالة محدّدة', async () => {
    const d = deps({
      load: vi.fn().mockResolvedValue(details({ share: { token: 'old', shareUrl: '', views: 0 } })),
      copyText: vi.fn().mockRejectedValue(new Error('copy-failed')),
    })
    render(<GuideReader guideId="g1" deps={d} onBack={() => {}} />)
    fireEvent.click(await screen.findByRole('button', { name: /نسخ الرابط/ }))
    expect(await screen.findByText('تعذّر النسخ إلى الحافظة — انسخ الرابط من صفحة الدليل')).toBeTruthy()
  })

  it('الكتل: header عنوان قسم وtip تلميح والفيديو سطر «في المتصفح»', async () => {
    const d = deps({
      load: vi.fn().mockResolvedValue(
        details({}, [
          step({ id: 'h', block: 'header', title: 'التجهيز' }),
          step({ id: 't', block: 'tip', title: 'احفظ أولًا' }),
          step({ id: 'v', block: 'video', title: '' }),
        ]),
      ),
    })
    render(<GuideReader guideId="g1" deps={d} onBack={() => {}} />)
    expect(await screen.findByRole('heading', { name: 'التجهيز' })).toBeTruthy()
    expect(screen.getByText('احفظ أولًا')).toBeTruthy()
    expect(screen.getByText('محتوى وسائط — يُعرض كاملًا في المتصفح')).toBeTruthy()
  })
})
