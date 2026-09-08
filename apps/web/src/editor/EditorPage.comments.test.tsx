import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import type { GuideDetailsDto, StepCommentDto } from '@dalili/shared'
import { t } from '../i18n'
import { EditorPage } from './EditorPage'

vi.mock('../api', () => ({
  client: {
    getGuide: vi.fn(),
    updateGuide: vi.fn().mockResolvedValue(undefined),
    updateGuideMeta: vi.fn().mockResolvedValue({}),
    createShare: vi.fn(),
    revokeShare: vi.fn(),
    transcribeGuide: vi.fn(),
    guideComments: vi.fn(),
    addGuideComment: vi.fn(),
    updateGuideComment: vi.fn(),
    deleteGuideComment: vi.fn(),
  },
  WEB_SHARE_BASE: '/s/',
  webShareUrl: (u: string) => u,
}))

function details(): GuideDetailsDto {
  return {
    guide: {
      id: 'g1',
      schemaVersion: 1,
      title: 'دليل المحرر',
      locale: 'ar',
      dir: 'rtl',
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
      steps: [
        {
          id: 's1',
          kind: 'click',
          title: 'اضغط زر الإنشاء',
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

function guestAsk(body: string): StepCommentDto {
  return {
    id: `c-${body}`,
    stepId: '',
    kind: 'note',
    parentId: null,
    author: 'سعد',
    isOwner: false,
    body,
    resolved: false,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
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

/** GM-05: المالك في المحرر يرى سؤال الضيف، يردّ بعلامة صاحب الدليل، ويسمّي محلولًا */
describe('تعليقات المحرر (GM-05)', () => {
  it('سؤال الضيف يظهر في لوحة الدليل، وردّ المالك يستدعي الخادم بلا اسم', async () => {
    const { client } = await import('../api')
    vi.mocked(client.getGuide).mockResolvedValue(details())
    vi.mocked(client.guideComments).mockResolvedValue({ comments: [guestAsk('هل يلزم دور المدير؟')] })
    vi.mocked(client.addGuideComment).mockImplementation(async (_id, input) => ({
      comment: { ...guestAsk(input.body), isOwner: true, author: '' },
    }))
    renderEditor()

    fireEvent.click(await screen.findByRole('button', { name: t('comments.toggleA11y', { count: 1 }) }))
    expect(screen.getByText('هل يلزم دور المدير؟')).toBeTruthy()
    // المالك بلا حقل اسم — هويته شارة صاحب الدليل
    expect(screen.queryByLabelText(t('comments.nameA11y'))).toBeNull()

    fireEvent.change(screen.getByPlaceholderText(t('comments.placeholder')), { target: { value: 'لا، يكفي دور المحرر' } })
    fireEvent.click(screen.getByRole('button', { name: t('comments.send') }))
    await waitFor(() =>
      expect(client.addGuideComment).toHaveBeenCalledWith('g1', { kind: 'note', body: 'لا، يكفي دور المحرر' }),
    )
    expect(await screen.findByText('لا، يكفي دور المحرر')).toBeTruthy()
    expect(screen.getByText(t('comments.ownerBadge'))).toBeTruthy()
  })

  it('الوسم محلولًا يحدّث التعليق عبر الخادم وتظهر شارة محلول', async () => {
    const { client } = await import('../api')
    vi.mocked(client.getGuide).mockResolvedValue(details())
    vi.mocked(client.guideComments).mockResolvedValue({ comments: [guestAsk('سؤال محلول')] })
    vi.mocked(client.updateGuideComment).mockResolvedValue({
      comment: { ...guestAsk('سؤال محلول'), resolved: true },
    })
    renderEditor()

    fireEvent.click(await screen.findByRole('button', { name: t('comments.toggleA11y', { count: 1 }) }))
    fireEvent.click(screen.getByRole('button', { name: t('comments.resolve') }))
    await waitFor(() => expect(client.updateGuideComment).toHaveBeenCalledWith('g1', 'c-سؤال محلول', { resolved: true }))
    expect(await screen.findByText(t('comments.resolvedBadge'))).toBeTruthy()
  })
})
