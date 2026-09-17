import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import type { PublicGuideDto } from '@dalili/shared'
import { t } from '../i18n'
import { needsVirtualScrolling } from '../lib/virtual-list'
import { ViewerPage } from './ViewerPage'

vi.mock('../api', () => ({
  client: { publicGuide: vi.fn(), trackShareView: vi.fn().mockResolvedValue(undefined), shareComments: vi.fn().mockResolvedValue({ comments: [] }) },
  WEB_SHARE_BASE: '/s/',
  webShareUrl: (u: string) => u,
}))

function fixture(): PublicGuideDto {
  return {
    guide: {
      id: 'g1',
      title: 'إصدار فاتورة توريد',
      updatedAt: new Date().toISOString(),
      steps: [
        {
          id: 's1',
          title: 'افتح قسم الفواتير',
          note: 'من القائمة الرئيسية',
          screenshot: { fileId: 'f1', blurRects: [] },
        },
        { id: 's2', title: 'اضغط زر الإضافة', screenshot: { missing: true } },
      ],
    },
    sharedAt: new Date().toISOString(),
  } as unknown as PublicGuideDto
}

function renderViewer() {
  return render(
    <MemoryRouter initialEntries={['/s/tok-1']}>
      <Routes>
        <Route path="/s/:token" element={<ViewerPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('العارض العام (VIEW-12/13)', () => {
  it('يعرض الدليل بلا حساب: العنوان والخطوات والصورة الناقصة بحالتها الصادقة', async () => {
    const { client } = await import('../api')
    vi.mocked(client.publicGuide).mockResolvedValue(fixture())
    renderViewer()
    expect(await screen.findByText('إصدار فاتورة توريد')).toBeTruthy()
    expect(screen.getByText('افتح قسم الفواتير')).toBeTruthy()
    expect(screen.getByText('من القائمة الرئيسية')).toBeTruthy()
    expect(screen.getByText('اضغط زر الإضافة')).toBeTruthy()
    expect(screen.getByText(t('viewer.missingShot'))).toBeTruthy()
    // VIEW-06: عدّاد مشاهدات واحد بعد تحميل ناجح — نداء ناري لا يوقف العرض
    expect(vi.mocked(client.trackShareView)).toHaveBeenCalledWith('tok-1')
  })

  it('٣و (قرار المالك): خطوة الانتقال بين النوافذ شريط فاصل — بلا مساحة صورة ولا «لا توجد لقطة»', async () => {
    const { client } = await import('../api')
    vi.mocked(client.publicGuide).mockResolvedValue({
      guide: {
        id: 'g2',
        title: 'دليل بنافذتين',
        updatedAt: new Date().toISOString(),
        steps: [
          { id: 'n1', kind: 'click', title: 'انقر على «Start»', screenshot: { fileId: 'f1', blurRects: [] } },
          // خطوة الانتقال: بلا screenshot أصلًا بحكم التصميم — لا بوصفها فشل التقاط
          { id: 'n2', kind: 'navigate', title: 'انتقل إلى نافذة «CoreInput»' },
          { id: 'n3', kind: 'click', title: 'انقر على «CoreInput»', screenshot: { fileId: 'f2', blurRects: [] } },
        ],
      },
      sharedAt: new Date().toISOString(),
    } as unknown as PublicGuideDto)
    renderViewer()
    expect(await screen.findByText('دليل بنافذتين')).toBeTruthy()
    // شريط الفاصل يظهر بعنوان الانتقال ورقمه في التسلسل
    const band = document.querySelector('.viewer-navigate')
    expect(band).not.toBeNull()
    expect(band?.textContent).toContain('انتقل إلى نافذة «CoreInput»')
    expect(band?.textContent).toContain('2')
    // ولا نصّ «لا توجد لقطة لهذه الخطوة» في الصفحة كلها — الخطوات الأخرى سليمة
    expect(screen.queryByText(t('viewer.missingShot'))).toBeNull()
  })

  it('VIEW-13: يحقن meta robots noindex ويزيله عند مغادرة الصفحة', async () => {
    const { client } = await import('../api')
    vi.mocked(client.publicGuide).mockResolvedValue(fixture())
    const { unmount } = renderViewer()
    await screen.findByText('إصدار فاتورة توريد')
    const meta = document.querySelector<HTMLMetaElement>('meta[name="robots"]')
    expect(meta?.content).toBe('noindex')
    unmount()
    expect(document.querySelector('meta[name="robots"]')).toBeNull()
  })

  it('رابط مسحوب أو شبكة ميتة → حالة خطأ عربية مع إعادة محاولة تعيد الطلب', async () => {
    const { client } = await import('../api')
    vi.mocked(client.publicGuide).mockRejectedValueOnce(new Error('network'))
    vi.mocked(client.publicGuide).mockResolvedValueOnce(fixture())
    renderViewer()
    expect(await screen.findByText(t('viewer.goneTitle'))).toBeTruthy()
    expect(document.querySelector<HTMLMetaElement>('meta[name="robots"]')?.content).toBe('noindex')

    const retry = screen.getByRole('button', { name: t('common.retry') })
    retry.click()
    expect(await screen.findByText('إصدار فاتورة توريد')).toBeTruthy()
  })
})

describe('BLK-01: العارض يرسم الكتل بترقيم مُصفّى', () => {
  it('التنبيه يُرسم بطاقة نداء، والخطوة بعده تحمل رقم 2 (تخطّت الكتلة)', async () => {
    const { client } = await import('../api')
    const g = fixture()
    g.guide.steps = [
      { id: 's1', title: 'الأولى', screenshot: { fileId: 'f1', blurRects: [] } },
      { id: 'b1', title: 'تنبيه', note: 'انتبه', block: 'tip' },
      { id: 's2', title: 'الثانية', screenshot: { fileId: 'f2', blurRects: [] } },
    ] as never
    vi.mocked(client.publicGuide).mockResolvedValue(g)
    renderViewer()
    await screen.findByText('إصدار فاتورة توريد')
    expect(document.querySelectorAll('.viewer-callout.tip').length).toBe(1)
    // الخطوة الثانية رقمها 2 رغم الكتلة بينها — الشارات هي مصدر الترقيم (نمط سكرايب)
    const nums = Array.from(document.querySelectorAll('.viewer-step-num')).map((el) => el.textContent)
    expect(nums).toEqual(['1', '2'])
  })
})

/** PERF-04: تمرير افتراضي — content-visibility للمتصفح فوق 100 خطوة (الحد الأقصى 200) */
describe('PERF-04: التمرير الافتراضي للقوائم الطويلة', () => {
  it('العتبة النقية: فوق 100 فقط — لا كلفة احتواء على القصيرة', () => {
    expect(needsVirtualScrolling(2)).toBe(false)
    expect(needsVirtualScrolling(100)).toBe(false)
    expect(needsVirtualScrolling(101)).toBe(true)
    expect(needsVirtualScrolling(200)).toBe(true)
  })

  it('دليل بـ150 خطوة يفعّل صنف التمرير على الحاوية — والقصير (خطوتان) لا يفعّله', async () => {
    const { client } = await import('../api')
    const long = fixture()
    long.guide.steps = Array.from({ length: 150 }, (_, i) => ({
      id: `s${i + 1}`,
      title: `خطوة طويلة رقم ${i + 1}`,
    })) as never
    vi.mocked(client.publicGuide).mockResolvedValue(long)
    const { container, unmount } = renderViewer()
    await screen.findByText('خطوة طويلة رقم 1')
    expect(container.querySelector('.page.cv-steps')).toBeTruthy()

    unmount()
    vi.mocked(client.publicGuide).mockResolvedValue(fixture())
    const short = renderViewer()
    await screen.findByText('افتح قسم الفواتير')
    expect(short.container.querySelector('.page.cv-steps')).toBeNull()
    short.unmount()
  })
})

/** VOX-03 موزّعًا (قرار المالك 2026-08-30): مشغل لكل خطوة بدل مشغل واحد فوق الدليل —
 *  ما تقرأه الخطوة (نص التفريغ) هو ما تسمعه عند تشغيلها (حدود المنتصفات نفسها) */
describe('مشغل الصوت في العارض', () => {
  const T0 = 1_700_000_000_000

  function audioFixture(pauses?: Array<[number, number]>): PublicGuideDto {
    return {
      guide: {
        id: 'g1',
        title: 'دليل بصوت',
        updatedAt: new Date().toISOString(),
        steps: [
          { id: 's1', title: 'الخطوة الأولى', ts: T0 + 1_000 },
          { id: 's2', title: 'الخطوة الثانية', ts: T0 + 9_000 },
          { id: 's3', title: 'الخطوة الثالثة', ts: T0 + 27_000 },
        ],
        audio: {
          fileId: 'voxAudio1',
          fileUrl: '/files/voxAudio1',
          durationMs: 60_000,
          startedAt: T0,
          ...(pauses ? { pauses } : {}),
        },
      },
      sharedAt: new Date().toISOString(),
    } as unknown as PublicGuideDto
  }

  async function renderAudio(pauses?: Array<[number, number]>) {
    // jsdom بلا scrollIntoView — يثبَّت قبل كل عرض صوتي
    Element.prototype.scrollIntoView = vi.fn()
    const { client } = await import('../api')
    vi.mocked(client.publicGuide).mockResolvedValue(audioFixture(pauses))
    renderViewer()
    await screen.findByText('الخطوة الأولى')
    return document.querySelector('audio')!
  }

  function stubMedia(audio: HTMLAudioElement) {
    audio.play = vi.fn(() => Promise.resolve())
    audio.pause = vi.fn()
    return audio
  }

  it('دليل بصوت → عنصر صوت خفي وزر استماع لكل خطوة — لا شريط علوي واحد', async () => {
    const audio = await renderAudio()
    expect(audio.getAttribute('src')).toBe('/files/voxAudio1')
    expect(audio.controls).toBe(false)
    const buttons = screen.getAllByRole('button', { name: t('viewer.playStep') })
    expect(buttons.length).toBe(3)
    expect(document.querySelector('.audio-bar')).toBeNull()
  })

  it('دليل بلا صوت (الفيكسچر الأصلي) → لا صوت ولا أزرار استماع', async () => {
    const { client } = await import('../api')
    vi.mocked(client.publicGuide).mockResolvedValue(fixture())
    renderViewer()
    await screen.findByText('إصدار فاتورة توريد')
    expect(document.querySelector('audio')).toBeNull()
    expect(screen.queryByRole('button', { name: t('viewer.playStep') })).toBeNull()
  })

  it('تشغيل خطوة يبدأ من بداية نطاقها (حد المنتصف، بعد خصم الإيقاف) ويستدعي play', async () => {
    const audio = stubMedia(await renderAudio([[T0 + 10_000, T0 + 25_000]]))
    // أزمنة المحتوى: 1000 · 9000 · 12000 (27s − 15s إيقاف) → نطاق الثالثة يبدأ 10.5s
    fireEvent.click(screen.getAllByRole('button', { name: t('viewer.playStep') })[2]!)
    expect(audio.currentTime).toBe(10.5)
    expect(audio.play).toHaveBeenCalled()
    expect((screen.getAllByRole('button', { name: t('viewer.pauseStep') })[0]!).textContent).toBeTruthy()
  })

  it('النقر ثانية يوقف الاستماع', async () => {
    const audio = stubMedia(await renderAudio())
    const btn = screen.getAllByRole('button', { name: t('viewer.playStep') })[0]!
    fireEvent.click(btn)
    fireEvent.click(screen.getAllByRole('button', { name: t('viewer.pauseStep') })[0]!)
    expect(audio.pause).toHaveBeenCalled()
  })

  it('بلوغ نهاية نطاق الخطوة يوقف التشغيل تلقائيًا — كل خطوة تسمع كلامها فقط', async () => {
    const audio = stubMedia(await renderAudio())
    // الثانية نطاقها [5s, 18s)
    fireEvent.click(screen.getAllByRole('button', { name: t('viewer.playStep') })[1]!)
    audio.currentTime = 18.2
    fireEvent(audio, new Event('timeupdate'))
    await waitFor(() => {
      expect(audio.pause).toHaveBeenCalled()
      expect(screen.queryByRole('button', { name: t('viewer.pauseStep') })).toBeNull()
    })
  })

  it('timeupdate يبرز الخطوة الحالية ويمرر إليها — حدث لا حلقة', async () => {
    const audio = await renderAudio()
    const scrollIntoView = Element.prototype.scrollIntoView as ReturnType<typeof vi.fn>
    audio.currentTime = 9.5 // داخل نطاق الثانية
    fireEvent(audio, new Event('timeupdate'))
    await waitFor(() => {
      const steps = document.querySelectorAll('.viewer-step')
      expect((steps[1] as HTMLElement).dataset.current).toBe('true')
      expect((steps[0] as HTMLElement).dataset.current).toBeUndefined()
    })
    expect(scrollIntoView).toHaveBeenCalled()
  })

  it('الإبراز يتبع أقرب فعل زمنيًا — يسبق الفعل عند تجاوز المنتصف (اتساقًا مع توزيع النص)', async () => {
    // أزمنة الأفعال: 1000 · 9000 · 27000. منتصف الأولى والثانية = 5000.
    // عند 6.5s (بعد المنتصف، قبل الفعل الثاني) تُبرز الثانية — نفس منطق توزيع النص.
    const audio = await renderAudio()
    audio.currentTime = 6.5
    fireEvent(audio, new Event('timeupdate'))
    await waitFor(() => {
      const steps = document.querySelectorAll('.viewer-step')
      expect((steps[1] as HTMLElement).dataset.current).toBe('true')
      expect((steps[0] as HTMLElement).dataset.current).toBeUndefined()
    })
  })
})

describe('التحسينات البصرية في العارض العام المماثلة للمرجع (Scribe)', () => {
  it('يعرض وصف الدليل وشارات المواقع ورابط الخطوة إن توفرت', async () => {
    const { client } = await import('../api')
    const g = fixture()
    g.guide.description = 'وصف تجريبي لدليل العارض العام'
    g.guide.steps[0]!.url = 'https://dashboard.example.com/orders'
    vi.mocked(client.publicGuide).mockResolvedValue(g)

    renderViewer()
    expect(await screen.findByText('وصف تجريبي لدليل العارض العام')).toBeTruthy()
    expect(screen.getByText('Dashboard')).toBeTruthy()
    const pill = document.querySelector('.step-url-pill') as HTMLAnchorElement
    expect(pill).toBeTruthy()
    expect(pill.href).toBe('https://dashboard.example.com/orders')
  })
})

