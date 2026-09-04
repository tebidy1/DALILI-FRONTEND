import type { AnnotationTool, DrawMode } from '../components/StepImage'
import type { TKey } from '../i18n'

/**
 * S1: الأداة النشطة حالة عالمية في المحرر لا حالة داخل كل بطاقة —
 * تُختار مرة من العمود فتسري على كل اللقطات حتى تُطفأ (سلوك برامج الرسم).
 * كانت الشكوى الحرفية: «أزرار التعديل تعمل على كل زر على حده».
 */
export type EditorTool = 'select' | 'blur' | 'crop' | 'move-target' | AnnotationTool

/** الأداة → وضع الرسم الذي تفهمه اللوحة */
export function toolToMode(tool: EditorTool): DrawMode {
  if (tool === 'select') return 'view'
  if (tool === 'blur') return 'blur'
  if (tool === 'crop') return 'crop'
  if (tool === 'move-target') return 'move-target'
  return 'annotate'
}

/** الأداة التي يقع عليها المؤشّر حين لا أداة — ولا حالة عالقة عند مغادرة التعديل */
export const DEFAULT_TOOL: EditorTool = 'select'

export interface ToolDef {
  tool: EditorTool
  /** مفتاح i18n لاسم الأداة */
  key: TKey
  /** مفتاح i18n لتلميح الاستعمال أسفل اللقطة */
  hintKey: TKey
}

/**
 * إعادة بناء العمود (طلب المالك 2026-08-31): كشف تدريجي.
 * - الأدوات الأساسية (طمس/قص) تظهر فور الدخول لوضع التعديل.
 * - «الريشة» حاوية كشف: تفتح أشكال الرسم ثم لوحة الألوان ثم «تحريك الهدف».
 */
export const PRIMARY_TOOLS: ToolDef[] = [
  { tool: 'blur', key: 'editor.blurRegion', hintKey: 'editor.blurDrawHint' },
  { tool: 'crop', key: 'editor.cropImage', hintKey: 'editor.cropDrawHint' },
]

/** أشكال الرسم التي تكشفها الريشة */
export const PEN_DRAW_TOOLS: ToolDef[] = [
  { tool: 'rect', key: 'editor.annToolRect', hintKey: 'editor.annDrawHint' },
  { tool: 'ellipse', key: 'editor.annToolEllipse', hintKey: 'editor.annDrawHint' },
  { tool: 'oval', key: 'editor.annToolOval', hintKey: 'editor.annDrawHint' },
  { tool: 'arrow', key: 'editor.annToolArrow', hintKey: 'editor.annDrawHint' },
  { tool: 'curved-arrow', key: 'editor.annToolCurvedArrow', hintKey: 'editor.annDrawHint' },
  { tool: 'number', key: 'editor.annToolNumber', hintKey: 'editor.annNumberHint' },
  // EDT-05 إكمال (2026-09-04): النص المكتوب والرسم الحر
  { tool: 'text', key: 'editor.annToolText', hintKey: 'editor.annTextHint' },
  { tool: 'draw', key: 'editor.annToolDraw', hintKey: 'editor.annDrawHint' },
]

/** تحريك الهدف — أداة الريشة الأخيرة (بقرار المالك: داخل الريشة لا مستقلة) */
export const MOVE_TARGET_TOOL: ToolDef = {
  tool: 'move-target',
  key: 'editor.moveTarget',
  hintKey: 'editor.moveTargetHint',
}

const SELECT_TOOL: ToolDef = {
  tool: 'select',
  key: 'editor.toolSelect',
  hintKey: 'editor.toolSelectHint',
}

/** أدوات الريشة كلها (أشكال + تحريك الهدف) — تُعرف كي تُطفأ حين تُطوى الريشة */
const PEN_TOOL_SET = new Set<EditorTool>([...PEN_DRAW_TOOLS.map((d) => d.tool), 'move-target'])

/** هل الأداة من مجموعة الريشة؟ طيّ الريشة يطفئ ما كان منها نشطًا */
export function isPenTool(tool: EditorTool): boolean {
  return PEN_TOOL_SET.has(tool)
}

/** كل الأدوات — مصدر واحد لتعريف الأداة بعينها (التلميح والاسم) */
const ALL_TOOLS: ToolDef[] = [SELECT_TOOL, ...PRIMARY_TOOLS, ...PEN_DRAW_TOOLS, MOVE_TARGET_TOOL]

/** تعريف أداة بعينها — للتلميح أسفل اللقطة ولاسمها في الرسائل */
export function toolDef(tool: EditorTool): ToolDef | undefined {
  return ALL_TOOLS.find((d) => d.tool === tool)
}

/** أداة الشرح الفعّالة — اللوحة تحتاج شكلًا حتى في الأوضاع غير الشرحية */
export function annotationToolOf(tool: EditorTool): AnnotationTool {
  return toolToMode(tool) === 'annotate' ? (tool as AnnotationTool) : 'rect'
}
