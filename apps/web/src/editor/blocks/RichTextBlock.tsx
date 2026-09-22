import { useEffect, useRef, useState } from 'react'
import { richToHtml } from '@dalili/core'
import type { RichTextDto, RichParaDto, TextRunDto } from '@dalili/shared'
import { t } from '../../i18n'
import { RichToolbar } from './RichToolbar'
import { setPara, toggleMark, type Mark } from './rich-ops'

const EMPTY: RichTextDto = [{ para: 'p', runs: [{ text: '' }] }]

/** قطع عنصر واحد — يمشي على عقد النص ويقرأ العريض/المائل من أسلافه */
function runsOf(el: Element): TextRunDto[] {
  const out: TextRunDto[] = []
  const walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
  let node = walk.nextNode()
  while (node) {
    const text = node.textContent ?? ''
    if (text) {
      const parent = node.parentElement
      const run: TextRunDto = { text }
      if (parent?.closest('b,strong')) run.b = true
      if (parent?.closest('i,em')) run.i = true
      const a = parent?.closest('a')
      if (a) run.href = a.getAttribute('href') ?? undefined
      out.push(run)
    }
    node = walk.nextNode()
  }
  return out.length ? out : [{ text: '' }]
}

/**
 * يعيد بناء التمثيل المُهيكل من الـDOM — **لا innerHTML يُخزَّن أبدًا**.
 * هذا هو موضع ضمان «لا HTML من المستخدم يدخل النموذج».
 */
function parseDom(root: HTMLElement): RichTextDto {
  const out: RichTextDto = []
  for (const child of Array.from(root.children)) {
    const tag = child.tagName.toLowerCase()
    if (tag === 'ul' || tag === 'ol') {
      const items = Array.from(child.children)
      out.push({ para: tag, runs: items.flatMap((li) => runsOf(li)) })
      continue
    }
    const para: RichParaDto['para'] = tag === 'h2' ? 'h2' : tag === 'h3' ? 'h3' : 'p'
    out.push({ para, runs: runsOf(child) })
  }
  return out.length ? out : EMPTY
}

interface FlatSel {
  paraIndex: number
  start: number
  end: number
}

/** موضع التحديد داخل الفقرة النشطة بفهارس النص المسطّح — يغذّي toggleMark */
function selectionIn(root: HTMLElement): FlatSel | null {
  const sel = window.getSelection?.()
  if (!sel || sel.rangeCount === 0) return null
  const range = sel.getRangeAt(0)
  const paras = Array.from(root.children)
  const paraIndex = paras.findIndex((p) => p.contains(range.startContainer))
  if (paraIndex < 0) return null
  const para = paras[paraIndex]!
  const before = document.createRange()
  before.selectNodeContents(para)
  before.setEnd(range.startContainer, range.startOffset)
  const start = before.toString().length
  return { paraIndex, start, end: start + range.toString().length }
}

/** فهرس مسطّح → عقدة نصية وإزاحة داخلها (عكس `selectionIn`) */
function locate(para: Element, offset: number): { node: Node; offset: number } {
  const walk = document.createTreeWalker(para, NodeFilter.SHOW_TEXT)
  let node = walk.nextNode()
  let pos = 0
  let last: Node = para
  while (node) {
    const len = node.textContent?.length ?? 0
    if (offset <= pos + len) return { node, offset: offset - pos }
    pos += len
    last = node
    node = walk.nextNode()
  }
  return { node: last, offset: last === para ? 0 : (last.textContent?.length ?? 0) }
}

export interface MarkState {
  b: boolean
  i: boolean
}

/**
 * حالة العلامات عند المؤشّر من المتصفح نفسه — تشمل «وضع الكتابة القادمة»
 * (بعد ضغط «ب» بلا تحديد) وهو ما لا يعرفه النموذج بعد. غيابها في بيئة اختبار لا يكسر شيئًا.
 */
function markStateAt(): MarkState {
  const q = (document as Document & { queryCommandState?: (c: string) => boolean }).queryCommandState
  if (typeof q !== 'function') return { b: false, i: false }
  try {
    return { b: !!q.call(document, 'bold'), i: !!q.call(document, 'italic') }
  } catch {
    return { b: false, i: false }
  }
}

/** يعيد التحديد بعد إعادة الرسم — كي يبقى «ب» تبديلًا: اضغطه ثانيةً فيُزال */
function placeSelection(root: HTMLElement, at: FlatSel): void {
  const para = root.children[at.paraIndex]
  if (!para) return
  const s = locate(para, at.start)
  const e = locate(para, at.end)
  const range = document.createRange()
  try {
    range.setStart(s.node, s.offset)
    range.setEnd(e.node, e.offset)
  } catch {
    return
  }
  const sel = window.getSelection?.()
  sel?.removeAllRanges()
  sel?.addRange(range)
}

/**
 * BKL-01: كتلة النص المنسّق. المحتوى غير مُتحكَّم من React عمدًا — React لا يلمس
 * داخل المنطقة أثناء الكتابة (وإلا قفز المؤشّر)؛ المزامنة تحدث فقط حين يتغيّر
 * `value` من الخارج. والرسم يمرّ عبر `richToHtml` من النواة: مهرَّب ومفحوص الروابط.
 */
export function RichTextBlock({
  value,
  placeholder,
  onChange,
}: {
  value: RichTextDto
  /** نصّ إرشادي يظهر ما دامت الكتلة فارغة — لا حقل شبح بلا دلالة */
  placeholder?: string
  onChange: (next: RichTextDto) => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  const emitted = useRef<string>('')
  const pendingSel = useRef<FlatSel | null>(null)
  const [activePara, setActivePara] = useState(0)
  const [marks, setMarks] = useState<MarkState>({ b: false, i: false })
  const data = value.length ? value : EMPTY

  /** حالة المؤشّر الحيّة — تُبقي زرّي «ب» و«م» ناطقين بحالهما لا صامتين */
  function refreshMarks() {
    setMarks(markStateAt())
  }

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const incoming = JSON.stringify(data)
    // صدى تغييرنا نحن — لا نلمس الـDOM كي لا يقفز المؤشّر
    if (incoming === emitted.current) return
    el.innerHTML = richToHtml(data)
    const keep = pendingSel.current
    pendingSel.current = null
    if (keep) placeSelection(el, keep)
  }, [data])

  /** كتابة المستخدم: الـDOM هو المصدر — نبصم كي لا تلمسه المزامنة فيقفز المؤشّر */
  function emit(next: RichTextDto) {
    emitted.current = JSON.stringify(next)
    onChange(next)
  }

  /**
   * تغيير من الشريط: النموذج تغيّر والـDOM لم يتغيّر — فلا بصمة، ودع المزامنة ترسم.
   * (علة حية: البصم هنا كان يجعل المزامنة تظنّه صدى فلا يظهر للتعليم أثر إطلاقًا.)
   */
  function emitAndRedraw(next: RichTextDto, keep: FlatSel | null) {
    emitted.current = ''
    pendingSel.current = keep
    onChange(next)
  }

  function onInput() {
    if (ref.current) emit(parseDom(ref.current))
  }

  function applyMark(mark: Mark) {
    const el = ref.current
    if (!el) return
    const sel = selectionIn(el)
    // بلا تحديد: نفعّل «وضع الكتابة القادمة» في المتصفح بدل أن نُهمل الضغطة بصمت.
    // ما يُكتب يخرج داخل <b>/<i> فيلتقطه parseDom عند أول إدخال — الـDOM هو المصدر أثناء الكتابة.
    if (!sel || sel.start === sel.end) {
      el.focus()
      document.execCommand?.(mark === 'b' ? 'bold' : 'italic', false, undefined)
      refreshMarks()
      return
    }
    emitAndRedraw(toggleMark(parseDom(el), sel.paraIndex, sel.start, sel.end, mark), sel)
    refreshMarks()
  }

  function applyPara(para: RichParaDto['para']) {
    const el = ref.current
    const current = el ? parseDom(el) : data
    const sel = el ? selectionIn(el) : null
    const idx = Math.min(sel?.paraIndex ?? activePara, current.length - 1)
    emitAndRedraw(setPara(current, idx, para), sel ? { ...sel, paraIndex: idx } : null)
  }

  /** مزامنة الفقرة النشطة وحالة العلامات من المؤشّر الحيّ — نفسها لرفع المفاتيح وفأرة الرفع */
  const syncCaret = () => {
    const el = ref.current
    if (el) setActivePara(selectionIn(el)?.paraIndex ?? 0)
    refreshMarks()
  }

  const isEmpty = !data.some((p) => p.runs.some((r) => r.text.trim().length > 0))

  return (
    <div className="rich-block">
      <RichToolbar
        para={data[Math.min(activePara, data.length - 1)]?.para ?? 'p'}
        marks={marks}
        onMark={applyMark}
        onPara={applyPara}
      />
      <div
        ref={ref}
        className={`rich-area${isEmpty && placeholder ? ' is-empty' : ''}`}
        data-ph={placeholder}
        role="textbox"
        aria-multiline="true"
        aria-label={t('editor.richArea')}
        dir="rtl"
        contentEditable
        suppressContentEditableWarning
        onInput={onInput}
        onBlur={onInput}
        onKeyUp={syncCaret}
        onMouseUp={syncCaret}
        // اللصق نصًّا خالصًا دائمًا — لا HTML من الحافظة يدخل الكرّاسة إطلاقًا
        onPaste={(e) => {
          e.preventDefault()
          const text = e.clipboardData.getData('text/plain')
          document.execCommand?.('insertText', false, text)
          onInput()
        }}
      />
    </div>
  )
}
