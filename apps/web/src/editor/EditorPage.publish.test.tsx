import { describe, expect, it, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import type { GuideDetailsDto } from '@dalili/shared'
import { t } from '../i18n'
import { client } from '../api'
import { EditorPage } from './EditorPage'

/** ب (PUB-02..04): القارئ يقرأ فقط، والمحرر يرى «تعديلات غير منشورة» وسبب الإيقاف */

vi.mock('../api', () => ({
  client: {
    getGuide: vi.fn(),
    updateGuide: vi.fn().mockResolvedValue(undefined),
    updateGuideMeta: vi.fn().mockResolvedValue({}),
    publishGuide: vi.fn().mockResolvedValue({ ok: true, publishedVersionId: 'v2' }),
    markGuideRead: vi.fn().mockResolvedValue(undefined),
    guideComments: vi.fn().mockResolvedValue({ comments: [] }),
    me: vi.fn().mockResolvedValue({ id: 'u1', email: 'owner@example.com' }),
    updateOfficial: vi.fn(),
  },
  WEB_SHARE_BASE: '/s/',
  webShareUrl: (u: string) => u,
}))

function details(extra: Partial<GuideDetailsDto>): GuideDetailsDto {
  return {
    guide: {
      id: 'g1',
      schemaVersion: 1,
      title: 'دليل الفواتير',
      locale: 'ar',
      dir: 'rtl',
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
      steps: [{ id: 's1', kind: 'click', title: 'اضغط زر الإنشاء', target: {}, sensitive: false, url: 'https://erp.example.com/i', pageTitle: 'الفواتير', ts: 1 }],
    },
    share: null,
    visibility: 'workspace',
    access: { owner: true, edit: true, publish: true, moderate: false },
    publishState: { published: true, hasUnpublishedChanges: false },
    suspension: null,
    ...extra,
  }
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

const OFFICIAL = { official: true, systemId: null, audience: 'all' as const, companyIds: [], systems: [{ id: 'odoo', name: 'أودو' }], clients: [] }

describe('EditorPage — الدليل الرسمي للشريك (ش١)', () => {
  beforeEach(() => vi.clearAllMocks())

  it('دليل الشريك: لوحة «الدليل الرسمي» تحفظ النظام ثم الجمهور «شركات محددة»', async () => {
    vi.mocked(client.getGuide).mockResolvedValue(details({ visibility: 'private', publishState: { published: false, hasUnpublishedChanges: false }, official: OFFICIAL }))
    vi.mocked(client.updateOfficial)
      .mockResolvedValueOnce({ official: { ...OFFICIAL, systemId: 'odoo', clients: [{ id: 'co', name: 'شركة الأفق' }] } })
      .mockResolvedValueOnce({ official: { ...OFFICIAL, systemId: 'odoo', audience: 'listed', companyIds: ['co'], clients: [{ id: 'co', name: 'شركة الأفق' }] } })
    renderEditor()
    const panel = await screen.findByRole('region', { name: 'الدليل الرسمي' }, { timeout: 4000 })
    expect(panel.textContent).toContain('اختر نظام الدليل قبل النشر')
    fireEvent.change(screen.getByLabelText('النظام'), { target: { value: 'odoo' } })
    await waitFor(() => expect(client.updateOfficial).toHaveBeenCalledWith('g1', { systemId: 'odoo' }))
    fireEvent.click(await screen.findByRole('radio', { name: 'شركات محددة' }))
    fireEvent.click(await screen.findByRole('checkbox', { name: 'شركة الأفق' }))
    await waitFor(() => expect(client.updateOfficial).toHaveBeenLastCalledWith('g1', { audience: 'listed', companyIds: ['co'] }))
  })

  it('دليل الشريك الداخلي: مفتاح «رسمي للعملاء» وحده، وتشغيله يحفظ', async () => {
    vi.mocked(client.getGuide).mockResolvedValue(details({ official: { ...OFFICIAL, official: false } }))
    vi.mocked(client.updateOfficial).mockResolvedValueOnce({ official: OFFICIAL })
    renderEditor()
    const toggle = await screen.findByRole('switch', { name: 'دليل رسمي للعملاء' }, { timeout: 4000 })
    expect(toggle.getAttribute('aria-checked')).toBe('false')
    expect(screen.getByRole('region', { name: 'الدليل الرسمي' }).textContent).toContain('دليل داخلي لفريقكم')
    expect(screen.queryByLabelText('النظام')).toBeNull()
    fireEvent.click(toggle)
    await waitFor(() => expect(client.updateOfficial).toHaveBeenCalledWith('g1', { official: true }))
    expect(await screen.findByLabelText('النظام')).toBeTruthy()
  })

  it('ث٣: دليل رسمي يبدأ من سجل محدد = تنبيه غير مانع؛ يبدأ من القائمة = لا تنبيه', async () => {
    const at = (url: string) => {
      const d = details({ official: { ...OFFICIAL, systemId: 'odoo' } })
      d.guide.steps[0]!.url = url
      return d
    }
    vi.mocked(client.getGuide).mockResolvedValue(at('https://demo.odoo.com/odoo/accounting/1/account.move/3'))
    const { unmount } = renderEditor()
    expect(await screen.findByText(t('official.recordWarn'), {}, { timeout: 4000 })).toBeTruthy()
    unmount()
    vi.mocked(client.getGuide).mockResolvedValue(at('https://demo.odoo.com/odoo/accounting/1/account.move'))
    renderEditor()
    await screen.findByRole('region', { name: 'الدليل الرسمي' }, { timeout: 4000 })
    expect(screen.queryByText(t('official.recordWarn'))).toBeNull()
  })

  it('دليل الشركة: لا لوحة رسمية', async () => {
    vi.mocked(client.getGuide).mockResolvedValue(details({}))
    renderEditor()
    await waitFor(() => expect(client.guideComments).toHaveBeenCalled())
    expect(screen.queryByRole('region', { name: 'الدليل الرسمي' })).toBeNull()
  })

  it('رفض النشر E-PRT-01 يظهر بنصه', async () => {
    vi.mocked(client.getGuide).mockResolvedValue(details({ publishState: { published: true, hasUnpublishedChanges: true }, official: OFFICIAL }))
    vi.mocked(client.publishGuide).mockRejectedValueOnce(Object.assign(new Error('اختر نظام الدليل من أنظمتكم قبل النشر (E-PRT-01)'), { status: 400, code: 'E-PRT-01' }))
    renderEditor()
    fireEvent.click(await screen.findByRole('button', { name: t('editor.publishUpdate') }, { timeout: 4000 }))
    expect(await screen.findByText(/E-PRT-01/)).toBeTruthy()
  })
})

describe('EditorPage — الدليل الرسمي عند موظف الشركة (ش٢)', () => {
  beforeEach(() => vi.clearAllMocks())

  it('قراءة فقط، والشريط يقول من أي شريك، ولا لوحة رسمية ولا تعليقات', async () => {
    const none = { owner: false, edit: false, publish: false, moderate: false }
    vi.mocked(client.getGuide).mockResolvedValue(details({ access: none, share: null, source: 'official', partner: { id: 'p1', name: 'نُظم للحلول' } }))
    renderEditor()
    expect(await screen.findByText('دليل رسمي من نُظم للحلول', {}, { timeout: 4000 })).toBeTruthy()
    expect(screen.queryByText(t('editor.readOnlyNote'))).toBeNull()
    expect(screen.queryByRole('region', { name: 'الدليل الرسمي' })).toBeNull()
    await waitFor(() => expect(client.markGuideRead).toHaveBeenCalledWith('g1'))
    expect(client.guideComments).not.toHaveBeenCalled()
  })

  it('لم يعد متاحاً: رسالة الخادم E-OFF-01 بنصها', async () => {
    vi.mocked(client.getGuide).mockRejectedValue(Object.assign(new Error('لم يعد هذا الدليل متاحاً لشركتك (E-OFF-01)'), { status: 404, code: 'E-OFF-01' }))
    renderEditor()
    expect(await screen.findByText(/لم يعد هذا الدليل متاحاً لشركتك/, {}, { timeout: 4000 })).toBeTruthy()
  })
})

describe('EditorPage — النشر والقراءة (ب)', () => {
  beforeEach(() => vi.clearAllMocks())

  it('ت (§٥): القارئ يفتح الدليل فتُسجَّل قراءته مرة', async () => {
    vi.mocked(client.getGuide).mockResolvedValue(details({ access: { owner: false, edit: false, publish: false, moderate: false } }))
    renderEditor()
    await screen.findByText('اضغط زر الإنشاء')
    await waitFor(() => expect(client.markGuideRead).toHaveBeenCalledTimes(1))
    expect(client.markGuideRead).toHaveBeenCalledWith('g1')
  })

  it('ت (§٥): صفحة المحرر لا تسجّل قراءة', async () => {
    vi.mocked(client.getGuide).mockResolvedValue(details({}))
    renderEditor()
    // التعليقات تُجلب لصاحب الدليل بعد تحميله — علامة أن الصفحة حمّلت دليلها
    await waitFor(() => expect(client.guideComments).toHaveBeenCalled())
    expect(client.markGuideRead).not.toHaveBeenCalled()
  })

  it('القارئ يرى الدليل للقراءة فقط بلا زر تعديل', async () => {
    vi.mocked(client.getGuide).mockResolvedValue(details({ access: { owner: false, edit: false, publish: false, moderate: false } }))
    renderEditor()
    expect(await screen.findByText('دليل الفواتير')).toBeTruthy()
    expect(screen.getByText(t('editor.readOnlyNote'))).toBeTruthy()
    expect(screen.queryByRole('button', { name: t('editor.edit') })).toBeNull()
    expect(screen.queryByRole('button', { name: t('editor.shareOpen') })).toBeNull()
  })

  it('تعديلات غير منشورة: الشريط يستدعي «انشر التحديث» ثم يختفي', async () => {
    vi.mocked(client.getGuide).mockResolvedValue(details({ publishState: { published: true, hasUnpublishedChanges: true } }))
    renderEditor()
    expect(await screen.findByText(t('editor.unpublishedBar'))).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: t('editor.publishUpdate') }))
    await waitFor(() => expect(client.publishGuide).toHaveBeenCalledWith('g1'))
    await waitFor(() => expect(screen.queryByText(t('editor.unpublishedBar'))).toBeNull())
  })

  it('بلا صلاحية نشر: الشريط يشرح ولا زر', async () => {
    vi.mocked(client.getGuide).mockResolvedValue(details({ access: { owner: true, edit: true, publish: false, moderate: false }, publishState: { published: true, hasUnpublishedChanges: true } }))
    renderEditor()
    expect(await screen.findByText(t('editor.unpublishedNoPerm'))).toBeTruthy()
    expect(screen.queryByRole('button', { name: t('editor.publishUpdate') })).toBeNull()
  })

  it('مدير القسم يحرر دليل غيره: لا مشاركة ولا تعليقات صاحب الدليل (لا زر ميت)', async () => {
    vi.mocked(client.getGuide).mockResolvedValue(details({ access: { owner: false, edit: true, publish: true, moderate: true } }))
    renderEditor()
    expect(await screen.findByRole('button', { name: t('editor.edit') })).toBeTruthy()
    expect(screen.queryByRole('button', { name: t('editor.shareOpen') })).toBeNull()
    expect(client.guideComments).not.toHaveBeenCalled()
  })

  it('القارئ يفتح دليلاً موقوفاً: رسالة الخادم «موقوف مؤقتاً» لا خطأ تحميل عام', async () => {
    vi.mocked(client.getGuide).mockRejectedValue(Object.assign(new Error('هذا الدليل موقوف مؤقتاً (E-PUB-04)'), { status: 423, code: 'E-PUB-04' }))
    renderEditor()
    expect(await screen.findByText('هذا الدليل موقوف مؤقتاً (E-PUB-04)')).toBeTruthy()
    expect(screen.queryByText(t('editor.loadError'))).toBeNull()
  })

  it('الموقوف: شريط فيه السبب ومن أوقفه', async () => {
    vi.mocked(client.getGuide).mockResolvedValue(details({ suspension: { at: '2026-10-30T00:00:00Z', reason: 'الشاشة تغيّرت', byName: 'مدير المشتريات' } }))
    renderEditor()
    const bar = await screen.findByRole('alert')
    expect(bar.textContent).toContain('الشاشة تغيّرت')
    expect(bar.textContent).toContain('مدير المشتريات')
  })
})
