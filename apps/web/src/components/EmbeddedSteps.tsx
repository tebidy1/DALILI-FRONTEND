import type { GuideDto, StepDto } from '@dalili/shared'
import { StepImage } from './StepImage'
import { arDigits } from '../lib/format'

function shotOf(s: StepDto) {
  return s.screenshot && !('missing' in s.screenshot) ? s.screenshot : null
}

/**
 * BKL-03: خطوات دليل مفرود داخل الكرّاسة — **بترقيم دليلها** لا ترقيم الكرّاسة.
 * مصدر واحد للعارض والمحرر كي لا يفترق ما يراه المؤلف عمّا يراه القارئ.
 */
export function EmbeddedSteps({ guide }: { guide: GuideDto }) {
  return (
    <div className="booklet-embed-steps">
      {guide.steps.map((s, i) => (
        <EmbeddedStep key={s.id} step={s} no={i + 1} />
      ))}
    </div>
  )
}

function EmbeddedStep({ step, no }: { step: StepDto; no: number }) {
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
          alt={step.alt ?? step.title}
          lazy
        />
      )}
    </div>
  )
}
