import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { GuideSummaryDto } from '@dalili/shared'
import { t } from '../i18n'
import { GuideMenuActions } from './GuideMenuActions'
import { GuideCard } from './GuideCard'

vi.mock('../api', () => ({ client: {}, webShareUrl: (u: string) => u }))

/** ب (§٦، §٧، PUB-03): شارات البطاقة وإجراءات المشرف (المدير ومدير القسم) */

function guide(extra: Partial<GuideSummaryDto> = {}): GuideSummaryDto {
  return {
    id: 'g1', title: 'فاتورة مبدئية', createdAt: '2026-10-01T00:00:00Z', updatedAt: '2026-10-01T00:00:00Z', stepCount: 3, kind: 'guide',
    shared: false, starred: false, folderId: null, tags: [], commentCount: 0, openCommentCount: 0, openIssueCount: 0,
    visibility: 'workspace', site: 'erp.example', bookmarked: false, mine: false, views: 0, ownerEmail: 'maker@co.test',
    access: { owner: false, edit: true, publish: true, moderate: true }, pinned: false, verified: null, suspended: false,
    ...extra,
  }
}

const noop = () => {}
function menu(g: GuideSummaryDto, onModerate = vi.fn().mockResolvedValue(true), teams: { id: string; name: string }[] | null = null) {
  render(
    <GuideMenuActions g={g} folders={[]} inTrash={false} onOpen={noop} onBookmark={noop} onDuplicate={noop} onPublish={noop}
      onShare={noop} onMove={noop} onRemove={noop} onRestore={noop} onModerate={onModerate} teams={teams} />,
  )
  return onModerate
}

describe('إشراف الدليل (ب)', () => {
  it('المشرف يثبّت ويوثّق، والمثبّت يُلغى تثبيته', () => {
    const onModerate = menu(guide())
    fireEvent.click(screen.getByRole('button', { name: t('home.pin') }))
    expect(onModerate).toHaveBeenCalledWith({ kind: 'pin' })
    fireEvent.click(screen.getByRole('button', { name: t('home.verify') }))
    expect(onModerate).toHaveBeenCalledWith({ kind: 'verify' })
  })

  it('المثبّت والموثّق والموقوف: أزرار العكس', () => {
    const onModerate = menu(guide({ pinned: true, verified: { at: '2026-10-30T00:00:00Z', byName: 'المدير' }, suspended: true }))
    fireEvent.click(screen.getByRole('button', { name: t('home.unpin') }))
    fireEvent.click(screen.getByRole('button', { name: t('home.unverify') }))
    fireEvent.click(screen.getByRole('button', { name: t('home.resume') }))
    expect(onModerate.mock.calls.map((c) => c[0])).toEqual([{ kind: 'unpin' }, { kind: 'unverify' }, { kind: 'resume' }])
  })

  it('غير المشرف لا يرى إجراءات الإشراف', () => {
    menu(guide({ access: { owner: false, edit: false, publish: false, moderate: false } }))
    expect(screen.queryByRole('button', { name: t('home.pin') })).toBeNull()
    expect(screen.queryByRole('button', { name: t('home.suspend') })).toBeNull()
  })

  it('نافذة الإيقاف تشترط السبب', async () => {
    const onModerate = menu(guide())
    fireEvent.click(screen.getByRole('button', { name: t('home.suspend') }))
    fireEvent.click(screen.getByRole('button', { name: t('home.suspendConfirm') }))
    expect(screen.getByRole('alert').textContent).toContain(t('home.suspendNeedReason'))
    expect(onModerate).not.toHaveBeenCalled()

    fireEvent.change(screen.getByLabelText(t('home.suspendReason')), { target: { value: 'الشاشة تغيّرت' } })
    fireEvent.click(screen.getByRole('button', { name: t('home.suspendConfirm') }))
    await waitFor(() => expect(onModerate).toHaveBeenCalledWith({ kind: 'suspend', reason: 'الشاشة تغيّرت' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })

  it('المدير يغيّر قسم الدليل', () => {
    const onModerate = menu(guide({ ownerTeamId: 'buy' }), undefined, [{ id: 'buy', name: 'المشتريات' }, { id: 'fin', name: 'المالية' }])
    fireEvent.change(screen.getByLabelText(t('home.moveTeam')), { target: { value: 'fin' } })
    expect(onModerate).toHaveBeenCalledWith({ kind: 'team', teamId: 'fin' })
  })

  it('ت (§٥): البطاقة تعرض «جديد» و👁 عدد القرّاء', () => {
    const { container } = render(
      <GuideCard g={guide({ fresh: 'new', readerCount: 24, creatorName: 'سارة العتيبي' })} folders={[]} inTrash={false}
        picked={false} showPick={false} onPick={noop} onOpen={noop} onBookmark={noop} onDuplicate={noop} onPublish={noop} onShare={noop}
        onMove={noop} onRemove={noop} onRestore={noop} onSite={noop} onModerate={vi.fn()} teams={null} />,
    )
    expect(screen.getByText(t('home.badgeNew'))).toBeTruthy()
    const eye = container.querySelector('.readers-chip')!
    expect(eye.textContent).toContain('٢٤')
    expect(eye.getAttribute('title')).toBe(t('home.readersHint', { count: '٢٤' }))
  })

  it('ت (§٥): «تحديث» لما حُدّث بعد قراءتي، ولا شيء بلا حالة', () => {
    const props = { folders: [], inTrash: false, picked: false, showPick: false, onPick: noop, onOpen: noop, onBookmark: noop, onDuplicate: noop, onPublish: noop, onShare: noop, onMove: noop, onRemove: noop, onRestore: noop, onSite: noop, onModerate: vi.fn(), teams: null }
    const { rerender } = render(<GuideCard g={guide({ fresh: 'updated' })} {...props} />)
    expect(screen.getByText(t('home.badgeUpdated'))).toBeTruthy()
    rerender(<GuideCard g={guide({ fresh: null })} {...props} />)
    expect(screen.queryByText(t('home.badgeUpdated'))).toBeNull()
    expect(screen.queryByText(t('home.badgeNew'))).toBeNull()
  })

  it('البطاقة تعرض شارات المثبّت والموثّق والموقوف', () => {
    render(
      <GuideCard g={guide({ pinned: true, verified: { at: '2026-10-30T00:00:00Z', byName: 'المدير' }, suspended: true })} folders={[]} inTrash={false}
        picked={false} showPick={false} onPick={noop} onOpen={noop} onBookmark={noop} onDuplicate={noop} onPublish={noop} onShare={noop}
        onMove={noop} onRemove={noop} onRestore={noop} onSite={noop} onModerate={vi.fn()} teams={null} />,
    )
    expect(screen.getByText(t('home.badgePinned'))).toBeTruthy()
    expect(screen.getByText(t('home.badgeVerified')).closest('[title]')?.getAttribute('title')).toContain('المدير')
    expect(screen.getByText(t('home.badgeSuspended'))).toBeTruthy()
  })
})
