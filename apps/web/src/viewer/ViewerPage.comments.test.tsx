import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import type { PublicGuideDto, StepCommentDto } from '@dalili/shared'
import { t } from '../i18n'
import { ViewerPage } from './ViewerPage'

vi.mock('../api', () => ({
  client: {
    publicGuide: vi.fn(),
    trackShareView: vi.fn().mockResolvedValue(undefined),
    shareComments: vi.fn(),
    addShareComment: vi.fn(),
  },
  WEB_SHARE_BASE: '/s/',
  webShareUrl: (u: string) => u,
}))

function fixture(): PublicGuideDto {
  return {
    guide: {
      id: 'g1',
      title: 'دليل بتعليق',
      updatedAt: new Date().toISOString(),
      steps: [
        { id: 's1', title: 'الخطوة الأولى', screenshot: { missing: true } },
        { id: 's2', title: 'الخطوة الثانية', screenshot: { missing: true } },
      ],
    },
    sharedAt: new Date().toISOString(),
  } as unknown as PublicGuideDto
}

function guestComment(body: string): StepCommentDto {
  return {
    id: `c-${body}`,
    stepId: 's1',
    parentId: null,
    author: 'سعد',
    isOwner: false,
    body,
    resolved: false,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  }
}

function renderViewer() {
  return render(
    <MemoryRouter initialEntries={['/s/tok-c']}>
      <Routes>
        <Route path="/s/:token" element={<ViewerPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

/** GM-05: التعليق من العارض العام — الضيف يفتح خيط الخطوة ويعلّق بلا حساب */
describe('تعليقات العارض العام (GM-05)', () => {
  it('زر التعليق يحمل عدّ خطوته، وفتحه يعرض خيوطها، والإرسال يظهر تعليق الضيف فورًا', async () => {
    const { client } = await import('../api')
    vi.mocked(client.publicGuide).mockResolvedValue(fixture())
    vi.mocked(client.shareComments).mockResolvedValue({ comments: [guestComment('الزر لا يظهر عندي')] })
    vi.mocked(client.addShareComment).mockImplementation(async (_tok, input) => ({
      comment: { ...guestComment(input.body), author: input.author ?? '' },
    }))
    renderViewer()

    const btn = await screen.findByRole('button', { name: t('comments.toggleA11y', { count: 1 }) })
    // خطوة ثانية بلا تعليقات — عدّها صفر، والزر موجود لكل خطوة
    expect(screen.getByRole('button', { name: t('comments.toggleA11y', { count: 0 }) })).toBeTruthy()

    fireEvent.click(btn)
    expect(screen.getByText('الزر لا يظهر عندي')).toBeTruthy()

    fireEvent.change(screen.getByLabelText(t('comments.nameA11y')), { target: { value: 'خالد' } })
    fireEvent.change(screen.getByPlaceholderText(t('comments.placeholder')), { target: { value: 'عندي نفس المشكلة' } })
    fireEvent.click(screen.getByRole('button', { name: t('comments.send') }))

    await waitFor(() =>
      expect(client.addShareComment).toHaveBeenCalledWith('tok-c', {
        stepId: 's1',
        body: 'عندي نفس المشكلة',
        author: 'خالد',
        parentId: undefined,
      }),
    )
    expect(await screen.findByText('عندي نفس المشكلة')).toBeTruthy()
    // اسم الضيف الذي كتبه يظهر على تعليقه — هوية بلا حساب
    expect(screen.getByText('خالد')).toBeTruthy()
  })

  it('فشل تحميل التعليقات لا يُسقط الدليل — رسالة صدق وزر إعادة محاولة', async () => {
    const { client } = await import('../api')
    vi.mocked(client.publicGuide).mockResolvedValue(fixture())
    vi.mocked(client.shareComments).mockRejectedValueOnce(new Error('net'))
      .mockResolvedValueOnce({ comments: [guestComment('بعد المحاولة')] })
    renderViewer()

    expect(await screen.findByText('الخطوة الأولى')).toBeTruthy()
    // خطوتان بلا تعليقات — زران بالتسمية نفسها؛ نفتح الأول
    const toggles = await screen.findAllByRole('button', { name: t('comments.toggleA11y', { count: 0 }) })
    fireEvent.click(toggles[0]!)
    expect(screen.getByText(t('comments.loadError'))).toBeTruthy()

    // عدّاد المحاكي تراكمي عبر الملف — نصفره قبل قياس إعادة المحاولة وحدها
    vi.mocked(client.shareComments).mockClear()
    fireEvent.click(screen.getByRole('button', { name: t('common.retry') }))
    await waitFor(() => expect(client.shareComments).toHaveBeenCalledTimes(1))
    expect(await screen.findByText('بعد المحاولة')).toBeTruthy()
  })
})
