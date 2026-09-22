import type { StepDto } from '@dalili/shared'
import { t } from '../../i18n'
import { StepImage } from '../../components/StepImage'

/**
 * BKL-07: صورة داخل أي كتلة — نص أو تنبيه أو تحذير أو كتلة صورة (طلب المالك 2026-09-07).
 * لا حقل جديد في النموذج: `step.screenshot` قائم في العقد لكل خطوة، فالإضافة سلوكٌ لا مخزون.
 */
export function BlockMedia({
  step,
  editing,
  onAttachShot,
  onRemoveShot,
  /** كتلة الصورة نفسها تعرض زر الإضافة كبيرًا؛ النص والتنبيه يعرضانه صغيرًا جانبًا */
  variant = 'inline',
}: {
  step: StepDto
  editing: boolean
  onAttachShot: (file: File) => void
  onRemoveShot: () => void
  variant?: 'inline' | 'block'
}) {
  const shot = step.screenshot && !('missing' in step.screenshot) ? step.screenshot : null

  if (!shot) {
    if (!editing) return null
    return (
      <label className={variant === 'block' ? 'block-image-add' : 'block-image-add block-image-add-sm'}>
        <span aria-hidden>▣</span> {t('block.addImage')}
        <input
          type="file"
          accept="image/png,image/jpeg,image/webp"
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) onAttachShot(f)
            e.target.value = ''
          }}
        />
      </label>
    )
  }

  return (
    <figure className="block-image">
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
      {editing && (
        <button type="button" className="block-image-remove no-print" onClick={onRemoveShot}>
          {t('block.removeImage')}
        </button>
      )}
    </figure>
  )
}
