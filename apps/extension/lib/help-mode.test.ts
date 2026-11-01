// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { MyNoteDto, NoteDto, NoteStepDto } from '@dalili/shared'
import { createHelpMode } from './help-mode'
import type { HelpOutMsg } from './protocol'

/** هـ ج١ (HLP) وضع «ما هذا؟» داخل الصفحة — الحاجز يمنع التنفيذ، والمطابقة كلها
 *  تجري على الجهاز: مفتاح الشاشة يُقرأ وقت كل ضغطة، والالتقاط بلا ctx ولا استعلام. */

const INVOICE = 'https://a.odoo.com/web#model=account.move&view_type=form'
const INVOICE_KEY = 'account form model move type view web'
const PURCHASE = 'https://a.odoo.com/web#model=purchase.order'
const PURCHASE_KEY = 'model order purchase web'

let url = INVOICE

const note = (over: Partial<NoteDto> = {}): NoteDto => ({
  id: 'n1',
  label: 'تأكيد',
  body: 'يثبّت الفاتورة ويرسلها للعميل',
  anchor: [{ k: 'id', v: 'btn_confirm' }],
  screenKey: INVOICE_KEY,
  partner: { id: 'p1', name: 'نُظم للحلول', logoUrl: null },
  guide: null,
  ...over,
})

const step = (over: Partial<NoteStepDto> = {}): NoteStepDto => ({
  guideId: 'g1',
  title: 'دليل الفاتورة',
  no: 4,
  anchor: [{ k: 'id', v: 'btn_confirm' }],
  url: INVOICE,
  ...over,
})

const myNote = (over: Partial<NoteDto> = {}): MyNoteDto => ({
  ...note(over),
  suspended: false,
  access: { owner: true, edit: true, publish: true, moderate: false },
  audience: 'all',
  companyIds: [],
})

function page() {
  document.body.innerHTML = `
    <div role="dialog" aria-label="نافذة"><h3>فاتورة INV/2026/0001</h3><button id="btn_confirm">تأكيد</button></div>
    <a id="lnk" href="https://x.test/">عميل: أحمد</a>
    <table><thead><tr><th>العميل</th></tr></thead><tbody><tr role="row"><td id="cell">أحمد</td></tr></tbody></table>
    <input id="fld" name="partner" />
    <div id="plain">نص عادي</div>`
}

let sent: HelpOutMsg[] = []
let mode: ReturnType<typeof createHelpMode> | null = null

afterEach(() => {
  mode?.dispose()
  mode = null
  sent = []
  document.body.innerHTML = ''
  url = INVOICE
})

function startAsk(over: { notes?: NoteDto[]; steps?: NoteStepDto[]; canRequest?: boolean } = {}) {
  page()
  mode = createHelpMode((m) => sent.push(m), undefined, () => url)
  mode.handle({ t: 'help-on', mode: 'ask', notes: over.notes ?? [], steps: over.steps ?? [], canRequest: over.canRequest ?? true })
  return mode
}

const cardText = () => document.querySelector('dalili-help')?.shadowRoot?.textContent ?? ''
const cardButtons = () => Array.from(document.querySelector('dalili-help')!.shadowRoot!.querySelectorAll('button'))
const clickBtn = (label: string) => cardButtons().find((b) => b.textContent === label)!.dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true, cancelable: true }))

describe('وضع «ما هذا؟» — ask', () => {
  it('ضغطة على فراغ يحوي زرًا مشروحًا لا تُظهر شرح ذلك الزر — الحاوية ليست الزر', () => {
    startAsk({ notes: [note()], steps: [step()] })
    document.querySelector('[role="dialog"]')!.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    expect(cardText()).not.toContain('يثبّت الفاتورة')
    expect(cardText()).not.toContain('دليل الفاتورة')
  })

  it('شرح مطابق: جملة الشريك واسمه، والنقر على زر الصفحة لا يرسل شيئًا', () => {
    startAsk({ notes: [note()] })
    document.getElementById('btn_confirm')!.click()
    expect(cardText()).toContain('يثبّت الفاتورة ويرسلها للعميل')
    expect(cardText()).toContain('نُظم للحلول')
    expect(sent).toEqual([]) // لا help-pick في وضع السؤال
  })

  it('لا شرح لكن الخطوة في دليل: جملة «هذا الزر في دليل… الخطوة ٤» و«افتح» و«دربني» يرسلان help-open', () => {
    startAsk({ notes: [], steps: [step()] })
    document.getElementById('btn_confirm')!.click()
    expect(cardText()).toContain('هذا الزر في دليل «دليل الفاتورة»، الخطوة ٤')
    clickBtn('افتح')
    expect(sent).toContainEqual({ t: 'help-open', guideId: 'g1', train: false })
    clickBtn('دربني')
    expect(sent).toContainEqual({ t: 'help-open', guideId: 'g1', train: true })
  })

  it('لا شيء يطابق: «لا شرح بعد» وزر الطلب لعنصر تحكّم فقط', () => {
    startAsk({ notes: [], steps: [] })
    document.getElementById('fld')!.click()
    expect(cardText()).toContain('لا شرح بعد')
    expect(cardButtons().map((b) => b.textContent)).toContain('اطلب شرحاً')
    document.getElementById('plain')!.click()
    expect(cardButtons().map((b) => b.textContent)).not.toContain('اطلب شرحاً')
  })

  it('رابط أو خلية جدول لا يعرضان الطلب أبدًا', () => {
    startAsk({ notes: [], steps: [] })
    document.getElementById('lnk')!.click()
    expect(cardButtons().map((b) => b.textContent)).not.toContain('اطلب شرحاً')
    document.getElementById('cell')!.click()
    expect(cardButtons().map((b) => b.textContent)).not.toContain('اطلب شرحاً')
  })

  it('زر الطلب يرسل help-request، ووصول help-requested يقلب البطاقة إلى التأكيد', () => {
    startAsk({ notes: [], steps: [] })
    document.getElementById('fld')!.click()
    clickBtn('اطلب شرحاً')
    expect(sent).toHaveLength(1)
    expect(sent[0]!.t).toBe('help-request')
    mode!.handle({ t: 'help-requested' })
    expect(cardText()).toContain('وصل طلبك، سنخبرك حين يُشرح')
  })

  it('مفتاح الشاشة يُقرأ وقت الضغطة: التنقل من الفاتورة لأمر الشراء والوضع قائم', () => {
    startAsk({ notes: [note({ screenKey: PURCHASE_KEY })] })
    document.getElementById('btn_confirm')!.click()
    expect(cardText()).toContain('لا شرح بعد') // شاشة الفاتورة لا تملك شرحًا
    url = PURCHASE // انتقل أودو (SPA) والوضع قائم
    document.getElementById('btn_confirm')!.click()
    expect(cardText()).toContain('يثبّت الفاتورة ويرسلها للعميل')
  })

  it('الالتقاط لا يحمل ctx ولا الاستعلام أبدًا', () => {
    page()
    mode = createHelpMode((m) => sent.push(m), undefined, () => `${INVOICE}&search=Ahmed`)
    mode.handle({ t: 'help-on', mode: 'author', notes: [myNote()] })
    document.getElementById('btn_confirm')!.click() // داخل نافذة عنوانها رقم الفاتورة
    expect(sent).toHaveLength(1)
    const pick = sent[0]!.t === 'help-pick' ? sent[0]!.pick : null
    expect(pick).not.toBeNull()
    expect(pick!.anchor.some((c) => c.k === 'ctx')).toBe(false)
    expect(pick!.screenKey).toMatch(/^[\p{L}\p{N} ]*$/u)
    expect(pick!.screenKey).not.toContain('=')
    expect(pick!.label).toBe('تأكيد')
  })
})

describe('وضع «ما هذا؟» — author', () => {
  it('الأزرار المشروحة تحمل نقطة، والضغط يرسل help-pick مع noteId', () => {
    page()
    mode = createHelpMode((m) => sent.push(m), undefined, () => url)
    mode.handle({ t: 'help-on', mode: 'author', notes: [myNote()] })
    const host = document.querySelector('dalili-help')!
    expect(host.shadowRoot!.querySelectorAll('.dot').length).toBeGreaterThan(0)
    document.getElementById('btn_confirm')!.click()
    expect(sent).toHaveLength(1)
    expect(sent[0]).toMatchObject({ t: 'help-pick', noteId: 'n1' })
    expect(host.shadowRoot!.querySelectorAll('.hl').length).toBeGreaterThan(0) // إبراز الزر المختار
  })
})

describe('الأداء أثناء التمرير', () => {
  it('النقاط تُعاد موضعتها لا تُهدم وتُبنى مع كل تمرير', () => {
    page()
    mode = createHelpMode((m) => sent.push(m), undefined, () => url)
    mode.handle({ t: 'help-on', mode: 'author', notes: [myNote()] })
    document.getElementById('btn_confirm')!.click() // يربط إعادة الموضعة بالتمرير
    const root = document.querySelector('dalili-help')!.shadowRoot!
    const before = root.querySelector('.dot')
    window.dispatchEvent(new Event('scroll'))
    expect(root.querySelectorAll('.dot')).toHaveLength(1)
    expect(root.querySelector('.dot')).toBe(before)
  })
})

describe('الخروج والحدود الصادقة', () => {
  it('Escape وhelp-off يزيلان الطبقة والحاجز معًا — والصفحة تعود كما كانت', () => {
    startAsk({ notes: [note()] })
    const pageClick = vi.fn()
    document.addEventListener('click', pageClick)
    document.getElementById('btn_confirm')!.click()
    expect(pageClick).not.toHaveBeenCalled() // الحاجز قائم
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))
    expect(document.querySelector('dalili-help')).toBeNull()
    expect(sent).toContainEqual({ t: 'help-exit' })
    document.getElementById('btn_confirm')!.click()
    expect(pageClick).toHaveBeenCalledTimes(1) // الحاجز زال
    // help-off من اللوحة: إزالة بلا رسالة خروج
    mode!.handle({ t: 'help-on', mode: 'ask', notes: [], steps: [], canRequest: false })
    expect(document.querySelector('dalili-help')).not.toBeNull()
    mode!.handle({ t: 'help-off' })
    expect(document.querySelector('dalili-help')).toBeNull()
    expect(sent.filter((m) => m.t === 'help-exit')).toHaveLength(1)
  })

  it('عنصر داخل إطار خارجي: بطاقة الحد الصادق', () => {
    startAsk({ notes: [], steps: [] })
    const iframe = document.createElement('iframe')
    document.body.appendChild(iframe)
    Object.defineProperty(iframe, 'contentDocument', { get: () => null }) // أصل آخر — لا نرى داخله
    iframe.dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true, cancelable: true }))
    expect(cardText()).toContain('هذا الجزء لا يدعم الشرح بعد')
    expect(sent).toEqual([])
  })
})
