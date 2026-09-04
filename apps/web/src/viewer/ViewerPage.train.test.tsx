import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import type { PublicGuideDto } from '@dalili/shared'
import { t } from '../i18n'
import { ViewerPage } from './ViewerPage'
import { TrainButton } from './TrainButton'

vi.mock('../api', () => ({
  client: { publicGuide: vi.fn(), trackShareView: vi.fn().mockResolvedValue(undefined), shareComments: vi.fn().mockResolvedValue({ comments: [] }) },
  WEB_SHARE_BASE: '/s/',
  webShareUrl: (u: string) => u,
}))

/** دليل بخطوة تحمل مرساة (AUTO-01) → قابل للتدريب؛ وخطوة بلا مرساة → عرض فقط */
function fixture(withAnchor: boolean): PublicGuideDto {
  return {
    guide: {
      id: 'g1',
      title: 'إصدار فاتورة توريد',
      updatedAt: new Date().toISOString(),
      steps: [
        {
          id: 's1',
          title: 'اضغط زر الحفظ',
          screenshot: { fileId: 'f1', blurRects: [] },
          ...(withAnchor ? { target: { anchor: [{ k: 'id', v: 'save' }] } } : {}),
        } as never,
      ],
    },
    sharedAt: new Date().toISOString(),
  } as unknown as PublicGuideDto
}

async function renderGuide(withAnchor: boolean) {
  const { client } = await import('../api')
  vi.mocked(client.publicGuide).mockResolvedValue(fixture(withAnchor))
  const r = render(
    <MemoryRouter initialEntries={['/s/tok-train']}>
      <Routes>
        <Route path="/s/:token" element={<ViewerPage />} />
      </Routes>
    </MemoryRouter>,
  )
  await screen.findByText('إصدار فاتورة توريد')
  return r
}

/** الزر وحده بمهلة قصيرة محقونة — بلا مؤقتات زائفة (فخ waitFor) */
function renderButton() {
  return render(<TrainButton token="tok-train" ackTimeoutMs={40} />)
}

/** دربني: زر ثابت في الركن الأعلى — القراءة أولًا ثم التدريب أو التدريب مباشرة */
describe('زر «دربني» في العارض (GM-01 جسر البدء)', () => {
  it('دليل بمراسي → الزر ظاهر ثابتًا أعلى الركن؛ دليل بلا مراسي → لا زر (لا تدريب وهمي)', async () => {
    await renderGuide(true)
    const btn = screen.getByRole('button', { name: t('viewer.train') })
    expect(btn.className).toContain('train-fab')
  })

  it('الدليل بلا مراسى (أدلة ما قبل AUTO-01) → لا زر', async () => {
    const r = await renderGuide(false)
    expect(r.container.querySelector('.train-fab')).toBeNull()
  })

  it('النقر يبعث train-start بالرمز، وack ناجح لا يعرض خطأً', async () => {
    renderButton()
    const postSpy = vi.spyOn(window, 'postMessage')
    fireEvent.click(screen.getByRole('button', { name: t('viewer.train') }))
    expect(postSpy).toHaveBeenCalledWith({ source: 'dalili-web', t: 'train-start', token: 'tok-train' }, '*')
    window.postMessage({ source: 'dalili-ext', t: 'train-ack', ok: true }, '*')
    await waitFor(() => {
      expect(screen.queryByText(t('viewer.trainNoExt'))).toBeNull()
    })
  })

  it('بلا امتداد (لا ack خلال المهلة) → رسالة صادقة تدل على الامتداد — لا صمت', async () => {
    renderButton()
    fireEvent.click(screen.getByRole('button', { name: t('viewer.train') }))
    expect(await screen.findByText(t('viewer.trainNoExt'))).toBeTruthy()
  })

  it('ack فاشل يعرض نص الخطأ العربي الوارد من الخلفية كما هو', async () => {
    renderButton()
    fireEvent.click(screen.getByRole('button', { name: t('viewer.train') }))
    window.postMessage(
      { source: 'dalili-ext', t: 'train-ack', ok: false, errorAr: 'هذا الدليل أُنشئ قبل خاصية التدريب — أعد التقاطه' },
      '*',
    )
    expect(await screen.findByText('هذا الدليل أُنشئ قبل خاصية التدريب — أعد التقاطه')).toBeTruthy()
    expect(screen.queryByText(t('viewer.trainNoExt'))).toBeNull()
  })
})
