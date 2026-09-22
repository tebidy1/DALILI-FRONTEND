import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import type { GuideDetailsDto, StepDto } from '@dalili/shared'
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
    listGuides: vi.fn().mockResolvedValue({ items: [], total: 0, page: 1, limit: 200 }),
  },
  WEB_SHARE_BASE: '/s/',
  webShareUrl: (u: string) => u,
}))

const blockStep = (over: Partial<StepDto>): StepDto => ({
  id: 'b1',
  kind: 'navigate',
  title: '',
  target: {},
  sensitive: false,
  url: '',
  pageTitle: '',
  ts: 1,
  ...over,
})

function booklet(steps: StepDto[] = []): GuideDetailsDto {
  return {
    guide: {
      id: 'b1',
      schemaVersion: 1,
      kind: 'booklet',
      title: 'دورة الموظف الجديد',
      locale: 'ar',
      dir: 'rtl',
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
      steps,
    },
    share: null,
    meta: { starred: false, folderId: null, tags: [] },
  }
}

function plainGuide(): GuideDetailsDto {
  const b = booklet()
  return { ...b, guide: { ...b.guide, kind: undefined, title: 'دليل عادي' } }
}

async function renderEditor(details: GuideDetailsDto) {
  vi.mocked(client.getGuide).mockResolvedValue(details)
  render(
    <MemoryRouter initialEntries={['/g/b1']}>
      <Routes>
        <Route path="/g/:id" element={<EditorPage />} />
      </Routes>
    </MemoryRouter>,
  )
  // المحرر يفتح على وضع العرض النظيف — ندخل التعديل كي تظهر مواضع الإدراج
  await screen.findByText(details.guide.title)
  fireEvent.click(screen.getByRole('button', { name: t('editor.edit') }))
}

/** BKL-01: المحرر يوجّه بحسب نوع المستند — والمسار القائم للدليل بلا مساس */
describe('محرر الكرّاسة', () => {
  it('قائمة «+» في الكرّاسة تعرض كتلها ولا تعرض الالتقاط', async () => {
    await renderEditor(booklet())
    fireEvent.click((await screen.findAllByRole('button', { name: t('editor.blockMenuOpen') }))[0]!)
    expect(screen.getByRole('menuitem', { name: t('editor.addText') })).toBeTruthy()
    expect(screen.getByRole('menuitem', { name: t('editor.addEmbed') })).toBeTruthy()
    expect(screen.queryByRole('menuitem', { name: t('editor.addCaptureItem') })).toBeNull()
  })

  it('إدراج كتلة نص يضيفها قابلة للكتابة فورًا', async () => {
    await renderEditor(booklet())
    fireEvent.click((await screen.findAllByRole('button', { name: t('editor.blockMenuOpen') }))[0]!)
    fireEvent.click(screen.getByRole('menuitem', { name: t('editor.addText') }))
    expect(await screen.findByRole('textbox', { name: t('editor.richArea') })).toBeTruthy()
  })

  it('«دليل» يفتح المنتقي لا يُدرج كتلة فارغة', async () => {
    await renderEditor(booklet())
    fireEvent.click((await screen.findAllByRole('button', { name: t('editor.blockMenuOpen') }))[0]!)
    fireEvent.click(screen.getByRole('menuitem', { name: t('editor.addEmbed') }))
    expect(await screen.findByRole('dialog', { name: t('editor.embedPickTitle') })).toBeTruthy()
  })

  // E-BKL-04: السقف يُرفض برسالة محددة لا بصمت
  it('بلوغ سقف الأدلة المضمّنة يرفض برسالة محددة', async () => {
    const steps = Array.from({ length: 30 }, (_, i) =>
      blockStep({ id: `e${i}`, block: 'embed', embed: { guideId: `g${i}`, expanded: false } }),
    )
    await renderEditor(booklet(steps))
    fireEvent.click((await screen.findAllByRole('button', { name: t('editor.blockMenuOpen') }))[0]!)
    fireEvent.click(screen.getByRole('menuitem', { name: t('editor.addEmbed') }))
    await waitFor(() => expect(screen.getByText(t('editor.embedLimit'))).toBeTruthy())
  })

  it('كتلة الهيدر تُحرَّر بحقل نصّي وتُحفظ في العنوان', async () => {
    await renderEditor(booklet([blockStep({ block: 'header', title: 'التمهيد' })]))
    const input = await screen.findByLabelText(t('block.headerText'))
    expect((input as HTMLInputElement).value).toBe('التمهيد')
  })

  it('محرر الدليل العادي: قائمته خطوة يدوية بلا الالتقاط ولا كتل الكرّاسة (قرار المالك 2026-09-10)', async () => {
    await renderEditor(plainGuide())
    fireEvent.click((await screen.findAllByRole('button', { name: t('editor.addStepsShort') }))[0]!)
    expect(screen.getByRole('menuitem', { name: t('editor.addStepManual') })).toBeTruthy()
    expect(screen.queryByRole('menuitem', { name: t('editor.addCaptureItem') })).toBeNull()
    expect(screen.queryByRole('menuitem', { name: t('editor.addEmbed') })).toBeNull()
  })
})
