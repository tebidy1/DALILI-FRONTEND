import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { t } from '../i18n'
import { ShareDialog } from './ShareDialog'

function setup(embedTitles?: string[]) {
  const onEnsureShare = vi.fn().mockResolvedValue(undefined)
  const onClose = vi.fn()
  render(
    <ShareDialog
      title="دورة الموظف"
      share={null}
      embedTitles={embedTitles}
      onClose={onClose}
      onEnsureShare={onEnsureShare}
      onToggleShare={() => {}}
      onExportMarkdown={() => {}}
      onCopyRich={() => {}}
      copiedHtml={false}
      onPrint={() => {}}
    />,
  )
  return { onEnsureShare, onClose }
}

/** BKL-01: لا تسريب صامت ولا حجب مفاجئ — المؤلف يقرر واعيًا قبل توليد الرابط */
describe('قائمة الفحص قبل المشاركة', () => {
  it('كرّاسة تضمّ أدلة تعرض القائمة بأسمائها ولا تولّد الرابط تلقائيًا', () => {
    const { onEnsureShare } = setup(['دليل الفوترة', 'دليل الطلبات'])
    expect(screen.getByText(t('booklet.shareCheckTitle'))).toBeTruthy()
    expect(screen.getByText('دليل الفوترة')).toBeTruthy()
    expect(screen.getByText('دليل الطلبات')).toBeTruthy()
    expect(onEnsureShare).not.toHaveBeenCalled()
  })

  it('«تابع المشاركة» يولّد الرابط', () => {
    const { onEnsureShare } = setup(['دليل الفوترة'])
    fireEvent.click(screen.getByRole('button', { name: t('booklet.shareCheckGo') }))
    expect(onEnsureShare).toHaveBeenCalled()
  })

  it('«إلغاء» يغلق بلا توليد رابط', () => {
    const { onEnsureShare, onClose } = setup(['دليل الفوترة'])
    fireEvent.click(screen.getByRole('button', { name: t('booklet.shareCheckCancel') }))
    expect(onEnsureShare).not.toHaveBeenCalled()
    expect(onClose).toHaveBeenCalled()
  })

  it('دليل عادي (بلا تضمين) لا يعرض قائمة فحص ويولّد الرابط كالعادة', () => {
    const { onEnsureShare } = setup(undefined)
    expect(screen.queryByText(t('booklet.shareCheckTitle'))).toBeNull()
    expect(onEnsureShare).toHaveBeenCalled()
  })

  it('كرّاسة بلا أدلة مضمّنة لا تعرض قائمة فحص', () => {
    const { onEnsureShare } = setup([])
    expect(screen.queryByText(t('booklet.shareCheckTitle'))).toBeNull()
    expect(onEnsureShare).toHaveBeenCalled()
  })
})
