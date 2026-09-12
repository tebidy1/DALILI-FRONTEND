import { bookletOutline, richToHtml } from '@dalili/core'
import type { GuideDto, StepDto } from '@dalili/shared'
import { t } from '../i18n'
import { StepImage } from '../components/StepImage'
import { EmbeddedSteps } from '../components/EmbeddedSteps'
import { VideoBlock } from '../components/VideoBlock'
import { BookletOutline } from '../components/BookletOutline'
import { calloutRich } from '../editor/blocks/callout'
import { EmbedBlock } from '../editor/blocks/EmbedBlock'

function shotOf(s: StepDto) {
  return s.screenshot && !('missing' in s.screenshot) ? s.screenshot : null
}

/**
 * BKL-01: عارض الكرّاسة. الكتل كلها بلا ترقيم (الكرّاسة ليست سلسلة خطوات)،
 * والدليل المضمّن يظهر بطاقةً بزرّي «اقرأ» و«دربني» أو مفرودًا بقرار المؤلف.
 */
export function ViewerBooklet({
  guide,
  embeds,
}: {
  guide: GuideDto
  embeds: Record<string, GuideDto>
}) {
  if (guide.steps.length === 0) {
    return <p className="booklet-empty">{t('booklet.empty')}</p>
  }

  // بلا فهرس (لا كتل عنوان) لا يُحجز عمود جانبي — العمود يملأ عرض الدليل ويتوسّط،
  // وإلا سقط المتن في عمود الفهرس الضيّق فتكسّرت الكلمة على سطر (بلاغ المالك 2026-09-10)
  const hasIndex = bookletOutline(guide.steps).length > 0
  return (
    <div className={`booklet-view booklet-doc${hasIndex ? ' has-index' : ''}`}>
      <BookletOutline steps={guide.steps} />
      <div className="booklet-body">
        {guide.steps.map((s) => (
          <ViewerBookletBlock key={s.id} step={s} embeds={embeds} />
        ))}
      </div>
    </div>
  )
}

function ViewerBookletBlock({ step, embeds }: { step: StepDto; embeds: Record<string, GuideDto> }) {
  switch (step.block) {
    case 'header':
      return (
        <h2 id={step.id} className="viewer-section" dir="rtl">
          <bdi>{step.title}</bdi>
        </h2>
      )

    case 'text':
      // آمن: richToHtml من النواة تهرّب كل نص وتفحص كل رابط — لا HTML من المستخدم يبلغها
      return (
        <div className="text-block">
          <div className="viewer-rich" dir="rtl" dangerouslySetInnerHTML={{ __html: richToHtml(step.rich ?? []) }} />
          <BlockShot step={step} />
        </div>
      )

    case 'video':
      return <VideoBlock url={step.url} title={step.title} />

    case 'divider':
      return <hr className="booklet-divider" />

    case 'link':
      return (
        <p className="booklet-link-row" dir="rtl">
          <a href={step.url} rel="noopener noreferrer nofollow" target="_blank">
            <bdi>{step.title || step.url}</bdi>
          </a>
        </p>
      )

    case 'image':
      return <BlockShot step={step} />

    case 'embed': {
      const gid = step.embed?.guideId ?? ''
      const g = embeds[gid]
      return (
        <EmbedBlock
          title={g?.title ?? step.title}
          stepCount={g?.steps.length ?? 0}
          expanded={!!step.embed?.expanded && !!g}
          missing={!g}
          missingText={t('booklet.embedUnavailable')}
          openHref={g ? `#${gid}` : undefined}
          onToggle={() => {}}
        >
          {g && <EmbeddedSteps guide={g} />}
        </EmbedBlock>
      )
    }

    // BKL-07: التنبيه جملةٌ بشعار في بدايتها — والكتل القديمة تُقرأ بالعنوان والملاحظة
    case 'tip':
    case 'alert':
      return (
        <aside className={`callout callout-${step.block}`}>
          <span className="callout-glyph" aria-hidden>
            {step.block === 'tip' ? '✦' : '!'}
          </span>
          <div className="callout-body">
            <div
              className="viewer-rich"
              dir="rtl"
              dangerouslySetInnerHTML={{ __html: richToHtml(calloutRich(step)) }}
            />
            <BlockShot step={step} />
          </div>
        </aside>
      )

    default:
      return null
  }
}

/** صورة كتلة إن وُجدت — النص والتنبيه والتحذير وكتلة الصورة تشترك فيها (BKL-07) */
function BlockShot({ step }: { step: StepDto }) {
  const shot = shotOf(step)
  if (!shot) return null
  return (
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
  )
}
