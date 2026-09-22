import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { t } from '../i18n'
import { ShareDialog } from './ShareDialog'

/**
 * قرار المالك 2026-09-10: لا توليد تلقائي بفتح النافذة — الرابط ضغطة صريحة،
 * ولا رابط أصلًا لدليل غير منشور (بوابة النشر قبل الرابط).
 */
function setup(opts: { embedTitles?: string[]; published?: boolean } = {}) {
  const onEnsureShare = vi.fn().mockResolvedValue(undefined)
  const onPublish = vi.fn().mockResolvedValue(true)
  const onToggleShare = vi.fn()
  const onClose = vi.fn()
  render(
    <ShareDialog
      title="دورة الموظف"
      share={null}
      embedTitles={opts.embedTitles}
      onClose={onClose}
      onEnsureShare={onEnsureShare}
      onToggleShare={onToggleShare}
      onPublish={onPublish}
      published={opts.published ?? true}
      onExportMarkdown={() => {}}
      onCopyRich={() => {}}
      copiedHtml={false}
      onPrint={() => {}}
    />,
  )
  return { onEnsureShare, onPublish, onToggleShare, onClose }
}

/** BKL-01: لا تسريب صامت ولا حجب مفاجئ — المؤلف يقرر واعيًا قبل توليد الرابط */
describe('قائمة الفحص قبل المشاركة', () => {
  it('كرّاسة تضمّ أدلة تعرض القائمة بأسمائها ولا تولّد الرابط بفتح النافذة', () => {
    const { onEnsureShare } = setup({ embedTitles: ['دليل الفوترة', 'دليل الطلبات'] })
    expect(screen.getByText(t('booklet.shareCheckTitle'))).toBeTruthy()
    expect(screen.getByText('دليل الفوترة')).toBeTruthy()
    expect(screen.getByText('دليل الطلبات')).toBeTruthy()
    expect(onEnsureShare).not.toHaveBeenCalled()
  })

  it('«تابع المشاركة» يفتح تبويب الرابط بزره الصريح — الرابط بضغطه لا قبله', () => {
    const { onEnsureShare, onToggleShare } = setup({ embedTitles: ['دليل الفوترة'] })
    fireEvent.click(screen.getByRole('button', { name: t('booklet.shareCheckGo') }))
    expect(onEnsureShare).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: t('editor.shareEnable') }))
    expect(onToggleShare).toHaveBeenCalled()
    expect(onEnsureShare).not.toHaveBeenCalled()
  })

  it('«إلغاء» يغلق بلا توليد رابط', () => {
    const { onEnsureShare, onClose } = setup({ embedTitles: ['دليل الفوترة'] })
    fireEvent.click(screen.getByRole('button', { name: t('booklet.shareCheckCancel') }))
    expect(onEnsureShare).not.toHaveBeenCalled()
    expect(onClose).toHaveBeenCalled()
  })
})

describe('الدليل الخاص: بابان — رابط سري أو نشر كامل (قرار المالك 2026-09-11)', () => {
  it('الدليل المنشور يعرض زر «أنشئ رابط مشاركة» الصريح — لا توليد بفتح النافذة', () => {
    const { onEnsureShare, onToggleShare } = setup({ published: true })
    expect(screen.queryByText(t('booklet.shareCheckTitle'))).toBeNull()
    expect(onEnsureShare).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: t('editor.shareEnable') }))
    expect(onToggleShare).toHaveBeenCalled()
    expect(onEnsureShare).not.toHaveBeenCalled()
  })

  it('الدليل الخاص يعرض خياري الرابط السري والنشر — الزر السري لا ينشر', () => {
    const { onPublish, onEnsureShare } = setup({ published: false })
    expect(screen.getByText(t('editor.shareSecretHint'))).toBeTruthy()
    expect(screen.getByText(t('editor.shareNeedsPublish'))).toBeTruthy()
    expect(screen.queryByRole('button', { name: t('editor.shareEnable') })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: t('editor.shareSecretCreate') }))
    expect(onEnsureShare).toHaveBeenCalled()
    expect(onPublish).not.toHaveBeenCalled()
  })

  it('«انشر للمساحة وأنشئ الرابط» ينشر أولًا ثم يولّد الرابط', async () => {
    const { onPublish, onEnsureShare } = setup({ published: false })
    fireEvent.click(screen.getByRole('button', { name: t('editor.publishAndShare') }))
    await vi.waitFor(() => expect(onPublish).toHaveBeenCalled())
    await vi.waitFor(() => expect(onEnsureShare).toHaveBeenCalled())
  })

  it('فشل النشر لا يولّد رابطًا ولا يكذب', async () => {
    const onPublish = vi.fn().mockResolvedValue(false)
    const onEnsureShare = vi.fn().mockResolvedValue(undefined)
    render(
      <ShareDialog
        title="دورة الموظف"
        share={null}
        onClose={() => {}}
        onEnsureShare={onEnsureShare}
        onToggleShare={() => {}}
        onPublish={onPublish}
        published={false}
        onExportMarkdown={() => {}}
        onCopyRich={() => {}}
        copiedHtml={false}
        onPrint={() => {}}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: t('editor.publishAndShare') }))
    await vi.waitFor(() => expect(onPublish).toHaveBeenCalled())
    expect(onEnsureShare).not.toHaveBeenCalled()
  })
})
