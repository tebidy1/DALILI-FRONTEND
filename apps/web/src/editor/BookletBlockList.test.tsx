import { describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import type { GuideDetailsDto, StepDto } from '@dalili/shared'
import { client } from '../api'
import { t } from '../i18n'
import { BookletBlockList } from './BookletBlockList'

vi.mock('../api', () => ({ client: { getGuide: vi.fn() } }))

/**
 * فخّ: `mockClear`/`mockReset` على محاكاة تُرجع وعدًا مرفوضًا يجعل vitest يبلّغ عن
 * «استثناء غير ملتقط» ولو التقطه المكوّن فعلًا — فنعدّ النداءات بفارق قبل/بعد.
 */
const calls = () => vi.mocked(client.getGuide).mock.calls.length

const step = (over: Partial<StepDto>): StepDto => ({
  id: 's1',
  kind: 'navigate',
  title: '',
  target: {},
  sensitive: false,
  url: '',
  pageTitle: '',
  ts: 1,
  ...over,
})

const details = (title: string, steps: StepDto[]): GuideDetailsDto => ({
  guide: {
    id: 'g1',
    schemaVersion: 1,
    title,
    locale: 'ar',
    dir: 'rtl',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    steps,
  },
  share: null,
})

const embedStep = step({ id: 'e1', block: 'embed', title: 'دليل الفوترة', embed: { guideId: 'g1', expanded: false } })

function renderList(steps: StepDto[], editing = true) {
  render(
    <BookletBlockList
      steps={steps}
      editing={editing}
      onPatch={() => {}}
      onRemove={() => {}}
      onInsert={() => {}}
      onAttachShot={() => {}}
    />,
  )
}

/** علة حية بلّغ عنها المالك: بطاقة الدليل المضمّن تقول «٠ خطوة» فتبدو العملية فارغة */
describe('BookletBlockList — بيانات الدليل المضمّن', () => {
  it('يعرض عدد خطوات الدليل المضمّن الحقيقي لا صفرًا', async () => {
    vi.mocked(client.getGuide).mockResolvedValue(
      details('دليل الفوترة', [step({ id: 'a' }), step({ id: 'b' }), step({ id: 'c' })]),
    )
    renderList([embedStep])
    await waitFor(() => expect(screen.getByText(t('editor.embedSteps', { n: '٣' }))).toBeTruthy())
    expect(vi.mocked(client.getGuide).mock.calls.at(-1)?.[0]).toBe('g1')
  })

  // بلاغ المالك: «لا يمكن فتح محتوى الدليل» — المفرود كان بطاقة صامتة في المحرر
  it('المفرود يعرض خطوات الدليل المضمّن بترقيم دليله داخل المحرر', async () => {
    vi.mocked(client.getGuide).mockResolvedValue(
      details('دليل الفوترة', [step({ id: 'a', title: 'افتح الفواتير' }), step({ id: 'b', title: 'احفظ' })]),
    )
    renderList([step({ id: 'e1', block: 'embed', title: 'دليل الفوترة', embed: { guideId: 'g1', expanded: true } })])
    await waitFor(() => expect(screen.getByText('١. افتح الفواتير')).toBeTruthy())
    expect(screen.getByText('٢. احفظ')).toBeTruthy()
  })

  it('الدليل المحذوف (٤٠٤) يعرض رسالة الغياب الصادقة', async () => {
    vi.mocked(client.getGuide).mockRejectedValue(Object.assign(new Error('غير موجود'), { status: 404 }))
    renderList([embedStep])
    await waitFor(() => expect(screen.getByText(t('editor.embedMissing'))).toBeTruthy())
  })

  it('تعذّر الاتصال لا يُدّعى حذفًا — يبقى العنوان المحفوظ', async () => {
    vi.mocked(client.getGuide).mockRejectedValue(Object.assign(new Error('تعذر الاتصال'), { status: 0 }))
    renderList([embedStep])
    await waitFor(() => expect(screen.getByText('دليل الفوترة')).toBeTruthy())
    expect(screen.queryByText(t('editor.embedMissing'))).toBeNull()
  })

  it('الدليل في السلة يقول ذلك بصدق — لا بطاقة عادية ولا ادّعاء حذف', async () => {
    vi.mocked(client.getGuide).mockResolvedValue({
      ...details('دليل الفوترة', [step({ id: 'a' })]),
      deletedAt: '2026-09-07T00:00:00Z',
    })
    renderList([embedStep])
    await waitFor(() => expect(screen.getByText(t('editor.embedTrashed'))).toBeTruthy())
    expect(screen.queryByText(t('editor.embedMissing'))).toBeNull()
  })

  // بلاغ المالك: شريط تنسيق ظاهر في وضع العرض يوهم بأزرار «بلا أثر»
  it('وضع العرض يعرض النص مقروءًا بلا شريط تنسيق ولا منطقة تحرير', () => {
    const rich = step({ id: 'r1', block: 'text', rich: [{ para: 'p', runs: [{ text: 'نص للقراءة', b: true }] }] })
    renderList([rich], false)
    expect(screen.queryByRole('button', { name: t('editor.richBold') })).toBeNull()
    expect(screen.queryByRole('textbox', { name: t('editor.richArea') })).toBeNull()
    expect(screen.getByText('نص للقراءة').tagName).toBe('B')
  })

  it('وضع التحرير يعرض الشريط ومنطقة التحرير', () => {
    const rich = step({ id: 'r2', block: 'text', rich: [{ para: 'p', runs: [{ text: 'نص' }] }] })
    renderList([rich])
    expect(screen.getByRole('button', { name: t('editor.richBold') })).toBeTruthy()
    expect(screen.getByRole('textbox', { name: t('editor.richArea') })).toBeTruthy()
  })

  it('لا نداء إطلاقًا حين لا كتلة تضمين', () => {
    vi.mocked(client.getGuide).mockResolvedValue(details('لا يُستدعى', []))
    const before = calls()
    renderList([step({ id: 'h', block: 'header', title: 'التمهيد' })])
    expect(calls()).toBe(before)
  })
})
