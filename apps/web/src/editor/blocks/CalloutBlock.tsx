import type { StepDto } from '@dalili/shared'
import { richToHtml } from '@dalili/core'
import { t } from '../../i18n'
import { RichTextBlock } from './RichTextBlock'
import { BlockMedia } from './BlockMedia'
import { calloutRich } from './callout'

/** شعار الكتلة — محرف واحد بلا صورة، يطابق رمز القائمة كي يتعرّفه المؤلف فورًا */
const GLYPH = { tip: '✦', alert: '!' } as const

/**
 * BKL-07: التنبيه/التحذير **جملةٌ بشعار في بدايتها** لا حقلَي عنوان وملاحظة
 * (طلب المالك 2026-09-07). ولها صورة اختيارية كبقية الكتل.
 */
export function CalloutBlock({
  step,
  kind,
  editing,
  onPatch,
  onAttachShot,
}: {
  step: StepDto
  kind: 'tip' | 'alert'
  editing: boolean
  onPatch: (patch: Partial<StepDto>) => void
  onAttachShot: (file: File) => void
}) {
  const rich = calloutRich(step)
  return (
    <aside className={`callout callout-${kind}`}>
      <span className="callout-glyph" aria-hidden>
        {GLYPH[kind]}
      </span>
      <div className="callout-body">
        {editing ? (
          <RichTextBlock
            value={rich}
            placeholder={kind === 'tip' ? t('block.tipBody') : t('block.alertBody')}
            onChange={(next) => onPatch({ rich: next })}
          />
        ) : (
          // آمن: richToHtml تهرّب كل نص وتفحص كل رابط — لا HTML من المستخدم يبلغها
          <div className="viewer-rich" dir="rtl" dangerouslySetInnerHTML={{ __html: richToHtml(rich) }} />
        )}
        <BlockMedia
          step={step}
          editing={editing}
          onAttachShot={onAttachShot}
          onRemoveShot={() => onPatch({ screenshot: undefined })}
        />
      </div>
    </aside>
  )
}
