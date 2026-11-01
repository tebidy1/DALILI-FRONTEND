// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { GuideDetailsDto, HelpRequestDto, MyNotesDto, NotesDto } from '@dalili/shared'
import { HelpBar } from './HelpBar'
import type { HelpPick } from '../../../lib/protocol'

/** هـ ج١ (HLP) شريط «ما هذا؟» أسفل اللوحة — زر الموظف وزر الشريك، والوضعان،
 *  والطلبات، والربط بالقارئ ودربني بالمسار نفسه. */

const NOTES: NotesDto = {
  system: { id: 'odoo', name: 'أودو' },
  canRequest: true,
  notes: [{ id: 'n1', label: 'تأكيد', body: 'يثبّت الفاتورة', anchor: [{ k: 'id', v: 'btn_confirm' }], screenKey: 'account form web', partner: { id: 'p1', name: 'نُظم', logoUrl: null }, guide: null }],
}
const MY: MyNotesDto = {
  system: { id: 'odoo', name: 'أودو' },
  notes: [{ id: 'n1', label: 'تأكيد', body: 'جملة قائمة', anchor: [{ k: 'id', v: 'btn_confirm' }], screenKey: 'account form web', partner: { id: 'p1', name: 'نُظم', logoUrl: null }, guide: null, suspended: false, access: { owner: true, edit: true, publish: true, moderate: false }, audience: 'all', companyIds: [] }],
  guides: [{ id: 'g1', title: 'دليل الفاتورة' }],
  clients: [{ id: 'co1', name: 'شركة الأفق' }],
}
const REQUESTS: HelpRequestDto[] = [{ id: 'r1', label: 'اعتماد', screenKey: 'order web', systemName: 'أودو', companyName: 'شركة الأفق', count: 2, updatedAt: '2026-11-01T00:00:00Z' }]
const DETAILS = { guide: { id: 'g1', title: 'دليل الفاتورة', schemaVersion: 2, steps: [] }, trainHosts: { from: 'demo.odoo.com', hosts: [], patterns: [], systemPatterns: [] } } as unknown as GuideDetailsDto

const PICK: HelpPick = { anchor: [{ k: 'id', v: 'btn_confirm' }], screenKey: 'account form web', label: 'تأكيد', site: 'alofuq.odoo.com' }

type Sent = Array<Record<string, unknown>>
let sent: Sent = []
let tabListeners: Array<(info: unknown) => void> = []
let msgListeners: Array<(msg: unknown, ...rest: unknown[]) => void> = []
let activeUrl = 'https://alofuq.odoo.com/web#model=account.move'
let helpPort: { name: string; disconnect: ReturnType<typeof vi.fn> } | null = null

function stubChrome() {
  sent = []
  tabListeners = []
  msgListeners = []
  helpPort = null
  vi.stubGlobal('chrome', {
    runtime: {
      sendMessage: async (m: Record<string, unknown>) => {
        sent.push(m)
      },
      // مراجعة I1/I2: المنفذ يُفتح أثناء الوضع فقط — وإغلاقه (بحذف اللوحة) يُطفئ الصفحة
      connect: (opts: { name: string }) => {
        helpPort = { name: opts.name, disconnect: vi.fn() }
        return helpPort
      },
      getManifest: () => ({ version: '0.2.2' }),
      onMessage: {
        addListener: (fn: (msg: unknown) => void) => msgListeners.push(fn),
        removeListener: () => {},
      },
    },
    tabs: {
      query: async () => [{ url: activeUrl, active: true }],
      onActivated: { addListener: (fn: (info: unknown) => void) => tabListeners.push(fn), removeListener: () => {} },
      onUpdated: { addListener: () => {}, removeListener: () => {} },
    },
  })
}

/** الوضع قائم: التلميح ظهر ومستمعو الصفحة والتبويب سُجّلوا — React يشغّل المؤثرات بعد
 *  تحديث الشجرة بلحظة، فرسالة صفحة تُطلق فور ظهور التلميح قد تسبق المستمع (سبب تذبذب سابق) */
async function modeOn(hint: string) {
  await screen.findByText(hint)
  await waitFor(() => expect(msgListeners.length * tabListeners.length).toBeGreaterThan(0))
}

const fromTab = (msg: unknown) => msgListeners.forEach((fn) => fn(msg, {}, () => {}))
const switchTab = () => tabListeners.forEach((fn) => fn({ tabId: 99 }))

function makeApi(over: Record<string, unknown> = {}) {
  return {
    notes: vi.fn(async () => NOTES),
    noteSteps: vi.fn(async () => []),
    myNotes: vi.fn(async () => MY),
    createNote: vi.fn(async () => ({ id: 'n9' })),
    updateNote: vi.fn(async () => ({ id: 'n1' })),
    requestHelp: vi.fn(async (): Promise<{ ok: true }> => ({ ok: true })),
    helpRequests: vi.fn(async () => REQUESTS),
    suspendGuide: vi.fn(async (): Promise<{ ok: true }> => ({ ok: true })),
    getGuide: vi.fn(async () => DETAILS),
    ...over,
  }
}

function bar(api = makeApi(), partnerEditor = false) {
  const open = vi.fn()
  render(<HelpBar api={api} partnerEditor={partnerEditor} accountKey="co1" onOpenGuide={open} />)
  return open
}

beforeEach(stubChrome)
afterEach(() => {
  // فكّ المكون أولاً — إطفاء الوضع عند الإغلاق يحتاج chrome ما يزال مكعوبًا
  cleanup()
  vi.unstubAllGlobals()
})

describe('HelpBar — الزران بحسب الدور', () => {
  it('الموظف ومشاهد الشريك يريان «؟ ما هذا» وحده، ومحرّر الشريك يرى «اشرح زراً» أيضًا', () => {
    bar(makeApi(), false)
    expect(screen.getByRole('button', { name: '؟ ما هذا' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'اشرح زراً' })).toBeNull()
    cleanup()
    bar(makeApi(), true)
    expect(screen.getByRole('button', { name: '؟ ما هذا' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'اشرح زراً' })).toBeTruthy()
  })
})

describe('HelpBar — وضع السؤال', () => {
  it('صفحة بلا نظام: الرسالة الصادقة ولا help-on', async () => {
    const api = makeApi({ notes: vi.fn(async () => ({ system: null, canRequest: false, notes: [] })) })
    bar(api)
    fireEvent.click(screen.getByRole('button', { name: '؟ ما هذا' }))
    expect(await screen.findByText('هذه الصفحة ليست من أنظمة شركتك')).toBeTruthy()
    expect(sent.filter((m) => m.t === 'help-tab')).toHaveLength(0)
  })

  it('الوضع يرسل help-on بالشروح والخطوات وcanRequest، و«خروج» يرسل help-off', async () => {
    const api = makeApi()
    bar(api)
    fireEvent.click(screen.getByRole('button', { name: '؟ ما هذا' }))
    await modeOn('اضغط أي زر في الصفحة لتعرف ما يفعله')
    expect(sent).toContainEqual({ t: 'help-tab', msg: { t: 'help-on', mode: 'ask', notes: NOTES.notes, steps: [], canRequest: true } })
    fireEvent.click(screen.getByRole('button', { name: 'خروج' }))
    expect(sent).toContainEqual({ t: 'help-tab', msg: { t: 'help-off' } })
  })

  it('طلب شرح من الصفحة يستدعي requestHelp ويرد help-requested', async () => {
    const api = makeApi()
    bar(api)
    fireEvent.click(screen.getByRole('button', { name: '؟ ما هذا' }))
    await modeOn('اضغط أي زر في الصفحة لتعرف ما يفعله')
    fromTab({ t: 'help-request', pick: PICK })
    await waitFor(() => expect(api.requestHelp).toHaveBeenCalledWith({ site: PICK.site, screenKey: PICK.screenKey, anchor: PICK.anchor, label: PICK.label }))
    await waitFor(() => expect(sent).toContainEqual({ t: 'help-tab', msg: { t: 'help-requested' } }))
  })

  it('فشل الطلب يُعرض بنص errorAr كما جاء', async () => {
    const api = makeApi({ requestHelp: vi.fn(async () => { throw Object.assign(new Error('لا شريك لهذا النظام في شركتك بعد (E-HLP-05)'), { status: 409, code: 'E-HLP-05' }) }) })
    bar(api)
    fireEvent.click(screen.getByRole('button', { name: '؟ ما هذا' }))
    await modeOn('اضغط أي زر في الصفحة لتعرف ما يفعله')
    fromTab({ t: 'help-request', pick: PICK })
    await screen.findByText('لا شريك لهذا النظام في شركتك بعد (E-HLP-05)')
    expect(sent.filter((m) => (m as { msg?: { t: string } }).msg?.t === 'help-requested')).toHaveLength(0)
  })

  it('help-open بلا تدريب يفتح الدليل في اللوحة، وبتدريب يسلك مسار دربني نفسه', async () => {
    const open = bar(makeApi())
    fireEvent.click(screen.getByRole('button', { name: '؟ ما هذا' }))
    await modeOn('اضغط أي زر في الصفحة لتعرف ما يفعله')
    fromTab({ t: 'help-open', guideId: 'g1', train: false })
    await waitFor(() => expect(open).toHaveBeenCalledWith('g1'))
    fromTab({ t: 'help-open', guideId: 'g1', train: true })
    await waitFor(() =>
      expect(sent).toContainEqual({ t: 'train-start', guide: DETAILS.guide, hosts: DETAILS.trainHosts }),
    )
  })
})

describe('HelpBar — وضع الكتابة', () => {
  it('اختيار الزر يفتح النموذج بالاسم، و«انشر» يستدعي createNote بجمهور «الكل» ويعلن النشر ويحدّث النقاط', async () => {
    const api = makeApi()
    bar(api, true)
    fireEvent.click(screen.getByRole('button', { name: 'اشرح زراً' }))
    await modeOn('اضغط الزر الذي تريد شرحه')
    expect(sent).toContainEqual({ t: 'help-tab', msg: { t: 'help-on', mode: 'author', notes: MY.notes } })
    fromTab({ t: 'help-pick', pick: PICK })
    expect(await screen.findByText('زر «تأكيد»')).toBeTruthy()
    fireEvent.change(screen.getByLabelText('ماذا يفعل هذا الزر؟ جملة أو جملتان'), { target: { value: 'يثبّت الفاتورة' } })
    fireEvent.click(screen.getByRole('button', { name: 'انشر' }))
    await screen.findByText('نُشر، سيراه عملاؤك')
    expect(api.createNote).toHaveBeenCalledWith({
      systemId: 'odoo', anchor: PICK.anchor, screenKey: PICK.screenKey, label: 'تأكيد', body: 'يثبّت الفاتورة', audience: 'all',
    })
    // النقاط تُحدَّث: myNotes جُلبت من جديد وأُرسلت للصفحة
    await waitFor(() => expect(sent).toContainEqual({ t: 'help-tab', msg: { t: 'help-notes', notes: MY.notes } }))
    expect(api.myNotes).toHaveBeenCalledTimes(2)
  })

  it('خطأ الخادم يُعرض بنص errorAr كما جاء', async () => {
    const api = makeApi({ createNote: vi.fn(async () => { throw Object.assign(new Error('الشرح جملة قصيرة حتى ٢٠٠ حرف (E-HLP-02)'), { status: 400, code: 'E-HLP-02' }) }) })
    bar(api, true)
    fireEvent.click(screen.getByRole('button', { name: 'اشرح زراً' }))
    await modeOn('اضغط الزر الذي تريد شرحه')
    fromTab({ t: 'help-pick', pick: PICK })
    await screen.findByText('زر «تأكيد»')
    fireEvent.change(screen.getByLabelText('ماذا يفعل هذا الزر؟ جملة أو جملتان'), { target: { value: 'جملة' } })
    fireEvent.click(screen.getByRole('button', { name: 'انشر' }))
    await screen.findByText('الشرح جملة قصيرة حتى ٢٠٠ حرف (E-HLP-02)')
  })
})

describe('HelpBar — إطفاء الوضع', () => {
  it('تبديل التبويب النشط يطفئ الوضع', async () => {
    bar(makeApi())
    fireEvent.click(screen.getByRole('button', { name: '؟ ما هذا' }))
    await modeOn('اضغط أي زر في الصفحة لتعرف ما يفعله')
    switchTab()
    await waitFor(() => expect(sent).toContainEqual({ t: 'help-tab', msg: { t: 'help-off' } }))
    expect(screen.getByRole('button', { name: '؟ ما هذا' })).toBeTruthy()
  })

  it('مراجعة I1/I2: منفذ حياة يُفتح أثناء الوضع ويُغلق عند الخروج — بإغلاق اللوحة يرى الخلفية الغياب فيطفئ الصفحة', async () => {
    bar(makeApi())
    fireEvent.click(screen.getByRole('button', { name: '؟ ما هذا' }))
    await modeOn('اضغط أي زر في الصفحة لتعرف ما يفعله')
    expect(helpPort?.name).toBe('help-mode')
    fireEvent.click(screen.getByRole('button', { name: 'خروج' }))
    await waitFor(() => expect(helpPort?.disconnect).toHaveBeenCalled())
    expect(sent).toContainEqual({ t: 'help-tab', msg: { t: 'help-off' } })
  })
})
