import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { StepCommentDto } from '@dalili/shared'
import { t } from '../i18n'
import { GuideComments } from './GuideComments'

function comment(partial: Partial<StepCommentDto> & { id: string }): StepCommentDto {
  return {
    stepId: '',
    kind: 'note',
    parentId: null,
    author: 'سعد',
    isOwner: false,
    body: 'نص تعليق',
    resolved: false,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...partial,
  }
}

afterEach(() => {
  window.localStorage.removeItem('dalili.commenter')
})

function open(comments: StepCommentDto[], props: Partial<Parameters<typeof GuideComments>[0]> = {}) {
  const onAdd = vi.fn().mockResolvedValue(undefined)
  const onEdit = vi.fn().mockResolvedValue(undefined)
  const onResolve = vi.fn().mockResolvedValue(undefined)
  const onDelete = vi.fn().mockResolvedValue(undefined)
  render(
    <GuideComments
      comments={comments}
      canModerate={false}
      onAdd={onAdd}
      onEdit={onEdit}
      onResolve={onResolve}
      onDelete={onDelete}
      {...props}
    />,
  )
  return { onAdd, onEdit, onResolve, onDelete }
}

/** GM-05 تطوّر: تعليقات الدليل — نوعان (مشكلة/تعليق) بلا ربط خطوة */
describe('GuideComments', () => {
  it('الزر يحمل عدّ الدليل كله (بلا تصفية خطوة)، وفتحه يعرض الخيوط والردود', () => {
    open([comment({ id: 'c1' }), comment({ id: 'r1', parentId: 'c1', body: 'جواب الضيف' }), comment({ id: 'c2', body: 'تعليق ثانٍ' })])
    // كل تعليقات الدليل تُحسب: أصلان + رد = 3
    const btn = screen.getByRole('button', { name: t('comments.toggleA11y', { count: 3 }) })
    fireEvent.click(btn)
    expect(screen.getByText('نص تعليق')).toBeTruthy()
    expect(screen.getByText('جواب الضيف')).toBeTruthy()
    expect(screen.getByText('تعليق ثانٍ')).toBeTruthy()
    expect(screen.queryByText(t('comments.empty'))).toBeNull()
  })

  it('أصل من نوع «مشكلة» يعرض معلَم المشكلة الأحمر', () => {
    open([comment({ id: 'c1', kind: 'issue', body: 'الزر لا يعمل' })])
    fireEvent.click(screen.getByRole('button', { name: t('comments.toggleA11y', { count: 1 }) }))
    expect(screen.getByText(t('comments.issueBadge'))).toBeTruthy()
  })

  it('بلا تعليقات: حالة فارغة صادقة بعد الفتح', () => {
    open([])
    fireEvent.click(screen.getByRole('button', { name: t('comments.toggleA11y', { count: 0 }) }))
    expect(screen.getByText(t('comments.empty'))).toBeTruthy()
  })

  it('الضيف: الإرسال يمرر النوع والاسم والنص، ويحفظ الاسم محليًا', async () => {
    const { onAdd } = open([])
    fireEvent.click(screen.getByRole('button', { name: t('comments.toggleA11y', { count: 0 }) }))
    fireEvent.change(screen.getByLabelText(t('comments.nameA11y')), { target: { value: 'خالد' } })
    fireEvent.change(screen.getByPlaceholderText(t('comments.placeholder')), { target: { value: 'ملاحظتي' } })
    fireEvent.click(screen.getByRole('button', { name: t('comments.send') }))
    await waitFor(() => expect(onAdd).toHaveBeenCalledWith('ملاحظتي', { kind: 'note', author: 'خالد' }))
    expect(window.localStorage.getItem('dalili.commenter')).toBe('خالد')
    expect((screen.getByPlaceholderText(t('comments.placeholder')) as HTMLTextAreaElement).value).toBe('')
  })

  it('اختيار «تبليغ مشكلة» يبدّل النص التوضيحي ويرسل النوع issue', async () => {
    const { onAdd } = open([])
    fireEvent.click(screen.getByRole('button', { name: t('comments.toggleA11y', { count: 0 }) }))
    fireEvent.click(screen.getByRole('button', { name: t('comments.kindIssue') }))
    const box = screen.getByPlaceholderText(t('comments.placeholderIssue'))
    fireEvent.change(box, { target: { value: 'الصفحة لا تفتح' } })
    fireEvent.click(screen.getByRole('button', { name: t('comments.send') }))
    await waitFor(() => expect(onAdd).toHaveBeenCalledWith('الصفحة لا تفتح', { kind: 'issue', author: undefined }))
  })

  it('فشل الإرسال: رسالة صدق والنص يبقى كي لا يعيد كتابته', async () => {
    const { onAdd } = open([])
    onAdd.mockRejectedValue(new Error('network'))
    fireEvent.click(screen.getByRole('button', { name: t('comments.toggleA11y', { count: 0 }) }))
    const box = screen.getByPlaceholderText(t('comments.placeholder'))
    fireEvent.change(box, { target: { value: 'تعليق لن يصل' } })
    fireEvent.click(screen.getByRole('button', { name: t('comments.send') }))
    expect(await screen.findByText(t('comments.sendError'))).toBeTruthy()
    expect((box as HTMLTextAreaElement).value).toBe('تعليق لن يصل')
  })

  it('الرد يفتح صندوقًا داخل خيطه ويمرر معرّف الأصل ونوعه', async () => {
    const { onAdd } = open([comment({ id: 'c1', kind: 'issue' })])
    fireEvent.click(screen.getByRole('button', { name: t('comments.toggleA11y', { count: 1 }) }))
    fireEvent.click(screen.getByRole('button', { name: t('comments.reply') }))
    fireEvent.change(screen.getByPlaceholderText(t('comments.replyPlaceholder')), { target: { value: 'شكرًا وضح' } })
    const sendButtons = screen.getAllByRole('button', { name: t('comments.send') })
    fireEvent.click(sendButtons[0]!)
    await waitFor(() => expect(onAdd).toHaveBeenCalledWith('شكرًا وضح', { kind: 'issue', parentId: 'c1', author: undefined }))
  })

  it('المالك: وسم محلول وتعديل وحذف بأزراره؛ تعديل نص يمر بـonEdit', async () => {
    const handlers = open([comment({ id: 'c1' })], { canModerate: true })
    fireEvent.click(screen.getByRole('button', { name: t('comments.toggleA11y', { count: 1 }) }))

    fireEvent.click(screen.getByRole('button', { name: t('comments.resolve') }))
    await waitFor(() => expect(handlers.onResolve).toHaveBeenCalledWith('c1', true))

    fireEvent.click(screen.getByRole('button', { name: t('comments.edit') }))
    const editor = screen.getByDisplayValue('نص تعليق') as HTMLTextAreaElement
    fireEvent.change(editor, { target: { value: 'نص بعد التعديل' } })
    fireEvent.click(screen.getByRole('button', { name: t('comments.save') }))
    await waitFor(() => expect(handlers.onEdit).toHaveBeenCalledWith('c1', 'نص بعد التعديل'))

    vi.spyOn(window, 'confirm').mockReturnValue(true)
    fireEvent.click(screen.getByRole('button', { name: t('comments.delete') }))
    await waitFor(() => expect(handlers.onDelete).toHaveBeenCalledWith('c1'))
  })

  it('خيط موسوم محلولًا: شارة محلول وزر إعادة فتح بدل الوسم', () => {
    open([comment({ id: 'c1', resolved: true })], { canModerate: true })
    fireEvent.click(screen.getByRole('button', { name: t('comments.toggleA11y', { count: 1 }) }))
    expect(screen.getByText(t('comments.resolvedBadge'))).toBeTruthy()
    expect(screen.getByRole('button', { name: t('comments.unresolve') })).toBeTruthy()
  })

  it('فشل تحميل القائمة: رسالة صدق وزر إعادة محاولة', () => {
    const onRetry = vi.fn()
    open([], { failed: true, onRetry })
    fireEvent.click(screen.getByRole('button', { name: t('comments.toggleA11y', { count: 0 }) }))
    expect(screen.getByText(t('comments.loadError'))).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: t('common.retry') }))
    expect(onRetry).toHaveBeenCalled()
  })

  it('تعليق المالك يعرض شارة «صاحب الدليل» بلا اسم زائر', () => {
    open([comment({ id: 'c1', isOwner: true, author: '' })])
    fireEvent.click(screen.getByRole('button', { name: t('comments.toggleA11y', { count: 1 }) }))
    expect(screen.getByText(t('comments.ownerBadge'))).toBeTruthy()
  })
})
