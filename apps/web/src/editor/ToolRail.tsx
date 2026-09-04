import { useEffect, useRef, useState } from 'react'
import { INK_COLORS, MARK_SHAPES, type MarkColor, type MarkShape } from '@dalili/core'
import {
  IconArrowUpRight,
  IconCircle,
  IconCrop,
  IconCurvedArrow,
  IconCursor,
  IconFit,
  IconLink,
  IconNumber,
  IconOval,
  IconPencil,
  IconSquare,
  IconTarget,
  IconTypeText,
  IconWand,
  IconZoomIn,
  IconZoomOut,
} from '../ui/icons'
import { t, type TKey } from '../i18n'
import {
  isPenTool,
  MOVE_TARGET_TOOL,
  PEN_DRAW_TOOLS,
  PRIMARY_TOOLS,
  type EditorTool,
  type ToolDef,
} from './tools'

/**
 * S2 + إعادة بناء 2026-08-31: عمود الأدوات العائم يمين الشاشة — كشف تدريجي.
 * زر «تعديل/تم» غادر العمود إلى الشريط العلوي؛ وهنا:
 * - وضع العرض: أزرار المنظار وحدها (الوضوح حاجة قراءة لا تحرير).
 * - وضع التعديل: قص/طمس/ريشة (S1: الأداة تسري على كل اللقطات).
 * - الريشة (حاوية كشف): تفتح أشكال الرسم + لوحة الحبر الخماسية + تحريك الهدف،
 *   دون أن تتحرّك الثلاثة الأولى («كل الأزرار تظل في مكانها»).
 *
 * الوصولية شرط قبول: العمود `role="toolbar"` رأسي مُسمّى، وأزراره **نقطة تبويب
 * واحدة** ينتقل داخلها التركيز بالأسهم (roving tabindex) — نمط ARIA للأشرطة.
 */

interface Props {
  editing: boolean
  tool: EditorTool
  onTool: (tool: EditorTool) => void
  color: MarkColor
  onColor: (c: MarkColor) => void
  /** تكبير (+1) أو تصغير (-1) للمنظار في كل اللقطات */
  onZoom: (dir: 1 | -1) => void
  onFit: () => void
  /** EDT-07: يفتح حوار استبدال الروابط — غيابه يخفي الزر (العرض/العارض) */
  onReplaceUrls?: () => void
  /**
   * طلب المالك 2026-09-04: شكل هدفٍ منشَّط الآن (نُقر عليه في اللقطة) — غيابه
   * يعني «لا شكل نشط» فلا يظهر مبدّل الشكل أصلًا. اللوحة نفسها تخدم الحالتين:
   * بشكلٍ نشط تلوّنه فورًا، وبلا شكل تظل لون الحبر للأدوات القادمة.
   */
  markShape?: MarkShape
  onMarkShape?: (shape: MarkShape) => void
}

type IconCmp = typeof IconSquare

/** أيقونة كل أداة — تبقى هنا كي يظل `tools.ts` بيانات صرفة بلا JSX */
const TOOL_ICONS: Record<EditorTool, IconCmp> = {
  select: IconCursor,
  blur: IconWand,
  crop: IconCrop,
  rect: IconSquare,
  ellipse: IconCircle,
  oval: IconOval,
  arrow: IconArrowUpRight,
  'curved-arrow': IconCurvedArrow,
  number: IconNumber,
  text: IconTypeText,
  draw: IconPencil,
  'move-target': IconTarget,
}

/** أسماء ألوان لوحة الحبر بترتيب `INK_COLORS` — للنطق لا للزينة */
const INK_NAMES: Record<MarkColor, TKey> = {
  '#ea580c': 'editor.colorOrange',
  '#e11d48': 'editor.colorRed',
  '#2563eb': 'editor.colorBlue',
  '#16a34a': 'editor.colorGreen',
  '#2b2a26': 'editor.colorGraphite',
}

/** مفاتيح التنقّل داخل الشريط — ما عداها يمرّ للمتصفح كما هو */
const NAV_KEYS = ['ArrowDown', 'ArrowUp', 'ArrowRight', 'ArrowLeft', 'Home', 'End']

/** أيقونة كل شكل هدف + مفتاح نطقه — بيانات لا JSX متكرر */
const SHAPE_META: Record<MarkShape, { Icon: IconCmp; key: TKey }> = {
  rect: { Icon: IconSquare, key: 'editor.markShapeRect' },
  ellipse: { Icon: IconCircle, key: 'editor.markShapeEllipse' },
}

export function ToolRail({
  editing,
  tool,
  onTool,
  color,
  onColor,
  onZoom,
  onFit,
  onReplaceUrls,
  markShape,
  onMarkShape,
}: Props) {
  const railRef = useRef<HTMLElement | null>(null)
  const [focusIdx, setFocusIdx] = useState(0)
  /** كشف أدوات الريشة — يُطوى تلقائيًا عند مغادرة وضع التعديل */
  const [penOpen, setPenOpen] = useState(false)

  useEffect(() => {
    if (!editing) setPenOpen(false)
  }, [editing])

  // عدد الأزرار المعروضة الآن — يحدّد أي زر يحمل tabIndex=0 ويمنع بقاء
  // المؤشّر على زر اختفى بطيّ الريشة أو مغادرة التعديل فيصير العمود بلا نقطة تبويب.
  /** شكل نشط ⇒ مبدّل الشكل ظاهر، واللوحة تظهر معه ولو كانت الريشة مطوية */
  const shapeSwitch = markShape !== undefined && !!onMarkShape
  const paletteShown = penOpen || shapeSwitch
  const total =
    (editing
      ? PRIMARY_TOOLS.length +
        1 +
        (penOpen ? PEN_DRAW_TOOLS.length + 1 : 0) +
        (shapeSwitch ? MARK_SHAPES.length : 0) +
        (paletteShown ? INK_COLORS.length : 0)
      : 0) + 3
  const active = Math.min(focusIdx, total - 1)

  // عدّاد ترتيب الأزرار في DOM — يُصفَّر مع كل رسم فيبقى الترتيب حتميًا
  let seq = 0
  const rove = () => ({ tabIndex: seq++ === active ? 0 : -1 })

  /** طيّ/فتح الريشة: طيّها يطفئ أداةً منها كانت نشطة كي لا يبقى وضع رسم بلا زر ظاهر */
  function togglePen() {
    if (penOpen && isPenTool(tool)) onTool('select')
    setPenOpen((o) => !o)
  }

  /**
   * تنقّل الأسهم داخل الشريط مع الالتفاف عند الطرفين.
   * العمود رأسي فأعلى/أسفل هما الأصل؛ ونقبل الأفقيين أيضًا لأنه ينقلب شريطًا
   * أفقيًا في الشاشات الضيّقة — وفي RTL «يمين» تعني السابق لا التالي.
   */
  function onKeyDown(e: React.KeyboardEvent<HTMLElement>) {
    if (!NAV_KEYS.includes(e.key)) return
    const btns = Array.from(railRef.current?.querySelectorAll<HTMLButtonElement>('button') ?? [])
    if (btns.length === 0) return
    const cur = btns.indexOf(document.activeElement as HTMLButtonElement)
    const from = cur < 0 ? active : cur
    let next: number
    if (e.key === 'Home') next = 0
    else if (e.key === 'End') next = btns.length - 1
    else {
      const back = e.key === 'ArrowUp' || e.key === 'ArrowRight'
      next = (from + (back ? -1 : 1) + btns.length) % btns.length
    }
    e.preventDefault()
    btns[next]?.focus()
    setFocusIdx(next)
  }

  /** زر أداة موحّد — يُبرز عند نشاطها، والنقر ثانيةً عليها يعود بالمؤشّر */
  function toolButton(d: ToolDef) {
    const Icon = TOOL_ICONS[d.tool]
    return (
      <button
        key={d.tool}
        className={`icon-btn${tool === d.tool ? ' on' : ''}`}
        onClick={() => onTool(tool === d.tool ? 'select' : d.tool)}
        data-rail-toggle=""
        aria-pressed={tool === d.tool}
        title={t(d.key)}
        aria-label={t(d.key)}
        {...rove()}
      >
        <Icon size={17} />
      </button>
    )
  }

  return (
    <aside
      className="tool-rail no-print"
      ref={railRef}
      role="toolbar"
      aria-orientation="vertical"
      aria-label={t('editor.toolsRail')}
      onKeyDown={onKeyDown}
    >
      {editing && (
        <>
          {/* الأدوات الأساسية: طمس/قص — ظاهرة فور الدخول لوضع التعديل */}
          {PRIMARY_TOOLS.map((d) => toolButton(d))}

          {/* الريشة: حاوية كشف تفتح أشكال الرسم والألوان وتحريك الهدف */}
          <button
            className={`icon-btn${penOpen ? ' on' : ''}`}
            onClick={togglePen}
            data-rail-toggle=""
            aria-pressed={penOpen}
            title={t('editor.penGroup')}
            aria-label={t('editor.penGroup')}
            {...rove()}
          >
            <IconPencil size={17} />
          </button>

          {penOpen && (
            <>
              <div className="rail-sep" aria-hidden="true" />
              {PEN_DRAW_TOOLS.map((d) => toolButton(d))}
            </>
          )}

          {/*
            طلب المالك 2026-09-04: شكلٌ نشط في اللقطة ⇒ مبدّل شكله هنا (مستطيل/
            دائرة) ولوحة ألوانه معه — حتى لو كانت الريشة مطوية. الغرض أن يكون
            الشريط «شريط خصائص الشكل المحدَّد» كما في وورد، لا قائمة أدوات صمّاء.
          */}
          {shapeSwitch && (
            <>
              <div className="rail-sep" aria-hidden="true" />
              {MARK_SHAPES.map((s) => {
                const { Icon, key } = SHAPE_META[s]
                return (
                  <button
                    key={s}
                    className={`icon-btn${markShape === s ? ' on' : ''}`}
                    onClick={() => onMarkShape?.(s)}
                    data-rail-toggle=""
                    aria-pressed={markShape === s}
                    title={t(key)}
                    aria-label={t(key)}
                    {...rove()}
                  >
                    <Icon size={17} />
                  </button>
                )
              })}
            </>
          )}

          {/* S4: لوحة حبر واحدة — مصدرها INK_COLORS في core، تخدم الشرح والهدف معًا */}
          {paletteShown && (
            <>
              <div className="rail-sep" aria-hidden="true" />
              {INK_COLORS.map((c) => (
                <button
                  key={c}
                  className={`swatch${color === c ? ' on' : ''}`}
                  style={{ background: c }}
                  onClick={() => onColor(c)}
                  data-rail-toggle=""
                  aria-pressed={color === c}
                  title={t('editor.markColorNamed', { name: t(INK_NAMES[c]) })}
                  aria-label={t('editor.markColorNamed', { name: t(INK_NAMES[c]) })}
                  {...rove()}
                />
              ))}
            </>
          )}

          {penOpen && (
            <>
              {/* تحريك الهدف — آخر أدوات الريشة (بقرار المالك: اختصار باقٍ) */}
              <div className="rail-sep" aria-hidden="true" />
              {toolButton(MOVE_TARGET_TOOL)}
            </>
          )}
        </>
      )}

      {/* S7: المنظار متاح في الوضعين — الوضوح حاجة قراءة لا حاجة تحرير.
          أوامر لحظية بلا aria-pressed: لا حالة تُعلَن هنا. */}
      <div className="rail-sep" aria-hidden="true" />
      <button
        className="icon-btn"
        onClick={() => onZoom(1)}
        title={t('editor.zoomIn')}
        aria-label={t('editor.zoomIn')}
        {...rove()}
      >
        <IconZoomIn size={17} />
      </button>
      <button
        className="icon-btn"
        onClick={() => onZoom(-1)}
        title={t('editor.zoomOut')}
        aria-label={t('editor.zoomOut')}
        {...rove()}
      >
        <IconZoomOut size={17} />
      </button>
      <button
        className="icon-btn"
        onClick={onFit}
        title={t('editor.zoomFit')}
        aria-label={t('editor.zoomFit')}
        {...rove()}
      >
        <IconFit size={17} />
      </button>
      {onReplaceUrls && (
        <button
          className="icon-btn"
          onClick={onReplaceUrls}
          title={t('editor.urlReplaceTitle')}
          aria-label={t('editor.urlReplaceTitle')}
          {...rove()}
        >
          <IconLink size={17} />
        </button>
      )}
    </aside>
  )
}
