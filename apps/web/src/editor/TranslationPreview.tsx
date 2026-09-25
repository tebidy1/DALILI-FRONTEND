import type { GuideDto, TranslationOverlay } from '@dalili/shared'

/**
 * TRNS-01: معاينة الترجمة الإنجليزية — قراءة فقط، لا تلمس آلية التحرير إطلاقًا.
 * حاوية LTR، نصوص التراكب مع سقوط لكل حقل نحو العربية، والصور كما هي بإحداثياتها.
 */
export function TranslationPreview({ guide, ov, nums }: {
  guide: GuideDto
  ov: TranslationOverlay
  nums: Array<number | null>
}) {
  return (
    <div className="translate-preview" dir="ltr">
      <h2 className="tp-title">{ov.guideTitle}</h2>
      {ov.description && <p className="tp-desc">{ov.description}</p>}
      {guide.steps.map((s, i) => (
        <div className="tp-step" key={s.id}>
          <h4>
            <span className="tp-num">{nums[i] != null ? `${nums[i]}.` : ''}</span>
            <span>{ov.stepText(s.id, 'title', s.title)}</span>
          </h4>
          {s.note && <p className="tp-note">{ov.stepText(s.id, 'note', s.note)}</p>}
          {s.screenshot && !('missing' in s.screenshot) && (
            <img
              src={s.screenshot.fileUrl ?? `/files/${s.screenshot.fileId}`}
              alt={ov.stepText(s.id, 'alt', s.alt ?? '')}
              loading="lazy"
            />
          )}
        </div>
      ))}
    </div>
  )
}
