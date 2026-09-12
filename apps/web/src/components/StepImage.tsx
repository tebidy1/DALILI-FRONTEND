import { useEffect, useRef, useState } from 'react'
import { centerMarkAt, markShapeOf } from '@dalili/core'
import type { Annotation, AnnotationType, Rect, TargetMark } from '@dalili/core'
import { t } from '../i18n'
import {
  clampRect,
  cursorForHandle,
  displayToNatural,
  hitMarkHandle,
  MIN_RECT,
  normalizeDrag,
  resizeRect,
  type DragPoints,
  type MarkHandle,
} from '../editor/rectmath'
import { focusViewport, panViewport, type Viewport } from '../editor/focus'
import { useInView } from '../lib/inview'
import { drawAnnotation, drawHandles, drawMark, drawPreview, drawStepBadge, drawStrokePreview, hitTextAnnotation, uid } from './annotations-render'

export type DrawMode = 'view' | 'blur' | 'crop' | 'annotate' | 'move-target'
/** أداة الشرح النشطة داخل وضع annotate — أي شكل يرسمه السحب */
export type AnnotationTool = AnnotationType

interface Props {
  src: string
  blurRects: Rect[]
  crop?: Rect
  mode: DrawMode
  /** ANNO-01: شروحات مرسومة تُعرض دائمًا (عرض/تعديل)، وتُنشأ في وضع annotate */
  annotations?: Annotation[]
  /** الأداة واللون الفعّالان في وضع annotate */
  tool?: AnnotationTool
  color?: string
  /** ANNO-02: إطار الزر المقصود — يُرسم حيًّا فيقبل التحريك وتغيير اللون */
  mark?: TargetMark
  /**
   * طلب المالك 2026-09-04 (تجربة وورد): الشكل **المنشَّط** — نُقر عليه فظهرت
   * مقابضه، ولوحة ألوان الشريط وأزرار الشكل تخاطبه هو. واحد على مستوى المحرر
   * كله، فالمحرر يملك الحالة وهذه البطاقة تعكسها فقط.
   */
  markActive?: boolean
  onMarkActivate?: (active: boolean) => void
  /** طلب المالك 2026-09-09: رقم الخطوة يُرسم بجوار علامة الهدف بمبدّل «إظهار
   *  الأرقام» — معاينة حيّة لا محتوى محفوظًا؛ غيابه يعني لا شارة */
  autoNumber?: number
  /** المنظار: متحكَّم فيه من الأعلى حين يُمرَّر، وإلا حالة داخلية تبؤّر تلقائيًا */
  viewport?: Viewport
  onViewportChange?: (v: Viewport) => void
  onAddRect?: (r: Rect) => void
  /** EDT-12: الطمس مع مقاس اللقطة الطبيعي — الوقود الذي يحسب به المحرر الاقتراحات */
  onBlurRectNatural?: (r: Rect, size: { w: number; h: number }) => void
  onCrop?: (r: Rect) => void
  onAddAnnotation?: (a: Annotation) => void
  /** بلاغ المالك 2026-09-04: تحريك نص قائم — المعرف والمستطيل الجديد بإحداثيات الصورة */
  onMoveAnnotation?: (id: string, rect: Rect) => void
  /** S3: نقل إطار الهدف — المستطيل الجديد بإحداثيات الصورة الأصلية */
  onMoveMark?: (rect: Rect) => void
  /** EDT-13/UX-03: النص البديل — canvas بلا وصف أصمّ لقارئات الشاشة؛ role=img + aria-label */
  alt?: string
  /** PERF-03: العارض الطويل لا يحمّل لقطة إلا حين تقترب من الشاشة — المحرر يريدها فورًا */
  lazy?: boolean
}

const DEFAULT_COLOR = '#e11d48'
/** S3+: هامش إصابة مقابض الهدف بالبكسل المعروض — كبير كفايةً للمسّ الدقيق */
const HANDLE_TOL = 10

/** رسم الصورة مع الطمس والقص والشرح + سحب المستطيلات/الأسهم في أوضاع التحرير */
export function StepImage({
  src,
  blurRects,
  crop,
  mode,
  annotations,
  tool = 'rect',
  color = DEFAULT_COLOR,
  mark,
  autoNumber,
  markActive,
  onMarkActivate,
  viewport,
  onViewportChange,
  onAddRect,
  onBlurRectNatural,
  onCrop,
  onAddAnnotation,
  onMoveAnnotation,
  onMoveMark,
  alt,
  lazy,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const imgRef = useRef<HTMLImageElement | null>(null)
  const boxRef = useRef<HTMLDivElement | null>(null)
  const [drag, setDrag] = useState<DragPoints | null>(null)
  /** S3+: سحب مباشر لإطار الهدف — تحريكه أو تحجيمه بمقبض، بإحداثيات العرض */
  const [markDrag, setMarkDrag] = useState<{
    handle: MarkHandle
    startRect: Rect
    startX: number
    startY: number
    curX: number
    curY: number
  } | null>(null)
  /** المقبض تحت المؤشّر (بلا سحب) — يقود شكل المؤشّر فيُفهم أن الإطار قابل للتحريك/التحجيم */
  const [hoverHandle, setHoverHandle] = useState<MarkHandle | null>(null)
  const [autoVp, setAutoVp] = useState<Viewport | null>(null)
  const vp = viewport ?? autoVp
  /** مقبض اليد (Pan): سحب حرّ يحرّك اللقطة المكبّرة حين لا أداة نشطة (تصفّح).
   *  نقطة البدء تحمل المنظار وقت الإمساك، فالإزاحة تُحسب من ثابت لا يتراكم خطؤه. */
  const panRef = useRef<{ x: number; y: number; vp: Viewport } | null>(null)
  const [grabbing, setGrabbing] = useState(false)
  /** هل تفيض الصورة عن المنظار فتقبل التحريك؟ يحكم ظهور مؤشّر اليد وتفعيل السحب */
  const [canPan, setCanPan] = useState(false)
  // lazy فقط يستدعي المراقب — المحرر يرسم فورًا بلا كلفة
  const [holderRef, inView] = useInView<HTMLDivElement>(!!lazy)
  const active = !lazy || inView
  /** EDT-05: مسار الرسم الحر قيد السحب — نقاط معروضة تعاين حيًّا وتُحوَّل عند الإفلات */
  const [strokePts, setStrokePts] = useState<Array<{ x: number; y: number }> | null>(null)
  /** EDT-05: مربع كتابة النص — موضعه معروضًا وبإحداثياته الطبيعية للتثبيت */
  const [textInput, setTextInput] = useState<{ dx: number; dy: number; nx: number; ny: number } | null>(null)
  const [textValue, setTextValue] = useState('')
  /** بلاغ المالك 2026-09-04: إمساك نص قائم بأداة النص — سحبٌ يحرّكه بإحداثيات العرض */
  const [textDrag, setTextDrag] = useState<{ id: string; orig: Rect; startX: number; startY: number; curX: number; curY: number } | null>(null)
  /** حارس الالتقاط المزدوج: Enter/Escape ثم blur يجب ألا يثبّتا مرتين، وEscape يجب ألا يثبّت */
  const textDoneRef = useRef(false)
  /** مربع النص — لإعادة التركيز حين تفرّغ اللوحة التركيز بلا وجهة (افتراض النقر) */
  const textInputRef = useRef<HTMLInputElement | null>(null)

  /**
   * تجربة وورد (طلب المالك 2026-09-04): الشكل يُمسك مباشرةً بلا وضعٍ خاص.
   * - `markInteractive`: التحكّم متاح — محرِّرٌ يقبل التحريك (`onMoveMark`)،
   *   وفي وضع التصفّح (المؤشّر) أو في وضع «حرّك الهدف» القديم الباقي اختصارًا.
   *   العارض لا يمرّر `onMoveMark` فيبقى شكله للقراءة لا للمس.
   * - `markSelected`: منشَّط — بالنقر عليه، أو تلقائيًا في وضع «حرّك الهدف».
   */
  const markInteractive = !!onMoveMark && !!mark && (mode === 'view' || mode === 'move-target')
  const markSelected = markInteractive && (mode === 'move-target' || !!markActive)
  const markHandlesShown = markSelected

  useEffect(() => {
    if (!active) return
    const img = new Image()
    img.onload = () => {
      imgRef.current = img
      render()
      resetViewport()
    }
    img.src = src
    return () => {
      img.onload = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src, active])

  useEffect(() => {
    render()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blurRects, crop, annotations, drag, markDrag, mode, tool, color, mark, markHandlesShown, strokePts, textDrag, autoNumber])

  /** تغيّر مقاس الصندوق (تدوير الجهاز/تغيير النافذة) يعيد حساب المنظار */
  useEffect(() => {
    const box = boxRef.current
    // ResizeObserver غير موجود في بيئة jsdom — الحارس يمنع الرمي في الاختبارات
    if (!box || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(() => resetViewport())
    ro.observe(box)
    return () => ro.disconnect()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /** يطبّق منظارًا جديدًا: متحكَّم فيه من الأعلى إن مُرِّر، وإلا حالة داخلية */
  function applyViewport(next: Viewport) {
    if (onViewportChange) onViewportChange(next)
    else setAutoVp(next)
  }

  /** أول رسم بعد تحميل الصورة: يبؤّر على الهدف (أو يلائم الصورة كاملة بلا هدف) */
  function resetViewport() {
    const img = imgRef.current
    const box = boxRef.current
    if (!img || !box) return
    const imgW = crop?.w || img.naturalWidth
    const imgH = crop?.h || img.naturalHeight
    const r = box.getBoundingClientRect()
    if (r.width === 0 || r.height === 0) return
    applyViewport(focusViewport(markLocal(mark?.rect, crop), imgW, imgH, r.width, r.height))
  }

  /** يفيض الصورة عن المنظار ⇒ قابلة للتحريك بمقبض اليد (وضع التصفّح فقط) */
  useEffect(() => {
    const canvas = canvasRef.current
    const box = boxRef.current
    if (!canvas || !box || !vp || mode !== 'view') {
      setCanPan(false)
      return
    }
    const r = box.getBoundingClientRect()
    setCanPan(canvas.width * vp.scale > r.width + 1 || canvas.height * vp.scale > r.height + 1)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- يُعاد حسابه مع كل تغيّر منظار/وضع
  }, [vp, mode])

  function render() {
    const canvas = canvasRef.current
    const img = imgRef.current
    if (!canvas || !img) return
    const c = canvas.getContext('2d')!
    const cw = crop?.w || img.naturalWidth
    const ch = crop?.h || img.naturalHeight
    canvas.width = cw
    canvas.height = ch
    if (crop) {
      c.drawImage(img, crop.x, crop.y, crop.w, crop.h, 0, 0, cw, ch)
    } else {
      c.drawImage(img, 0, 0)
    }
    for (const r of blurRects) pixelate(c, img, r, crop)
    /**
     * ANNO-02 + بلاغ المالك 2026-09-04 («مستطيلان فوق بعض، يتحرك أحدهما ويظل
     * الآخر»): إطار الهدف يُرسم **مرة واحدة لا غير**. كان الأساسي يُرسم بلا شرط
     * ثم تُرسم فوقه معاينة السحب، فيظهر إطاران أحدهما جامد. الآن المعاينة —
     * إن وُجدت — تحلّ محلّ الأساسي في الرسم لا تُضاف إليه: ما تسحبه هو الشكل
     * نفسه، تمامًا كما في وورد.
     */
    const ml = mark ? markLocal(markPreviewRect() ?? mark.rect, crop) : undefined
    if (mark && ml) {
      drawMark(c, ml, mark.color, img.naturalWidth, 1, markShapeOf(mark))
      // المقابض للشكل المنشَّط وحده — الشكل الهادئ يظل خطًّا نظيفًا كما يُطبع
      if (markHandlesShown) drawHandles(c, ml, img.naturalWidth, mark.color)
      // طلب المالك 2026-09-09: «إظهار الأرقام» يرسم رقم الخطوة بجوار علامة الهدف من بعيد.
      // البُعد والحدود بإحداثيات اللوحة الظاهرة (cw×ch) لا الصورة الأصلية — وإلا
      // انحرف الرقم والسهم في اللقطات المقصوصة (طلب المالك 2026-09-11).
      if (autoNumber != null) drawStepBadge(c, ml, autoNumber, mark.color, cw, { w: cw, h: ch })
    }
    // طلب المالك 2026-09-11: الخطوة بلا هدف (كفتح الموقع) لا تُرسم رقمها على اللوحة —
    // منظار العارض يقصّ حواف اللقطة فيضيع رقم الركن. تُعرَض بشارة HTML فوق الإطار
    // الثابت (`shot-viewport`) بدل الرسم على اللوحة (انظر JSX أدناه).
    // الشرح فوق الطمس — بمقياس يتناسب مع عرض الصورة الطبيعي
    const scale = img.naturalWidth
    for (const a of annotations ?? []) {
      // النص الممسوك يعاين حيًّا في موضعه الجديد بنفس دالة الإفلات
      if (textDrag && a.id === textDrag.id) {
        const moved = movedTextRect()
        if (moved) {
          drawAnnotation(c, { ...a, rect: moved }, crop, scale)
          continue
        }
      }
      drawAnnotation(c, a, crop, scale)
    }
    if (mode === 'annotate' && drag) drawPreview(c, drag, tool, color, scale)
    // EDT-05: معاينة مسار الرسم الحر أثناء السحب
    if (mode === 'annotate' && tool === 'draw' && strokePts) drawStrokePreview(c, strokePts, color, scale)
  }

  /**
   * S3: موضع إطار الهدف بعد نقل مركزه إلى نقطة معروضة على اللوحة.
   * النقطة بالبكسل **المعروض** (بعد transform المنظار)، فتُضرب في نسبة
   * «بكسل طبيعي لكل بكسل معروض» لتصير إحداثيات لوحة — أي **بعد القص** —
   * ثم تُعاد إليها إزاحة القص لأن `mark.rect` محفوظ بإحداثيات الصورة
   * الأصلية لا المقصوصة؛ بلا هذه الإعادة ينزلق الإطار بمقدار القص.
   * حدود الحصر هي أبعاد الصورة الطبيعية للسبب نفسه.
   */
  function markMovedTo(x: number, y: number): Rect | null {
    const canvas = canvasRef.current
    const img = imgRef.current
    if (!canvas || !img || !mark) return null
    const box = canvas.getBoundingClientRect()
    if (box.width === 0 || box.height === 0) return null
    const nx = Math.round((x * canvas.width) / box.width) + (crop?.x ?? 0)
    const ny = Math.round((y * canvas.height) / box.height) + (crop?.y ?? 0)
    return centerMarkAt(mark.rect, nx, ny, img.naturalWidth, img.naturalHeight)
  }

  function pointerPos(e: React.PointerEvent<HTMLCanvasElement>): { x: number; y: number } {
    const canvas = canvasRef.current!
    const rect = canvas.getBoundingClientRect()
    return { x: e.clientX - rect.left, y: e.clientY - rect.top }
  }

  /** S3+: مستطيل إطار الهدف بإحداثيات العرض (نفس فضاء pointerPos) لاختبار المقابض */
  function markDisplayRect(): Rect | null {
    const canvas = canvasRef.current
    const ml = markLocal(mark?.rect, crop)
    if (!canvas || !ml) return null
    const box = canvas.getBoundingClientRect()
    if (box.width === 0 || box.height === 0) return null
    const sx = box.width / canvas.width
    const sy = box.height / canvas.height
    return { x: ml.x * sx, y: ml.y * sy, w: ml.w * sx, h: ml.h * sy }
  }

  /**
   * مستطيل الهدف قيد المعاينة الحيّة، أو `null` إن لم تكن هناك معاينة أصلًا.
   * مصدرٌ **واحد** للمعاينة (بلاغ «المستطيلين»): سحب مقبض، أو إعادة تمركز
   * بنقرةٍ في الفراغ داخل وضع «حرّك الهدف» القديم. `render` ترسم هذه أو
   * المحفوظ — لا الاثنين.
   */
  function markPreviewRect(): Rect | null {
    if (markDrag) return markDragPreview()
    if (mode === 'move-target' && drag) return markMovedTo(drag.x1, drag.y1)
    return null
  }

  /** S3+: مستطيل الهدف الجديد أثناء سحب مقبض — إزاحة العرض تُحوَّل طبيعية ثم تُطبَّق */
  function markDragPreview(): Rect | null {
    const canvas = canvasRef.current
    const img = imgRef.current
    if (!canvas || !img || !markDrag) return null
    const box = canvas.getBoundingClientRect()
    if (box.width === 0 || box.height === 0) return null
    const sx = canvas.width / box.width
    const sy = canvas.height / box.height
    const dx = (markDrag.curX - markDrag.startX) * sx
    const dy = (markDrag.curY - markDrag.startY) * sy
    return resizeRect(markDrag.startRect, markDrag.handle, dx, dy, img.naturalWidth, img.naturalHeight)
  }

  /** بلاغ المالك 2026-09-04: موضع النص الممسوك لحظةً بلحظة — إزاحة العرض تُحوَّل طبيعية */
  function movedTextRect(): Rect | null {
    const td = textDrag
    const canvas = canvasRef.current
    if (!td || !canvas) return null
    const box = canvas.getBoundingClientRect()
    if (box.width === 0 || box.height === 0) return null
    const sx = canvas.width / box.width
    const sy = canvas.height / box.height
    return {
      ...td.orig,
      x: Math.round(td.orig.x + (td.curX - td.startX) * sx),
      y: Math.round(td.orig.y + (td.curY - td.startY) * sy),
    }
  }

  function onPointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    /**
     * تجربة وورد: الشكل يُمسك قبل أي سلوك آخر للوحة. إمساك مقبضٍ يحجّم، وإمساك
     * جسمه يحرّكه، والنقر عليه يُنشّطه (فتظهر مقابضه وتخاطبه لوحة الألوان).
     * غير المنشَّط لا مقابض له تُصطاد — نقرة أولى تنشّط، ثم تُحجَّم.
     */
    if (markInteractive && mark) {
      const p = pointerPos(e)
      const dr = markDisplayRect()
      const handle = dr ? hitMarkHandle(dr, p.x, p.y, HANDLE_TOL, markSelected) : null
      if (handle) {
        e.currentTarget.setPointerCapture?.(e.pointerId)
        if (!markActive) onMarkActivate?.(true)
        setMarkDrag({ handle, startRect: mark.rect, startX: p.x, startY: p.y, curX: p.x, curY: p.y })
        return
      }
      // نقرة خارج الشكل تُلغي تنشيطه — كما ينزع وورد التحديد عند النقر في الفراغ
      if (markActive) onMarkActivate?.(false)
    }
    if (mode === 'view') {
      // تصفّح: مقبض اليد يحرّك اللقطة المكبّرة فقط — لا إمساك للقطة تلائم إطارها
      if (!canPan || !vp) return
      e.currentTarget.setPointerCapture?.(e.pointerId)
      panRef.current = { x: e.clientX, y: e.clientY, vp }
      setGrabbing(true)
      return
    }
    // S3+: وضع «حرّك الهدف» (اختصار باقٍ): نقرةٌ في الفراغ حوله تبقى «إعادة
    // تمركز» بالسلوك القديم المألوف — أما الإمساك المباشر فسبقه فوق.
    if (mode === 'move-target' && mark) {
      e.currentTarget.setPointerCapture?.(e.pointerId)
      const p = pointerPos(e)
      setDrag({ x0: p.x, y0: p.y, x1: p.x, y1: p.y })
      return
    }
    // EDT-05: النص — النقرة تفتح مربع الكتابة، وإمساكُ نصٍّ قائم يبدأ تحريكه (بلاغ المالك 2026-09-04)
    if (mode === 'annotate' && tool === 'text') {
      // افتراض النقر يفرّغ التركيز (اللوحة ليست عنصر تركيز) — بلا هذا يُسرق تركيز
      // المربع لحظة تركيبه فيشتعل blur ويُثبَّت فارغًا ويختفي قبل أن يُرى (بلاغ المالك ٣)
      e.preventDefault()
      // بلاغ المالك (تجربة ثانية): مربع مفتوح والنقر بعيدًا = إثبات ما كُتب — والنقرة
      // نفسها لا تفتح مربعًا جديدًا ولا تبدأ سحبًا، كما تتصرف برامج الرسم
      if (textInput) {
        commitTextInput()
        return
      }
      const canvas = canvasRef.current!
      const box = canvas.getBoundingClientRect()
      if (box.width === 0 || box.height === 0) return
      const p = pointerPos(e)
      const scaleX = canvas.width / box.width
      const scaleY = canvas.height / box.height
      const nx = Math.round(p.x * scaleX) + (crop?.x ?? 0)
      const ny = Math.round(p.y * scaleY) + (crop?.y ?? 0)
      const hit = hitTextAnnotation(annotations ?? [], nx, ny, canvas.width)
      if (hit?.rect && onMoveAnnotation) {
        e.currentTarget.setPointerCapture?.(e.pointerId)
        setTextDrag({ id: hit.id, orig: hit.rect, startX: p.x, startY: p.y, curX: p.x, curY: p.y })
        return
      }
      textDoneRef.current = false
      setTextInput({ dx: p.x, dy: p.y, nx, ny })
      setTextValue('')
      return
    }
    // EDT-05: الرسم الحر — الإمساك يبدأ المسار والحركة تطيله
    if (mode === 'annotate' && tool === 'draw') {
      e.currentTarget.setPointerCapture?.(e.pointerId)
      const p = pointerPos(e)
      setStrokePts([{ x: p.x, y: p.y }])
      return
    }
    e.currentTarget.setPointerCapture?.(e.pointerId)
    const p = pointerPos(e)
    setDrag({ x0: p.x, y0: p.y, x1: p.x, y1: p.y })
  }

  function onPointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    if (panRef.current) {
      const canvas = canvasRef.current
      const box = boxRef.current
      if (!canvas || !box) return
      const r = box.getBoundingClientRect()
      // الإزاحة من منظار وقت الإمساك (ثابت) بمقدار مجموع السحب — حساب نقيّ محصور
      applyViewport(
        panViewport(
          panRef.current.vp,
          e.clientX - panRef.current.x,
          e.clientY - panRef.current.y,
          canvas.width,
          canvas.height,
          r.width,
          r.height,
        ),
      )
      return
    }
    // EDT-05: إطالة مسار الرسم — نقطة كل ≥8px معروضة (تقريب بسيط يخفف الحجم)
    if (strokePts) {
      const p = pointerPos(e)
      const last = strokePts[strokePts.length - 1]!
      if (Math.hypot(p.x - last.x, p.y - last.y) < 8) return
      setStrokePts([...strokePts, { x: p.x, y: p.y }])
      return
    }
    if (markDrag) {
      const p = pointerPos(e)
      setMarkDrag({ ...markDrag, curX: p.x, curY: p.y })
      return
    }
    // بلاغ المالك: إطالة سحب النص الممسوك — المعاينة تلاحقه على اللوحة
    if (textDrag) {
      const p = pointerPos(e)
      setTextDrag({ ...textDrag, curX: p.x, curY: p.y })
      return
    }
    if (markInteractive && !drag) {
      // مرور بلا سحب: حدّث المقبض تحت المؤشّر ليتبدّل شكله فيُفهم أن الشكل
      // يُمسك ويُحجَّم قبل أن يُلمس (تلميح القابلية — أهمّ ما في تجربة وورد)
      const p = pointerPos(e)
      const dr = markDisplayRect()
      setHoverHandle(dr ? hitMarkHandle(dr, p.x, p.y, HANDLE_TOL, markSelected) : null)
      if (mode === 'view') return
    }
    if (mode === 'move-target' && !drag) return
    if (!drag) return
    const p = pointerPos(e)
    setDrag({ ...drag, x1: p.x, y1: p.y })
  }

  function onPointerUp() {
    if (panRef.current) {
      panRef.current = null
      setGrabbing(false)
      return
    }
    // EDT-05: انتهى مسار الرسم — نقطتان فأكثر تُثبَّت بإحداثيات طبيعية
    if (strokePts) {
      const canvas = canvasRef.current
      const pts = strokePts
      setStrokePts(null)
      if (!canvas || !onAddAnnotation) return
      const box = canvas.getBoundingClientRect()
      if (box.width === 0 || box.height === 0) return
      const scaleX = canvas.width / box.width
      const scaleY = canvas.height / box.height
      if (pts.length < 2) return
      const path = pts.map((p) => ({
        x: Math.round(p.x * scaleX) + (crop?.x ?? 0),
        y: Math.round(p.y * scaleY) + (crop?.y ?? 0),
      }))
      onAddAnnotation({ id: uid(), type: 'draw', color, path })
      return
    }
    // S3+: انتهى سحب مقبض الهدف — احفظ المستطيل الجديد (تحريكًا كان أو تحجيمًا)
    if (markDrag) {
      const pv = markDragPreview()
      setMarkDrag(null)
      if (pv) onMoveMark?.(pv)
      return
    }
    // بلاغ المالك 2026-09-04: انتهى سحب النص — الموضع الجديد محصورًا داخل اللقطة
    if (textDrag) {
      const td = textDrag
      const moved = movedTextRect()
      setTextDrag(null)
      const canvas = canvasRef.current
      if (!moved || !canvas || !onMoveAnnotation) return
      const box = canvas.getBoundingClientRect()
      if (box.width === 0 || box.height === 0) return
      if (Math.hypot(td.curX - td.startX, td.curY - td.startY) < 3) return // نقرة بلا سحب — لا تحريك بالصدفة
      const ox = crop?.x ?? 0
      const oy = crop?.y ?? 0
      const rect: Rect = {
        ...moved,
        x: Math.min(ox + canvas.width, Math.max(ox, moved.x)),
        y: Math.min(oy + canvas.height, Math.max(oy, moved.y)),
      }
      onMoveAnnotation(td.id, rect)
      return
    }
    if (!drag) return
    const canvas = canvasRef.current!
    // getBoundingClientRect يعيد الصندوق **بعد** التحويل، فتبقى هذه النسبة
    // «بكسل طبيعي لكل بكسل معروض» مهما بلغ تكبير المنظار — لا تُبدَّل.
    const box = canvas.getBoundingClientRect()
    const scaleX = canvas.width / box.width
    const scaleY = canvas.height / box.height
    const d = drag
    setDrag(null)

    if (mode === 'move-target') {
      // نقطة الإفلات هي المركز الجديد للإطار؛ `markMovedTo` تتكفّل بإعادة
      // إزاحة القص وبحصر المستطيل داخل الصورة (centerMarkAt).
      const moved = markMovedTo(d.x1, d.y1)
      if (moved) onMoveMark?.(moved)
      return
    }

    if (mode === 'annotate') {
      commitAnnotation(d, scaleX, scaleY, box.width, box.height)
      return
    }

    // الحصر بمقاس اللوحة **المعروض** لا بعدد بكسلها: نقاط السحب معروضة أصلًا،
    // وتحت تكبير أكبر من ١ كان حدّ canvas.width يبتر المستطيل قبل تحويله.
    const display = clampRect(normalizeDrag(d), box.width, box.height)
    if (display.w < MIN_RECT || display.h < MIN_RECT) return
    const natural = displayToNatural(display, scaleX, scaleY, crop)
    if (mode === 'blur') {
      onAddRect?.(natural)
      // EDT-12: المقاس الطبيعي لحظة الالتقاط — canvas.width/height هما بعد القص
      onBlurRectNatural?.(natural, { w: canvas.width, h: canvas.height })
    } else if (mode === 'crop') onCrop?.(natural)
  }

  /**
   * EDT-05: تثبيت النص المكتوب — Enter يحفظه تعليقًا. وبلاغ المالك (تجربة ثانية):
   * النقر بعيدًا والمربع مفتوح **يثبّت** ما كُتب كما الرسام — المحتوى لا يضيع أبدًا؛
   * Escape وحده يلغي. الحارس يمنع تكرار الالتقاط حين يتبع Enter أو Escape blur.
   */
  function commitTextInput() {
    if (!textInput || textDoneRef.current) return
    textDoneRef.current = true
    const t0 = textInput
    const value = textValue.trim()
    setTextInput(null)
    setTextValue('')
    if (!value || !onAddAnnotation) return
    onAddAnnotation({ id: uid(), type: 'text', color, text: value, rect: { x: t0.nx, y: t0.ny, w: 0, h: 0 } })
  }

  function commitAnnotation(d: DragPoints, scaleX: number, scaleY: number, boxW: number, boxH: number) {
    if (!onAddAnnotation) return
    const ox = crop?.x ?? 0
    const oy = crop?.y ?? 0
    const toNat = (x: number, y: number) => ({ x: Math.round(x * scaleX) + ox, y: Math.round(y * scaleY) + oy })
    const p0 = toNat(d.x0, d.y0)
    const p1 = toNat(d.x1, d.y1)
    const id = uid()

    if (tool === 'number') {
      // نقرة تضع شارة رقم — الرقم التالي بعد أعلى رقم قائم
      const next = (annotations ?? []).reduce((m, a) => (a.type === 'number' ? Math.max(m, a.n ?? 0) : m), 0) + 1
      onAddAnnotation({ id, type: 'number', color, rect: { x: p1.x, y: p1.y, w: 0, h: 0 }, n: next })
      return
    }
    if (tool === 'arrow' || tool === 'curved-arrow') {
      const dist = Math.hypot(p1.x - p0.x, p1.y - p0.y)
      if (dist < MIN_RECT) return
      onAddAnnotation({ id, type: tool, color, from: p0, to: p1 })
      return
    }
    // أشكال مؤطّرة: مستطيل حاوٍ من نقطتي السحب، محصور بمقاس اللوحة المعروض
    const display = clampRect(normalizeDrag(d), boxW, boxH)
    if (display.w < MIN_RECT || display.h < MIN_RECT) return
    const rect = displayToNatural(display, scaleX, scaleY, crop)
    onAddAnnotation({ id, type: tool, color, rect })
  }

  // مستطيل التحديد المتقطّع للطمس والقص فقط — تحريك الهدف معاينته على اللوحة
  const dragRect = (mode === 'blur' || mode === 'crop') && drag ? normalizeDrag(drag) : null
  const drawing = mode !== 'view'
  /** S3: الأداة لا تُفعَّل بلا هدف — لا إيماءة لشيء غير موجود */
  const movingTarget = mode === 'move-target' && !!mark
  /**
   * المؤشّر: مقبض اليد/سهم التحجيم فوق الشكل (وأثناء سحبه)، وإلا صليب «انقر
   * لإعادة التمركز» في وضع «حرّك الهدف»، وإلا يترك التصفّح لأصنافه في CSS.
   */
  const handleCursor = markInteractive ? cursorForHandle(markDrag?.handle ?? hoverHandle, !!markDrag) : ''
  const mtCursor = handleCursor || (movingTarget ? 'crosshair' : undefined)

  return (
    <div
      className={`shot${drawing ? ' drawing' : ''}${movingTarget ? ' moving-target' : ''}${
        mode === 'view' && canPan ? ' can-pan' : ''
      }${grabbing ? ' grabbing' : ''}`}
      ref={holderRef}
    >
      <div className="shot-viewport" ref={boxRef}>
        {active ? (
          <canvas
            ref={canvasRef}
            role="img"
            aria-label={alt}
            style={
              vp
                ? {
                    transform: `translate(${vp.tx}px, ${vp.ty}px) scale(${vp.scale})`,
                    transformOrigin: '0 0',
                    ...(mtCursor ? { cursor: mtCursor } : {}),
                  }
                : { visibility: 'hidden' }
            }
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerLeave={() => setHoverHandle(null)}
          />
        ) : (
          <div className="shot-idle" aria-hidden="true" />
        )}
        {/*
          طلب المالك 2026-09-11: رقم الخطوة بلا هدف (كفتح الموقع) — شارة فوق الإطار
          الثابت لا على اللوحة، فلا يقصّها منظار العرض. لا سهم: لا زرّ يشير إليه.
        */}
        {active && autoNumber != null && !mark && (
          <div className="shot-step-num" style={{ backgroundColor: color }} aria-hidden="true">
            {autoNumber}
          </div>
        )}
        {dragRect && (
          <div
            className="selection"
            style={{
              // نقاط السحب مقيسة من getBoundingClientRect للوحة، أي أنها **بعد**
              // التحويل (بكسل معروض). فلا تُضرب في المقياس ثانيةً — يكفي إزاحتها
              // بموضع اللوحة داخل المنظار كي ينطبق المستطيل على ما تحت المؤشّر.
              left: dragRect.x + (vp?.tx ?? 0),
              top: dragRect.y + (vp?.ty ?? 0),
              width: dragRect.w,
              height: dragRect.h,
            }}
          />
        )}
        {/* EDT-05: مربع كتابة النص في موضع النقرة — Enter يثبّت وEsc يلغي */}
        {textInput && (
          <input
            ref={textInputRef}
            className="shot-text-input"
            style={{ left: textInput.dx + (vp?.tx ?? 0), top: textInput.dy + (vp?.ty ?? 0) }}
            dir="rtl"
            maxLength={80}
            autoFocus
            value={textValue}
            onChange={(e) => setTextValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitTextInput()
              else if (e.key === 'Escape') {
                textDoneRef.current = true // ملغي صراحةً — blur اللاحق لا يثبّت
                setTextInput(null)
                setTextValue('')
              }
            }}
            onBlur={(e) => {
              // وجهة تركيز حقيقية (زر الشريط/Tab) = مضى الكتابة تُثبَّت؛ أما تفريغ
              // التركيز الصامت (بلا وجهة) فهو أثر نقرة اللوحة — يُعاد التركيز فتُكمل كتابتك
              if (e.relatedTarget) commitTextInput()
              else setTimeout(() => textInputRef.current?.focus(), 0)
            }}
            placeholder={t('editor.annTextPlaceholder')}
            aria-label={t('editor.annTextPlaceholder')}
          />
        )}
      </div>
    </div>
  )
}

/** يحوّل مستطيل الهدف من إحداثيات الصورة الأصلية إلى إحداثيات اللوحة بعد القص */
function markLocal(rect: Rect | undefined, crop: Rect | undefined): Rect | undefined {
  if (!rect) return undefined
  return { x: rect.x - (crop?.x ?? 0), y: rect.y - (crop?.y ?? 0), w: rect.w, h: rect.h }
}

/** تطمس بالتحجين: المنطقة تُصغَّر ثم تُكبَّر بتنعيم معطل */
function pixelate(c: CanvasRenderingContext2D, img: HTMLImageElement, r: Rect, crop?: Rect) {
  const ox = crop?.x ?? 0
  const oy = crop?.y ?? 0
  const factor = 12
  const tw = Math.max(1, Math.round(r.w / factor))
  const th = Math.max(1, Math.round(r.h / factor))
  const tmp = document.createElement('canvas')
  tmp.width = tw
  tmp.height = th
  const tc = tmp.getContext('2d')!
  tc.drawImage(img, r.x, r.y, r.w, r.h, 0, 0, tw, th)
  c.imageSmoothingEnabled = false
  c.drawImage(tmp, 0, 0, tw, th, r.x - ox, r.y - oy, r.w, r.h)
  c.imageSmoothingEnabled = true
}
