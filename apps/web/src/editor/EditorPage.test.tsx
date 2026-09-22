import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import type { GuideDetailsDto, GuideDto } from '@dalili/shared'
import { t } from '../i18n'
import { client } from '../api'
import { EditorPage } from './EditorPage'

vi.mock('../api', () => ({
  client: {
    getGuide: vi.fn(),
    updateGuide: vi.fn().mockResolvedValue(undefined),
    updateGuideMeta: vi.fn().mockResolvedValue({}),
    createShare: vi.fn(),
    revokeShare: vi.fn(),
    transcribeGuide: vi.fn(),
    guideComments: vi.fn().mockResolvedValue({ comments: [] }),
    me: vi.fn().mockResolvedValue({ id: 'u1', email: 'owner@example.com' }),
    uploadBlob: vi.fn().mockResolvedValue({ fileId: 'up1', thumbFileId: undefined }),
  },
  WEB_SHARE_BASE: '/s/',
  webShareUrl: (u: string) => u,
}))

function fixture(): GuideDetailsDto {
  return {
    guide: {
      id: 'g1',
      schemaVersion: 1,
      title: 'دليل الفواتير',
      locale: 'ar',
      dir: 'rtl',
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
      steps: [
        {
          id: 's1',
          kind: 'click',
          title: 'اضغط زر الإنشاء',
          alt: 'زر الإنشاء في أعلى يمين الشاشة',
          target: {},
          sensitive: false,
          url: 'https://erp.example.com/i',
          pageTitle: 'الفواتير',
          ts: 1,
          screenshot: { fileId: 'f1', blurRects: [] },
        },
      ],
    },
    share: null,
    meta: { starred: false, folderId: null, tags: [] },
  }
}

/** CAP-17: ثلاث خطوات — يجب أن يظهر 4 مواضع إدراج (قبل كل خطوة + النهاية) */
function fixture3(): GuideDetailsDto {
  const f = fixture()
  for (const n of [2, 3]) {
    f.guide.steps.push({
      id: `s${n}`,
      kind: 'click',
      title: `خطوة رقم ${n}`,
      target: {},
      sensitive: false,
      url: 'https://erp.example.com/i',
      pageTitle: 'الفواتير',
      ts: n * 12_000,
      screenshot: { fileId: `f${n}`, blurRects: [] },
    })
  }
  return f
}

/** دليل بصوت وخطوتين — لاختبار التفريغ إلى نص */
function fixtureWithAudio(): GuideDetailsDto {
  const f = fixture()
  f.guide.audio = {
    fileId: 'aud1',
    fileUrl: 'http://localhost:8787/files/aud1',
    durationMs: 23_477,
    startedAt: 1_700_000_000_000,
  }
  f.guide.steps.push({
    id: 's2',
    kind: 'click',
    title: 'احفظ الفاتورة',
    target: {},
    sensitive: false,
    url: 'https://erp.example.com/i',
    pageTitle: 'الفواتير',
    ts: 12_000,
    screenshot: { fileId: 'f2', blurRects: [] },
  })
  return f
}

/**
 * S4: خطوتان — الأولى تحمل إطار هدف حيًّا، والثانية لقطة قديمة إطارها مخبوز
 * في البكسل بلا `mark`. الفرق بينهما هو محكّ «التخطّي الصامت» في إعادة التلوين.
 */
function fixtureMarked(): GuideDetailsDto {
  const f = fixture()
  f.guide.steps[0]!.screenshot = {
    fileId: 'f1',
    blurRects: [],
    mark: { rect: { x: 10, y: 20, w: 30, h: 40 }, color: '#ea580c' },
  }
  f.guide.steps.push({
    id: 's2',
    kind: 'click',
    title: 'خطوة قديمة بلا علامة',
    target: {},
    sensitive: false,
    url: 'https://erp.example.com/i',
    pageTitle: 'الفواتير',
    ts: 12_000,
    screenshot: { fileId: 'f2', blurRects: [] },
  })
  return f
}

/** آخر نسخة دليل بلغت الخادم عبر الحفظ التلقائي — بها نتحقّق من حالة فعلية لا من مظهر */
function lastSaved(): GuideDto {
  const calls = vi.mocked(client.updateGuide).mock.calls
  return calls[calls.length - 1]![1] as GuideDto
}

/** لقطة الخطوة رقم `i` من دليل محفوظ — مضيّقة من اتحاد «موجودة/مفقودة» */
function shotOf(g: GuideDto, i: number) {
  const s = g.steps[i]!.screenshot
  return s && !('missing' in s) ? s : null
}

function renderEditor() {
  return render(
    <MemoryRouter initialEntries={['/g/g1']}>
      <Routes>
        <Route path="/g/:id" element={<EditorPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

/**
 * المحرر يفتح على وضع العرض النظيف — العنوان عنوانٌ لا حقل.
 * أدوات التحرير (حقول/إدراج/حذف) تظهر بعد الدخول لوضع التعديل.
 */
async function ready(edit = true) {
  await screen.findByText('دليل الفواتير')
  if (edit) fireEvent.click(screen.getByRole('button', { name: t('editor.edit') }))
}

async function load() {
  const { client } = await import('../api')
  vi.mocked(client.getGuide).mockResolvedValue(fixture())
  renderEditor()
  await ready()
  return client
}

/** يفتح كشف أدوات الريشة حيث تعيش لوحة الألوان بعد إعادة بناء العمود */
function openPen() {
  fireEvent.click(screen.getByRole('button', { name: t('editor.penGroup') }))
}

describe('VOX-05: تفريغ الصوت إلى نص في المحرِّر', () => {
  it('دليل بصوت يعرض مشغّلًا مسموعًا بمصدر الملف؛ وبلا صوت لا مشغّل', async () => {
    const { client } = await import('../api')
    vi.mocked(client.getGuide).mockResolvedValue(fixtureWithAudio())
    renderEditor()
    await ready()
    const player = screen.getByLabelText(t('editor.audioLabel')) as HTMLAudioElement
    expect(player.tagName).toBe('AUDIO')
    expect(player.getAttribute('src')).toBe('http://localhost:8787/files/aud1')
  })

  it('بلا صوت لا يظهر المشغّل ولا زر التفريغ', async () => {
    await load()
    expect(screen.queryByLabelText(t('editor.audioLabel'))).toBeNull()
    expect(screen.queryByText(t('editor.transcribe'))).toBeNull()
  })

  it('زر «حوّل الصوت إلى نص» يملأ ملاحظة كل خطوة بنصّها المقترح', async () => {
    const { client } = await import('../api')
    vi.mocked(client.getGuide).mockResolvedValue(fixtureWithAudio())
    vi.mocked(client.transcribeGuide).mockResolvedValue({
      provider: 'groq',
      suggestions: [
        { stepId: 's1', text: 'اضغط الزر الأخضر في الأعلى' },
        { stepId: 's2', text: 'ثم اضغط حفظ لاعتماد الفاتورة' },
      ],
    })
    renderEditor()
    await ready()

    fireEvent.click(screen.getByText(t('editor.transcribe')))

    // طلب المالك 2026-09-09: حقل واحد للعنوان — السطر الأول عنوان وما بعده ملاحظة
    const notes = (await screen.findAllByPlaceholderText(t('editor.stepTitlePlaceholder'))) as HTMLTextAreaElement[]
    expect(notes[0]!.value).toContain('اضغط الزر الأخضر في الأعلى')
    expect(notes[1]!.value).toContain('ثم اضغط حفظ لاعتماد الفاتورة')
    expect(vi.mocked(client.transcribeGuide)).toHaveBeenCalledWith('g1')
  })

  it('فشل المزوّد يعرض رسالة الخادم العربية ولا يمسّ الملاحظات', async () => {
    const { client } = await import('../api')
    const { DaliliApiError } = await import('@dalili/shared')
    vi.mocked(client.getGuide).mockResolvedValue(fixtureWithAudio())
    vi.mocked(client.transcribeGuide).mockRejectedValue(
      new DaliliApiError(502, 'تعذّر التفريغ من مزوّد الصوت — أعد المحاولة لاحقًا'),
    )
    renderEditor()
    await ready()

    fireEvent.click(screen.getByText(t('editor.transcribe')))

    await screen.findByText('تعذّر التفريغ من مزوّد الصوت — أعد المحاولة لاحقًا')
    const notes = screen.getAllByPlaceholderText(t('editor.stepTitlePlaceholder')) as HTMLTextAreaElement[]
    expect(notes[0]!.value).not.toContain('اضغط الزر الأخضر في الأعلى')
    // العنوان يبقى في مكانه بالحقل الواحد رغم فشل التفريغ
    expect(notes[0]!.value).toBe('اضغط زر الإنشاء')
  })

  it('وصول بعد فشل التفريغ التلقائي (?stt=failed) → لافتة صادقة تختفي بنجاح المحاولة اليدوية', async () => {
    const { client } = await import('../api')
    vi.mocked(client.getGuide).mockResolvedValue(fixtureWithAudio())
    vi.mocked(client.transcribeGuide).mockResolvedValue({
      provider: 'groq',
      suggestions: [{ stepId: 's1', text: 'اضغط الزر الأخضر' }],
    })
    render(
      <MemoryRouter initialEntries={['/g/g1?stt=failed']}>
        <Routes>
          <Route path="/g/:id" element={<EditorPage />} />
        </Routes>
      </MemoryRouter>,
    )
    await ready()
    expect(screen.getByText(t('editor.sttFailed', { button: t('editor.transcribe') }))).toBeTruthy()

    fireEvent.click(screen.getByText(t('editor.transcribe')))
    await screen.findByText(t('editor.transcribeDone', { count: 1 }))
    expect(screen.queryByText(t('editor.sttFailed', { button: t('editor.transcribe') }))).toBeNull()
  })
})

describe('وضعا العرض والتعديل — التحرير باختيار صريح', () => {
  it('يفتح على وضع العرض: العنوان نصّ لا حقل، وبلا أدوات تحرير', async () => {
    const { client } = await import('../api')
    vi.mocked(client.getGuide).mockResolvedValue(fixture())
    renderEditor()
    await screen.findByText('دليل الفواتير')
    expect(screen.queryByDisplayValue('دليل الفواتير')).toBeNull()
    expect(screen.queryByPlaceholderText(t('editor.stepTitlePlaceholder'))).toBeNull()
    expect(screen.queryByRole('button', { name: t('editor.removeStep') })).toBeNull()
    expect(screen.queryByRole('button', { name: t('editor.addStepsShort') })).toBeNull()
  })

  it('«تعديل» يكشف الحقول والأدوات، و«تم» يعيد وضع العرض', async () => {
    const { client } = await import('../api')
    vi.mocked(client.getGuide).mockResolvedValue(fixture())
    renderEditor()
    await screen.findByText('دليل الفواتير')

    fireEvent.click(screen.getByRole('button', { name: t('editor.edit') }))
    expect(screen.getByDisplayValue('دليل الفواتير')).toBeTruthy()
    expect(screen.getByPlaceholderText(t('editor.stepTitlePlaceholder'))).toBeTruthy()
    expect(screen.getByRole('button', { name: t('editor.removeStep') })).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: t('editor.done') }))
    expect(screen.queryByDisplayValue('دليل الفواتير')).toBeNull()
  })

  it('صف البيانات يعرض عدد الخطوات ومالك الدليل', async () => {
    const { client } = await import('../api')
    vi.mocked(client.getGuide).mockResolvedValue(fixture3())
    renderEditor()
    await screen.findByText('دليل الفواتير')
    expect(screen.getByText(t('common.steps', { count: '٣' }))).toBeTruthy()
    await screen.findByText('Owner')
  })
})

describe('إصلاحات بصرية: عنوان يمينيّ وشريط جانبي خارج البطاقة', () => {
  it('عنوان الدليل dir=rtl في وضع العرض فيلتصق باليمين مهما كانت لغة النص', async () => {
    const { client } = await import('../api')
    vi.mocked(client.getGuide).mockResolvedValue(fixture())
    renderEditor()
    await screen.findByText('دليل الفواتير')
    const h1 = document.querySelector('.guide-title-read')
    expect(h1?.getAttribute('dir')).toBe('rtl')
  })

  it('حقل العنوان في وضع التعديل dir=rtl كذلك', async () => {
    await load()
    const input = screen.getByDisplayValue('دليل الفواتير')
    expect(input.getAttribute('dir')).toBe('rtl')
  })

  it('المقبض ومربّع التحديد خارج جسم البطاقة المؤطَّر (في شريط جانبي)', async () => {
    await load()
    const pick = screen.getByRole('checkbox', { name: t('editor.pickStep', { no: 1 }) })
    const grip = screen.getByRole('button', { name: t('editor.dragStep') })
    // خارج البطاقة المؤطَّرة نفسها
    expect(pick.closest('.step-card')).toBeNull()
    expect(grip.closest('.step-card')).toBeNull()
    // داخل شريط جانبي، والشريط ليس ابنًا للبطاقة
    expect(pick.closest('.step-rail')).not.toBeNull()
    expect(grip.closest('.step-rail')).not.toBeNull()
    expect(document.querySelector('.step-card .step-rail')).toBeNull()
  })
})

describe('BLK-01: قائمة + وأنواع الكتل', () => {
  it('اختيار «تنبيه» يُدرج كتلة سماوية بلا رقم في النهاية', async () => {
    await load()
    const adders = screen.getAllByRole('button', { name: t('editor.addStepsShort') })
    fireEvent.click(adders[adders.length - 1]!)
    fireEvent.click(screen.getByRole('menuitem', { name: t('editor.addTip') }))
    expect(document.querySelector('.block-card.tip')).not.toBeNull()
  })

  it('اختيار «هيدر» يُرسم بلا رقم، ولا يزيح ترقيم الخطوات', async () => {
    const { client } = await import('../api')
    vi.mocked(client.getGuide).mockResolvedValue(fixture3()) // ٣ خطوات
    renderEditor()
    await ready()
    const adders = screen.getAllByRole('button', { name: t('editor.addStepsShort') })
    // أدرج هيدرًا قبل الخطوة الثانية (موضع 1)
    fireEvent.click(adders[1]!)
    fireEvent.click(screen.getByRole('menuitem', { name: t('editor.addHeader') }))
    expect(document.querySelector('.block-card.header')).not.toBeNull()
    // أرقام الخطوات تبقى ١..٣ (الكتلة لا تأخذ رقمًا) — لا رقم مكرّر ولا قفزة
    const nums = Array.from(document.querySelectorAll('.step-num')).map((n) => n.textContent)
    expect(nums).toEqual(['1', '2', '3'])
  })

  it('«خطوة» يدوية بلا لقطة تُظهر «أضف لقطة»، والرفع يستدعي uploadBlob', async () => {
    const { client } = await import('../api')
    await load()
    const adders = screen.getAllByRole('button', { name: t('editor.addStepsShort') })
    fireEvent.click(adders[adders.length - 1]!)
    fireEvent.click(screen.getByRole('menuitem', { name: t('editor.addStepManual') }))
    const attach = await screen.findByText(t('editor.addShot'))
    const input = attach.closest('label')!.querySelector('input[type="file"]') as HTMLInputElement
    const file = new File(['x'], 'shot.png', { type: 'image/png' })
    fireEvent.change(input, { target: { files: [file] } })
    expect(vi.mocked(client.uploadBlob)).toHaveBeenCalledWith(file, 'shot.png')
  })
})

describe('نافذة المشاركة — تبويبات نظيفة بدل الأزرار المبعثرة', () => {
  it('زر «مشاركة» يفتح النافذة بتبويباتها الثلاثة', async () => {
    const { client } = await import('../api')
    vi.mocked(client.getGuide).mockResolvedValue(fixture())
    renderEditor()
    await screen.findByText('دليل الفواتير')

    expect(screen.queryByRole('dialog')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: t('editor.shareOpen') }))

    const dialog = screen.getByRole('dialog')
    expect(dialog.getAttribute('aria-label')).toBe(t('editor.shareDialogTitle'))
    expect(screen.getByRole('tab', { name: t('editor.shareTabLink') })).toBeTruthy()
    expect(screen.getByRole('tab', { name: t('editor.shareTabEmbed') })).toBeTruthy()
    expect(screen.getByRole('tab', { name: t('editor.shareTabExport') })).toBeTruthy()
  })

  it('قرار المالك 2026-09-10: فتح النافذة لا ينشئ الرابط — زر «أنشئ رابط مشاركة» هو الذي ينشئه', async () => {
    const { client } = await import('../api')
    vi.mocked(client.getGuide).mockResolvedValue(fixture())
    vi.mocked(client.createShare).mockResolvedValue({ token: 'tok', shareUrl: '/s/tok', views: 0 })
    renderEditor()
    await screen.findByText('دليل الفواتير')
    fireEvent.click(screen.getByRole('button', { name: t('editor.shareOpen') }))

    // بلا توليد بفتح النافذة: زر الإنشاء الصريح ظاهر، ولا نداء createShare
    expect(screen.queryByRole('button', { name: t('editor.copyLink') })).toBeNull()
    expect(vi.mocked(client.createShare)).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: t('editor.shareEnable') }))
    expect(await screen.findByRole('button', { name: t('editor.copyLink') })).toBeTruthy()
    expect(vi.mocked(client.createShare)).toHaveBeenCalledWith('g1')
  })

  it('بلا رابط مشاركة: تبويب التضمين يطلب تفعيل الرابط أولًا — لا كود مضلّل', async () => {
    const { client } = await import('../api')
    // بلا رابط: الإنشاء التلقائي لا ينتج رابطًا (نعزله عن اختبار الإنشاء السابق)
    vi.mocked(client.createShare).mockReset()
    vi.mocked(client.getGuide).mockResolvedValue(fixture())
    renderEditor()
    await screen.findByText('دليل الفواتير')
    fireEvent.click(screen.getByRole('button', { name: t('editor.shareOpen') }))
    fireEvent.click(screen.getByRole('tab', { name: t('editor.shareTabEmbed') }))
    expect(screen.getByText(t('editor.embedNeedsShare'))).toBeTruthy()
  })

  it('تبويب التصدير يحمل أزرار Markdown والنسخ الغني والطباعة', async () => {
    const { client } = await import('../api')
    vi.mocked(client.getGuide).mockResolvedValue(fixture())
    renderEditor()
    await screen.findByText('دليل الفواتير')
    fireEvent.click(screen.getByRole('button', { name: t('editor.shareOpen') }))
    fireEvent.click(screen.getByRole('tab', { name: t('editor.shareTabExport') }))
    expect(screen.getByRole('button', { name: t('common.exportMarkdown') })).toBeTruthy()
    expect(screen.getByRole('button', { name: t('editor.copyHtml') })).toBeTruthy()
    expect(screen.getByRole('button', { name: t('common.print') })).toBeTruthy()
  })

  it('Esc يغلق النافذة', async () => {
    const { client } = await import('../api')
    vi.mocked(client.getGuide).mockResolvedValue(fixture())
    renderEditor()
    await screen.findByText('دليل الفواتير')
    fireEvent.click(screen.getByRole('button', { name: t('editor.shareOpen') }))
    expect(screen.getByRole('dialog')).toBeTruthy()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})

describe('EDT-10 تراجع/إعادة في المحرر', () => {
  it('Ctrl+Z يعيد العنوان السابق وCtrl+Shift+Z يعيد التحرير', async () => {
    await load()
    const title = screen.getByDisplayValue('دليل الفواتير')
    fireEvent.change(title, { target: { value: 'عنوان جديد' } })
    expect(screen.getByDisplayValue('عنوان جديد')).toBeTruthy()

    fireEvent.keyDown(document, { key: 'z', ctrlKey: true })
    expect(screen.getByDisplayValue('دليل الفواتير')).toBeTruthy()

    fireEvent.keyDown(document, { key: 'z', ctrlKey: true, shiftKey: true })
    expect(screen.getByDisplayValue('عنوان جديد')).toBeTruthy()
  })

  it('حذف خطوة ثم Ctrl+Z يعيدها', async () => {
    await load()
    // S6: الحذف زرّ ظاهر في رأس البطاقة — نقرة واحدة بلا قائمة تُفتح قبله
    fireEvent.click(screen.getByRole('button', { name: t('editor.removeStep') }))
    expect(screen.queryByDisplayValue('اضغط زر الإنشاء')).toBeNull()

    fireEvent.keyDown(document, { key: 'z', ctrlKey: true })
    expect(screen.getByDisplayValue('اضغط زر الإنشاء')).toBeTruthy()
  })
})

/**
 * S6: «في كل بطاقة نريد خيار الحذف يكون ظاهر وعند التحويم اظهر خيار تكرار».
 * الحذف صار زرًّا مباشرًا لا بندًا في قائمة ⋯، وبجواره تكرار الخطوة.
 */
describe('S6 حذف ظاهر + تكرار الخطوة', () => {
  it('الحذف زرّ مباشر في وضع التعديل — لا قائمة تُفتح قبله', async () => {
    await load()
    const del = screen.getByRole('button', { name: t('editor.removeStep') })
    // لا قائمة منبثقة في الشجرة أصلًا — الحذف بنقرة واحدة لا بنقرتين
    expect(screen.queryByRole('menu')).toBeNull()
    fireEvent.click(del)
    expect(screen.queryByDisplayValue('اضغط زر الإنشاء')).toBeNull()
  })

  it('التكرار ينسخ الخطوة بمعرّف جديد ويضعها بعدها مباشرة، وTراجع واحد يلغيه', async () => {
    const { client } = await import('../api')
    vi.mocked(client.getGuide).mockResolvedValue(fixture3())
    renderEditor()
    await ready()
    const titles = () =>
      (screen.getAllByRole('textbox', { name: /عنوان الخطوة/ }) as HTMLInputElement[]).map(
        (i) => i.value,
      )
    expect(titles()).toEqual(['اضغط زر الإنشاء', 'خطوة رقم 2', 'خطوة رقم 3'])

    fireEvent.click(screen.getAllByRole('button', { name: t('editor.duplicateStep') })[0]!)
    expect(titles()).toEqual([
      'اضغط زر الإنشاء',
      'اضغط زر الإنشاء',
      'خطوة رقم 2',
      'خطوة رقم 3',
    ])

    // معرّف جديد لا مكرّر: كتلة كل خطوة تحمل id فريدًا (مفاتيح React سليمة)
    const ids = Array.from(document.querySelectorAll('.step-block')).map((el) => el.id)
    expect(new Set(ids).size).toBe(ids.length)

    // دفعة تراجع واحدة — Ctrl+Z يعيد الدليل لثلاث خطوات
    fireEvent.keyDown(document, { key: 'z', ctrlKey: true })
    expect(titles()).toEqual(['اضغط زر الإنشاء', 'خطوة رقم 2', 'خطوة رقم 3'])
  })
})

describe('EDT-13 النص البديل', () => {
  it('حقل alt يعرض القيمة المحفوظة ويقبل التحرير', async () => {
    await load()
    const alt = screen.getByLabelText(t('editor.altLabel'))
    expect(alt).toBeTruthy()
    expect((alt as HTMLInputElement).value).toBe('زر الإنشاء في أعلى يمين الشاشة')
    fireEvent.change(alt, { target: { value: 'وصف أعدل' } })
    expect((screen.getByLabelText(t('editor.altLabel')) as HTMLInputElement).value).toBe('وصف أعدل')
  })
})

describe('أزرار «+» بين الشرائح — مواضع إدراج مرئية', () => {
  async function load3() {
    const { client } = await import('../api')
    vi.mocked(client.getGuide).mockResolvedValue(fixture3())
    renderEditor()
    await ready()
    return client
  }

  it('دليل بثلاث خطوات يعرض أربعة مواضع إدراج: قبل كل خطوة + في النهاية', async () => {
    await load3()
    expect(screen.getAllByRole('button', { name: t('editor.addStepsShort') })).toHaveLength(4)
    for (const no of [1, 2, 3]) expect(screen.getByTitle(t('editor.insertBefore', { no }))).toBeTruthy()
    expect(screen.getByTitle(t('editor.insertAtEnd'))).toBeTruthy()
  })

  it('دليل بخطوة واحدة يعرض موضعين فقط: قبلها وبعدها — ودليلًا فارغًا موضعًا واحدًا', async () => {
    const { client } = await import('../api')
    vi.mocked(client.getGuide).mockResolvedValue(fixture())
    const { unmount } = renderEditor()
    await ready()
    expect(screen.getAllByRole('button', { name: t('editor.addStepsShort') })).toHaveLength(2)
    unmount()

    const empty = fixture()
    empty.guide.steps = []
    vi.mocked(client.getGuide).mockResolvedValue(empty)
    renderEditor()
    await screen.findByText(t('editor.emptyTitle'))
    fireEvent.click(screen.getByRole('button', { name: t('editor.edit') }))
    expect(screen.getAllByRole('button', { name: t('editor.addStepsShort') })).toHaveLength(1)
  })

  it('قرار المالك 2026-09-10: «التقاط» غاب من القائمة — «خطوة» تدرج خطوة يدوية في موضعها', async () => {
    await load3()
    expect(screen.queryByRole('menuitem', { name: t('editor.addCaptureItem') })).toBeNull()
    fireEvent.click(screen.getByTitle(t('editor.insertBefore', { no: 2 })))
    fireEvent.click(screen.getByRole('menuitem', { name: t('editor.addStepManual') }))
    // أربع خطوات بعد الإدراج — والجديدة بلا لقطة فتعرض «أضف لقطة»
    expect(await screen.findByText(t('common.steps', { count: '٤' }))).toBeTruthy()
    expect(screen.getByText(t('editor.attachShot'))).toBeTruthy()
  })
})


/** دربني في المحرر — دليل تحمل خطوته الأولى مرساة (AUTO-01) */
function fixtureAnchored(): GuideDetailsDto {
  const f = fixture()
  f.guide.steps[0]!.target = { anchor: [{ k: 'id', v: 'btn-new-invoice' }] }
  return f
}

function renderTrainEditor(timeoutMs?: number) {
  return render(
    <MemoryRouter initialEntries={['/g/g1']}>
      <Routes>
        <Route path="/g/:id" element={<EditorPage trainAckTimeoutMs={timeoutMs} />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('دربني في شاشة التحرير — جرّب التدريب بلا مشاركة', () => {
  it('الزر يظهر حين تحمل خطوة بطاقة تعريف، ويغيب للأدلة القديمة بلا مراسٍ', async () => {
    vi.mocked(client.getGuide).mockResolvedValue(fixtureAnchored())
    const { unmount } = renderTrainEditor()
    expect(await screen.findByRole('button', { name: t('viewer.train') })).toBeTruthy()
    unmount()

    vi.mocked(client.getGuide).mockResolvedValue(fixture())
    renderTrainEditor()
    await ready()
    expect(screen.queryByRole('button', { name: t('viewer.train') })).toBeFalsy()
  })

  it('النقر يجسر الدليل الحالي كاملًا بمراسيه إلى الامتداد — بلا حاجة لمشاركة', async () => {
    vi.mocked(client.getGuide).mockResolvedValue(fixtureAnchored())
    const postSpy = vi.spyOn(window, 'postMessage')
    renderTrainEditor()
    fireEvent.click(await screen.findByRole('button', { name: t('viewer.train') }))
    await waitFor(() => {
      const call = postSpy.mock.calls.find((c) => (c[0] as { t?: string })?.t === 'train-start')
      expect(call, 'رسالة train-start عبر الجسر').toBeTruthy()
      expect((call![0] as { source?: string }).source).toBe('dalili-web')
      const guide = (call![0] as { guide?: { steps?: Array<{ target?: { anchor?: unknown[] } }> } }).guide
      expect(guide?.steps?.[0]?.target?.anchor).toEqual([{ k: 'id', v: 'btn-new-invoice' }])
    })
    postSpy.mockRestore()
  })

  it('بلا امتداد (لا ردّ): رسالة عربية صادقة — لا صمت', async () => {
    vi.mocked(client.getGuide).mockResolvedValue(fixtureAnchored())
    renderTrainEditor(40)
    fireEvent.click(await screen.findByRole('button', { name: t('viewer.train') }))
    expect(await screen.findByText(t('viewer.trainNoExt'))).toBeTruthy()
  })

  it('ردّ الامتداد بخطأ يظهر نصه كما هو', async () => {
    vi.mocked(client.getGuide).mockResolvedValue(fixtureAnchored())
    renderTrainEditor()
    fireEvent.click(await screen.findByRole('button', { name: t('viewer.train') }))
    const ack = new MessageEvent('message', {
      data: { source: 'dalili-ext', t: 'train-ack', ok: false, errorAr: 'هذا الدليل أُنشئ قبل خاصية التدريب' },
    })
    fireEvent(window, ack)
    expect(await screen.findByText('هذا الدليل أُنشئ قبل خاصية التدريب')).toBeTruthy()
  })
})

/**
 * S5: «خيار التبديل بين الشرائح وتحريكها وخيار تحديد الكل او الجزء».
 * التحديد يعيد استعمال منطق `lib/selection.ts` نفسه الذي تستعمله المكتبة —
 * مصدر واحد للمدى والمرصاد، فلا منطقان يتباعدان بين الشاشتين.
 */
describe('S5 تحديد متعدد وإجراءات جماعية على الخطوات', () => {
  const pick = (no: number) => screen.getByRole('checkbox', { name: t('editor.pickStep', { no }) })
  const titles = () =>
    (screen.getAllByRole('textbox', { name: /عنوان الخطوة/ }) as HTMLInputElement[]).map((i) => i.value)

  async function load3() {
    vi.mocked(client.getGuide).mockResolvedValue(fixture3())
    renderEditor()
    await ready()
  }

  it('لا شريط جماعي قبل التحديد، وتحديد خطوتين يُظهر العدد', async () => {
    await load3()
    expect(screen.queryByRole('toolbar', { name: t('editor.bulkBar') })).toBeNull()
    fireEvent.click(pick(1))
    fireEvent.click(pick(2))
    expect(screen.getByRole('toolbar', { name: t('editor.bulkBar') })).toBeTruthy()
    expect(screen.getByText(t('editor.selectedCount', { count: 2 }))).toBeTruthy()
  })

  it('تحديد خطوتين ثم حذف المحدّد يزيلهما دفعة واحدة يعكسها تراجع واحد', async () => {
    await load3()
    fireEvent.click(pick(1))
    fireEvent.click(pick(2))
    fireEvent.click(screen.getByRole('button', { name: t('editor.removeSelected') }))
    expect(titles()).toEqual(['خطوة رقم 3'])
    // دفعة `commit` واحدة — لا ثلاث تراجعات لحذف واحد
    fireEvent.keyDown(document, { key: 'z', ctrlKey: true })
    expect(titles()).toEqual(['اضغط زر الإنشاء', 'خطوة رقم 2', 'خطوة رقم 3'])
  })

  it('Shift+Click يمدّ المدى من المرصاد فيحدّد الثلاث بنقرتين', async () => {
    await load3()
    fireEvent.click(pick(1))
    fireEvent.click(pick(3), { shiftKey: true })
    expect(screen.getByText(t('editor.selectedCount', { count: 3 }))).toBeTruthy()
    expect((pick(2) as HTMLInputElement).checked).toBe(true)
  })

  it('«تحديد الكل» يحدّد الجميع و«إلغاء التحديد» يُخفي الشريط', async () => {
    await load3()
    fireEvent.click(pick(1))
    fireEvent.click(screen.getByRole('button', { name: t('editor.selectAll') }))
    expect(screen.getByText(t('editor.selectedCount', { count: 3 }))).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: t('editor.clearSelection') }))
    expect(screen.queryByRole('toolbar', { name: t('editor.bulkBar') })).toBeNull()
  })

  it('«تكرار المحدّد» ينسخ كل محدَّدة بعدها مباشرة بمعرّف فريد', async () => {
    await load3()
    fireEvent.click(pick(1))
    fireEvent.click(screen.getByRole('button', { name: t('editor.duplicateSelected') }))
    expect(titles()).toEqual(['اضغط زر الإنشاء', 'اضغط زر الإنشاء', 'خطوة رقم 2', 'خطوة رقم 3'])
    const ids = Array.from(document.querySelectorAll('.step-block')).map((el) => el.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('مغادرة وضع التعديل تفرّغ التحديد', async () => {
    await load3()
    fireEvent.click(pick(1))
    expect(screen.getByRole('toolbar', { name: t('editor.bulkBar') })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: t('editor.done') }))
    fireEvent.click(screen.getByRole('button', { name: t('editor.edit') }))
    expect(screen.queryByRole('toolbar', { name: t('editor.bulkBar') })).toBeNull()
  })

  /**
   * السحب إضافة لا بديل: من لا يستطيع السحب (لوحة مفاتيح، قارئ شاشة) يرتّب
   * بالسهمين. حذفهما لصالح السحب انحدارٌ في الوصولية لا تحسينٌ في التجربة.
   */
  it('مقبض السحب يظهر بجانب سهمَي الترتيب — ولا يحلّ محلّهما', async () => {
    await load3()
    const handles = screen.getAllByRole('button', { name: t('editor.dragStep') })
    expect(handles).toHaveLength(3)
    expect(handles[0]!.getAttribute('draggable')).toBe('true')
    expect(screen.getAllByRole('button', { name: t('editor.moveUp') })).toHaveLength(3)
    expect(screen.getAllByRole('button', { name: t('editor.moveDown') })).toHaveLength(3)
  })
})

/**
 * S4 (البند المُرحَّل من م٦): لوحة الحبر وحدها لا تكفي — «غيّر لون التحديد»
 * يعني إعادة تلوين إطار قائم، وذلك يحتاج جوابًا على «أيّ خطوة؟». التحديد هو الجواب.
 * ولقطة قديمة إطارها مخبوز في البكسل بلا `mark` تُتخطّى بصمت: لا تلوين كاذبًا ولا رميًا.
 */
describe('S4 إعادة تلوين إطار الهدف للخطوات المحدَّدة', () => {
  it('يلوّن ذات العلامة ويتخطّى بصمت من لا علامة لها', async () => {
    vi.mocked(client.getGuide).mockResolvedValue(fixtureMarked())
    vi.mocked(client.updateGuide).mockClear()
    renderEditor()
    await ready()
    openPen()

    // أزرق من لوحة الحبر — غير البرتقالي المحفوظ، فالفرق قابل للقياس
    fireEvent.click(
      screen.getByRole('button', { name: t('editor.markColorNamed', { name: t('editor.colorBlue') }) }),
    )
    fireEvent.click(screen.getByRole('checkbox', { name: t('editor.pickStep', { no: 1 }) }))
    fireEvent.click(screen.getByRole('checkbox', { name: t('editor.pickStep', { no: 2 }) }))
    fireEvent.click(screen.getByRole('button', { name: t('editor.recolorTarget') }))

    await waitFor(
      () => {
        const g = lastSaved()
        expect(shotOf(g, 0)!.mark).toEqual({ rect: { x: 10, y: 20, w: 30, h: 40 }, color: '#2563eb' })
        // الثانية بلا `mark` قبل التلوين وبعده — لم تُخترع لها علامة ولم يُرمَ خطأ
        expect(shotOf(g, 1)!.mark).toBeUndefined()
      },
      { timeout: 3000 },
    )
  })

  it('التلوين دفعة تراجع واحدة — Ctrl+Z يعيد اللون الأصلي', async () => {
    vi.mocked(client.getGuide).mockResolvedValue(fixtureMarked())
    vi.mocked(client.updateGuide).mockClear()
    renderEditor()
    await ready()
    openPen()

    fireEvent.click(
      screen.getByRole('button', { name: t('editor.markColorNamed', { name: t('editor.colorGreen') }) }),
    )
    fireEvent.click(screen.getByRole('checkbox', { name: t('editor.pickStep', { no: 1 }) }))
    fireEvent.click(screen.getByRole('button', { name: t('editor.recolorTarget') }))
    await waitFor(() => expect(shotOf(lastSaved(), 0)!.mark!.color).toBe('#16a34a'), { timeout: 3000 })

    fireEvent.keyDown(document, { key: 'z', ctrlKey: true })
    await waitFor(() => expect(shotOf(lastSaved(), 0)!.mark!.color).toBe('#ea580c'), { timeout: 3000 })
  })
})

/**
 * طلب المالك 2026-08-31: «عنوان اللقطة يظهر يسارًا والصواب يمينًا مع رقمها»، ومقبض ٦ نقاط لا زر قائمة.
 * طلب المالك 2026-09-01: المقبض ومربّع التحديد **خرجا** من رأس البطاقة إلى شريط
 * جانبي خارج الإطار. فالرأس الآن: الرقم (يمينًا) ثم العنوان ثم الأدوات فقط،
 * والشريط الجانبي (بعد الجسم في DOM = الطرف الأيسر في RTL) يحمل التحديد ثم المقبض.
 */
describe('ترتيب رأس البطاقة والشريط الجانبي — الرقم والعنوان يمينًا، التحكم خارج البطاقة', () => {
  it('الرأس: الرقم ثم العنوان ثم كبسولة الرابط ثم الأدوات — بلا مقبض ولا تحديد داخله', async () => {
    await load()
    const head = document.querySelector('.step-head') as HTMLElement
    const kids = Array.from(head.children)
    const at = (sel: string) => kids.findIndex((c) => c.matches(sel))
    expect(at('.step-num')).toBe(0)
    // طلب المالك 2026-09-09: العنوان والملاحظة إطار واحد — الحاوية مكان الحقل مباشرة
    expect(at('.step-title-field')).toBe(1)
    expect(head.querySelector('.step-title-field textarea.step-title-input')).toBeTruthy()
    expect(at('.step-url-pill')).toBe(2)
    expect(at('.step-tools')).toBe(3)
    // خرجا من الرأس
    expect(head.querySelector('.step-pick')).toBeNull()
    expect(head.querySelector('.drag-handle')).toBeNull()
  })

  it('الشريط الجانبي: التحديد ثم المقبض، وهو أول عنصر في الصف (الطرف الأيمن في RTL)', async () => {
    await load()
    const row = document.querySelector('.step-card-row') as HTMLElement
    const rail = row.querySelector('.step-rail') as HTMLElement
    // الشريط أول عنصر في الصف كي يقع على اليمين في RTL
    expect(row.firstElementChild).toBe(rail)
    const railKids = Array.from(rail.children)
    expect(railKids.findIndex((c) => c.matches('.step-pick'))).toBe(0)
    expect(railKids.findIndex((c) => c.matches('.drag-handle'))).toBe(1)
  })

  it('المقبض أيقونة ٦ نقاط (لا قائمة) draggable بتسمية السحب', async () => {
    await load()
    const handle = document.querySelector('.drag-handle') as HTMLElement
    expect(handle.getAttribute('draggable')).toBe('true')
    expect(handle.getAttribute('aria-label')).toBe(t('editor.dragStep'))
    const d = handle.querySelector('svg path')?.getAttribute('d') ?? ''
    expect((d.match(/h\.01/g) ?? []).length).toBe(6) // ست نقاط
  })
})

describe('التحسينات البصرية المماثلة للتطبيق المرجعي (Scribe)', () => {
  it('وصف الدليل: يمكن تحريره في وضع التعديل ويُحفظ تلقائياً في الدليل', async () => {
    await load()
    const descInput = screen.getByLabelText(t('editor.descA11y')) as HTMLTextAreaElement
    expect(descInput).toBeTruthy()
    fireEvent.change(descInput, { target: { value: 'دليل شامل لإصدار وتدقيق فواتير التوريد' } })
    await waitFor(() => expect(lastSaved().description).toBe('دليل شامل لإصدار وتدقيق فواتير التوريد'))
  })

  it('شارات المواقع الملتقطة: تستخرج النطاقات وتعرض شاراتها في رأس الدليل', async () => {
    await load()
    const badgesRow = document.querySelector('.site-badges-row') as HTMLElement
    expect(badgesRow).toBeTruthy()
    expect(screen.getByText('Erp')).toBeTruthy()
  })

  it('كبسولة رابط الخطوة: تعرض رابط الانتقال المباشر وتفتح في نافذة جديدة', async () => {
    await load()
    const pill = document.querySelector('.step-url-pill') as HTMLAnchorElement
    expect(pill).toBeTruthy()
    expect(pill.href).toBe('https://erp.example.com/i')
    expect(pill.target).toBe('_blank')
    expect(pill.querySelector('.step-url-text')?.textContent).toBe('https://erp.example.com/i')
  })
})

describe('شريط المسودة في صفحة الدليل (قرار المالك 2026-09-11)', () => {
  it('الدليل الخاص يعرض شريط «مسودة» وزر نشر ينشر للمساحة ويزيل الشريط', async () => {
    const { client } = await import('../api')
    vi.mocked(client.getGuide).mockResolvedValue({ ...fixture(), visibility: 'private' })
    renderEditor()
    await ready(false)
    expect(screen.getByText(t('editor.draftBarTitle'))).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: t('editor.publishDraftBar') }))
    await waitFor(() => expect(vi.mocked(client.updateGuideMeta)).toHaveBeenCalledWith('g1', { visibility: 'workspace' }))
    await waitFor(() => expect(screen.queryByText(t('editor.draftBarTitle'))).toBeNull())
  })

  it('الدليل المنشور لا يعرض شريط المسودة', async () => {
    vi.mocked(client.getGuide).mockResolvedValue({ ...fixture(), visibility: 'workspace' })
    renderEditor()
    await ready(false)
    expect(screen.queryByText(t('editor.draftBarTitle'))).toBeNull()
  })
})

describe('تلميح «تم» — نقطة الاستعادة (المرحلة ٤)', () => {
  it('أول خروج من التحرير يطمئن أن إصدارًا جديدًا حُفظ', async () => {
    localStorage.clear()
    const { client } = await import('../api')
    vi.mocked(client.getGuide).mockResolvedValue(fixture())
    renderEditor()
    await ready(true)
    fireEvent.click(screen.getByRole('button', { name: t('editor.done') }))
    expect(await screen.findByText(t('editor.doneVersionHint'))).toBeTruthy()
    expect(localStorage.getItem('dalili:doneHint')).toBe('1')
  })

  it('بعد ٣ مرات يصمت التلميح — العمل محفوظ دائمًا بلا إزعاج', async () => {
    localStorage.setItem('dalili:doneHint', '3')
    const { client } = await import('../api')
    vi.mocked(client.getGuide).mockResolvedValue(fixture())
    renderEditor()
    await ready(true)
    fireEvent.click(screen.getByRole('button', { name: t('editor.done') }))
    expect(screen.queryByText(t('editor.doneVersionHint'))).toBeNull()
  })
})
