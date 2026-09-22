import { describe, expect, it } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import type { GuideDto, StepDto } from '@dalili/shared'
import { t } from '../i18n'
import { ViewerBooklet } from './ViewerBooklet'

const blk = (over: Partial<StepDto>): StepDto => ({
  id: 'x',
  kind: 'navigate',
  title: '',
  target: {},
  sensitive: false,
  url: '',
  pageTitle: '',
  ts: 0,
  ...over,
})

const base = {
  schemaVersion: 1 as const,
  locale: 'ar' as const,
  dir: 'rtl' as const,
  createdAt: '',
  updatedAt: '',
}

function booklet(steps: StepDto[]): GuideDto {
  return { ...base, id: 'b1', kind: 'booklet', title: 'دورة الموظف', steps }
}

const FULL = booklet([
  blk({ id: 'h1', block: 'header', title: 'التمهيد' }),
  blk({ id: 't1', block: 'text', rich: [{ para: 'p', runs: [{ text: 'اقرأ هذا أولًا' }] }] }),
  blk({ id: 'e1', block: 'embed', title: 'دليل الفوترة', embed: { guideId: 'g1', expanded: false } }),
])

describe('ViewerBooklet — الفيديو والتنبيه (BKL-06/07)', () => {
  const VID = 'https://youtu.be/dQw4w9WgXcQ'

  // قرار المالك 2026-09-07: لا اتصال بغوغل قبل نقر القارئ
  it('الفيديو واجهةٌ أولًا: لا إطار قبل النقر، وnocookie بعده', () => {
    const { container } = render(
      <ViewerBooklet guide={booklet([blk({ id: 'v1', block: 'video', title: 'شرح الفوترة', url: VID })])} embeds={{}} />,
    )
    expect(container.querySelector('iframe')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /شرح الفوترة/ }))
    const frame = container.querySelector('iframe')
    expect(frame?.getAttribute('src')).toContain('youtube-nocookie.com/embed/dQw4w9WgXcQ')
  })

  it('الرابط غير اليوتيوبي لا يُعرض إطارًا بل رسالة صادقة', () => {
    const { container } = render(
      <ViewerBooklet guide={booklet([blk({ id: 'v2', block: 'video', url: 'https://evil.example.com/x' })])} embeds={{}} />,
    )
    expect(container.querySelector('iframe')).toBeNull()
    expect(screen.getByText(t('block.videoBadUrl'))).toBeTruthy()
  })

  it('التنبيه يعرض جملته المنسّقة، والقديم بعنوانه وملاحظته', () => {
    render(
      <ViewerBooklet
        guide={booklet([
          blk({ id: 'c1', block: 'tip', rich: [{ para: 'p', runs: [{ text: 'اطلب الصلاحية' }] }] }),
          blk({ id: 'c2', block: 'alert', title: 'انتبه', note: 'لا تحذف' }),
        ])}
        embeds={{}}
      />,
    )
    expect(screen.getByText('اطلب الصلاحية')).toBeTruthy()
    expect(screen.getByText('انتبه')).toBeTruthy()
    expect(screen.getByText(/لا تحذف/)).toBeTruthy()
  })
})

describe('ViewerBooklet — عارض الكرّاسة (BKL-01)', () => {
  it('الفهرس الجانبي يعرض عناوين الأقسام', () => {
    render(<ViewerBooklet guide={FULL} embeds={{}} />)
    const nav = screen.getByRole('navigation', { name: t('booklet.outline') })
    expect(nav.textContent).toContain('التمهيد')
  })

  it('كرّاسة بلا عناوين لا تعرض فهرسًا فارغًا', () => {
    render(<ViewerBooklet guide={booklet([blk({ id: 'd', block: 'divider' })])} embeds={{}} />)
    expect(screen.queryByRole('navigation', { name: t('booklet.outline') })).toBeNull()
  })

  it('نص الكتلة يظهر، ولا يُحقن HTML من البيانات', () => {
    const evil = booklet([blk({ id: 't', block: 'text', rich: [{ para: 'p', runs: [{ text: '<b>خام</b>' }] }] })])
    render(<ViewerBooklet guide={evil} embeds={{}} />)
    expect(screen.getByText('<b>خام</b>')).toBeTruthy()
    expect(document.querySelector('.viewer-rich b')).toBeNull()
  })

  it('الدليل المضمّن الموجود يظهر بطاقةً بعنوانه وعدد خطواته', () => {
    const embedded: GuideDto = { ...base, id: 'g1', title: 'دليل الفوترة', steps: [blk({ id: 's1', title: 'خطوة' })] }
    render(<ViewerBooklet guide={FULL} embeds={{ g1: embedded }} />)
    expect(screen.getByText('دليل الفوترة')).toBeTruthy()
    expect(screen.getByText(t('editor.embedSteps', { n: '١' }))).toBeTruthy()
  })

  // E-BKL-05: الغياب يُعلن ولا يُترك فراغًا
  it('الدليل المضمّن غير المتاح يعرض الرسالة الصادقة لا فراغًا', () => {
    render(<ViewerBooklet guide={FULL} embeds={{}} />)
    expect(screen.getByText(t('booklet.embedUnavailable'))).toBeTruthy()
  })

  it('كرّاسة بلا كتل تعرض حالة فارغة تشرح لا شاشة بيضاء', () => {
    render(<ViewerBooklet guide={booklet([])} embeds={{}} />)
    expect(screen.getByText(t('booklet.empty'))).toBeTruthy()
  })

  it('الكرّاسة لا تحمل ترقيم خطوات — كتلها كلها بلا أرقام', () => {
    const { container } = render(<ViewerBooklet guide={FULL} embeds={{}} />)
    expect(container.querySelector('.step-no')).toBeNull()
  })
})
