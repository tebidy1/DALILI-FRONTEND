import type { GuideDto, StepDto } from '@dalili/shared'
import { DEFAULT_MARK_COLOR } from '@dalili/core'
import { StepImage } from './StepImage'
import { arDigits } from '../lib/format'

function shotOf(s: StepDto) {
  return s.screenshot && !('missing' in s.screenshot) ? s.screenshot : null
}

/**
 * لون موحّد لأرقام الدليل: لون أول علامة هدف في الدليل (فتتّسق شارة الركن مع بقية
 * الشارات)، وإلا لون العلامة الافتراضي حين لا هدف في الدليل كلّه.
 */
export function guideMarkColor(steps: StepDto[]): string {
  for (const s of steps) {
    const shot = shotOf(s)
    if (shot?.mark?.color) return shot.mark.color
  }
  return DEFAULT_MARK_COLOR
}

/**
 * BKL-03: خطوات دليل مفرود داخل الكرّاسة — **بترقيم دليلها** لا ترقيم الكرّاسة.
 * مصدر واحد للعارض والمحرر كي لا يفترق ما يراه المؤلف عمّا يراه القارئ.
 */
export function EmbeddedSteps({ guide }: { guide: GuideDto }) {
  const markColor = guideMarkColor(guide.steps)
  return (
    <div className="booklet-embed-steps">
      {guide.steps.map((s, i) => (
        <EmbeddedStep key={s.id} step={s} no={i + 1} color={markColor} />
      ))}
    </div>
  )
}

function EmbeddedStep({ step, no, color }: { step: StepDto; no: number; color: string }) {
  const shot = shotOf(step)
  return (
    <div className="booklet-embed-step">
      <h3 dir="rtl">
        <bdi>
          {arDigits(no)}. {step.title}
        </bdi>
      </h3>
      {shot && (
        <StepImage
          src={shot.fileUrl ?? `/files/${shot.fileId}`}
          blurRects={shot.blurRects}
          crop={shot.crop}
          mode="view"
          annotations={shot.annotations}
          mark={shot.mark}
          autoNumber={no}
          color={color}
          alt={step.alt ?? step.title}
          lazy
        />
      )}
    </div>
  )
}
