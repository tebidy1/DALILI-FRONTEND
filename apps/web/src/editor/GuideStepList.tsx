import { Fragment } from 'react'
import type { GuideDto, StepDto } from '@dalili/shared'
import { StepCard, type ZoomCommand } from '../components/StepCard'
import { InsertStep, type InsertKind } from '../components/InsertStep'
import { isPicked, type Selection } from '../lib/selection'
import { hostOf } from '../lib/format'
import { stepSuspects, type Suspect } from './suspects'
import type { EditorTool } from './tools'
import type { MarkColor, Rect } from '@dalili/core'
import { t } from '../i18n'

/** TAM-01: مصفوفة الشكوك الفارغة الثابتة — هوية مستقرّة للمقارنة لا تُعيد رسم البطاقات */
const NO_SUSPECTS: Suspect[] = []

/**
 * BLK-01/CAP-17: حلقة خطوات الدليل في المحرر — استُخرجت من `EditorPage`
 * (قانون الحجم §5.7). السلوك منقول كما هو بلا تغيير.
 */
export function GuideStepList(p: {
  guide: GuideDto
  guideId?: string
  nums: (number | null)[]
  editMode: boolean
  /** طلب المالك 2026-09-09: مبدّل «إظهار الأرقام» من قائمة «المزيد» — شارة رقم قرب علامة الهدف */
  showNums?: boolean
  tool: EditorTool
  markColor: MarkColor
  zoomCmd: ZoomCommand | null
  sel: Selection
  dragFrom: number | null
  activeMark: string | null
  onInsert: (kind: InsertKind, at: number) => void
  onVoiceTranscribed: () => void
  onBlurApplied: (i: number, rect: Rect, size: { w: number; h: number }) => void
  onAttachShot: (i: number, file: File) => void
  /** TAM-01 (2026-09-21): مفتاح رادار الطمس التلقائي من قائمة «المزيد» —
   *  قراءة حقائق فقط لا تلمس الالتقاط ولا الخادم، وعند الإيقاف صفر كلفة */
  autoMask?: boolean
  autoMaskedIds?: ReadonlySet<string>
  onMaskTarget?: (i: number) => void
  onOpenBlur?: () => void
  updateStep: (i: number, patch: Partial<StepDto>) => void
  moveStep: (i: number, dir: -1 | 1) => void
  removeStep: (i: number) => void
  duplicateStep: (i: number) => void
  setMark: (i: number, rect: Rect) => void
  setActiveMark: (id: string | null) => void
  pickStep: (id: string, range: boolean) => void
  moveStepTo: (from: number, to: number) => void
  setDragFrom: (i: number | null) => void
}) {
  const {
    guide, guideId: id, nums, editMode, showNums, tool, markColor, zoomCmd, sel, dragFrom, activeMark,
    onInsert: insertBlock, onVoiceTranscribed, onBlurApplied, onAttachShot: attachShot,
    autoMask, autoMaskedIds, onMaskTarget, onOpenBlur,
    updateStep, moveStep, removeStep, duplicateStep, setMark, setActiveMark, pickStep, moveStepTo, setDragFrom,
  } = p
  // طلب المالك 2026-09-09: كبسولة الرابط عند أول ظهور للدومين أو تغيّره فقط —
  // كأن تسجيلًا فتح تبويبًا آخر. تُقارن بآخر خطوة لها رابط لا بالسطر السابق حتمًا.
  let prevHost: string | null = null
  return (
    <>
        {guide.steps.map((s, i) => {
          const host = s.url ? hostOf(s.url) : null
          const showUrl = !!host && host !== prevHost
          if (host) prevHost = host
          // TAM-01: شكوك هذه الخطوة — نصوص حقائقها المخزّنة فقط، ومحجوبة بعد طمس الهدف
          const suspects = autoMask && !autoMaskedIds?.has(s.id) ? stepSuspects(s) : NO_SUSPECTS
          return (
          <Fragment key={s.id}>
            {/* CAP-17: موضع إدراج فوق كل شريحة — في وضع التعديل فقط، يحمل موضعه الصريح */}
            {editMode && (
              <InsertStep
                label={t('editor.insertBefore', { no: i + 1 })}
                insertAt={i}
                onInsert={insertBlock}
              />
            )}
            <div id={`step-${s.id}`} className="step-block">
              <StepCard
                index={i}
                step={s}
                guideId={id}
                onVoiceTranscribed={onVoiceTranscribed}
                onBlurApplied={onBlurApplied}
                suspects={suspects}
                onMaskTarget={onMaskTarget ? () => onMaskTarget(i) : undefined}
                onOpenBlur={onOpenBlur}
                displayNo={nums[i] ?? null}
                showNumber={!!showNums}
                showUrl={showUrl}
                onAttachShot={(file) => void attachShot(i, file)}
                canUp={i > 0}
                canDown={i < guide.steps.length - 1}
                editing={editMode}
                tool={tool}
                markColor={markColor}
                zoomCmd={zoomCmd}
                onChange={(patch) => updateStep(i, patch)}
                onMove={(dir) => moveStep(i, dir)}
                onRemove={() => removeStep(i)}
                onDuplicate={() => duplicateStep(i)}
                onMoveMark={(rect) => setMark(i, rect)}
                markActive={activeMark === s.id}
                onMarkActivate={(on) => setActiveMark(on ? s.id : null)}
                picked={isPicked(sel, s.id)}
                onPick={(e) => pickStep(s.id, e.shiftKey)}
                dragging={dragFrom === i}
                onDragStart={(e) => {
                  setDragFrom(i)
                  // فَيرفُكس لا يبدأ سحبًا أصلًا ما لم يحمل `dataTransfer` بيانات —
                  // الفهرس نصًّا يكفي، ومصدر الحقيقة يبقى `dragFrom` في الحالة.
                  e.dataTransfer.effectAllowed = 'move'
                  e.dataTransfer.setData('text/plain', String(i))
                }}
                onDragOver={(e) => {
                  // منع الافتراضي شرط قبول الإفلات في HTML5 — بدونه لا يقع إفلات أصلًا
                  if (dragFrom === null) return
                  e.preventDefault()
                  e.dataTransfer.dropEffect = 'move'
                }}
                onDrop={(e) => {
                  e.preventDefault()
                  if (dragFrom !== null && dragFrom !== i) moveStepTo(dragFrom, i)
                  setDragFrom(null)
                }}
                onDragEnd={() => setDragFrom(null)}
              />
            </div>
          </Fragment>
          )
        })}
        {editMode && (
            <InsertStep
              label={guide.steps.length ? t('editor.insertAtEnd') : t('editor.addStepsShort')}
              insertAt={guide.steps.length}
              onInsert={insertBlock}
            />
        )}
    </>
  )
}
