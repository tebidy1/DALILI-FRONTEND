import type { GuideDto, StepDto } from '@dalili/shared'
import { richToHtml } from '@dalili/core'
import { t } from '../../i18n'
import { EmbeddedSteps } from '../../components/EmbeddedSteps'
import { VideoBlock } from '../../components/VideoBlock'
import { RichTextBlock } from './RichTextBlock'
import { EmbedBlock } from './EmbedBlock'
import { CalloutBlock } from './CalloutBlock'
import { BlockMedia } from './BlockMedia'

export interface EmbedMeta {
  title: string
  stepCount: number
  thumbFileId?: string
  /** في السلة — حالة ثالثة بين «موجود» و«غير موجود»، ولها رسالتها */
  trashed?: boolean
}

/** BKL-01: جسم كتلة واحدة في محرر الكرّاسة — مفصول عن القائمة (قانون الحجم §5.7) */
export function BlockBody({
  step,
  editing,
  meta,
  embedGuide,
  missing,
  onPatch,
  onAttachShot,
}: {
  step: StepDto
  editing: boolean
  meta?: EmbedMeta
  /** الدليل المضمّن كاملًا — كي يفتح «افرد الخطوات» محتواه فعلًا لا بطاقةً صامتة */
  embedGuide?: GuideDto
  /** الغياب حقيقة يقولها الخادم (٤٠٤) لا استنتاج من قائمة ناقصة */
  missing: boolean
  onPatch: (patch: Partial<StepDto>) => void
  onAttachShot: (file: File) => void
}) {
  const media = (variant: 'inline' | 'block' = 'inline') => (
    <BlockMedia
      step={step}
      editing={editing}
      variant={variant}
      onAttachShot={onAttachShot}
      onRemoveShot={() => onPatch({ screenshot: undefined })}
    />
  )

  switch (step.block) {
    case 'text':
      return (
        <div className="text-block">
          {editing ? (
            <RichTextBlock
              value={step.rich ?? []}
              placeholder={t('block.textBody')}
              onChange={(rich) => onPatch({ rich })}
            />
          ) : (
            // وضع العرض: نصّ مقروء بلا شريط ولا منطقة تحرير — الشريط الميت يوهم بلا أثر
            // (بلاغ المالك 2026-09-07). آمن: richToHtml تهرّب كل نص وتفحص كل رابط.
            <div className="viewer-rich" dir="rtl" dangerouslySetInnerHTML={{ __html: richToHtml(step.rich ?? []) }} />
          )}
          {media()}
        </div>
      )

    case 'divider':
      return <hr className="booklet-divider" />

    case 'header':
      return editing ? (
        <input
          className="booklet-header-input field"
          dir="rtl"
          placeholder={t('block.headerPlaceholder')}
          aria-label={t('block.headerText')}
          value={step.title}
          onChange={(e) => onPatch({ title: e.target.value })}
        />
      ) : (
        <h2 className="booklet-header">{step.title}</h2>
      )

    case 'tip':
    case 'alert':
      return (
        <CalloutBlock
          step={step}
          kind={step.block}
          editing={editing}
          onPatch={onPatch}
          onAttachShot={onAttachShot}
        />
      )

    case 'video':
      return editing ? (
        <div className="video-edit">
          <input
            className="field"
            dir="ltr"
            aria-label={t('block.videoUrl')}
            placeholder="https://youtu.be/…"
            value={step.url}
            onChange={(e) => onPatch({ url: e.target.value })}
          />
          <input
            className="field"
            dir="rtl"
            aria-label={t('block.videoTitle')}
            placeholder={t('block.videoTitle')}
            value={step.title}
            onChange={(e) => onPatch({ title: e.target.value })}
          />
          <VideoBlock url={step.url} title={step.title} />
        </div>
      ) : (
        <VideoBlock url={step.url} title={step.title} />
      )

    case 'link':
      return editing ? (
        <div className="booklet-link-edit">
          <input
            className="field"
            dir="rtl"
            aria-label={t('editor.addLink')}
            placeholder={t('editor.addLink')}
            value={step.title}
            onChange={(e) => onPatch({ title: e.target.value })}
          />
          <input
            className="field"
            dir="ltr"
            aria-label={t('editor.linkUrl')}
            placeholder="https://"
            value={step.url}
            onChange={(e) => onPatch({ url: e.target.value })}
          />
        </div>
      ) : (
        <a className="booklet-link" href={step.url} rel="noopener noreferrer nofollow" target="_blank">
          {step.title || step.url}
        </a>
      )

    case 'image':
      return media('block')

    case 'embed': {
      const gid = step.embed?.guideId ?? ''
      return (
        <EmbedBlock
          title={meta?.title ?? step.title}
          stepCount={meta?.stepCount}
          thumbFileId={meta?.thumbFileId}
          expanded={step.embed?.expanded ?? false}
          missing={missing || !!meta?.trashed}
          missingText={meta?.trashed ? t('editor.embedTrashed') : undefined}
          openHref={gid ? `/g/${gid}` : undefined}
          onToggle={() => onPatch({ embed: { guideId: gid, expanded: !(step.embed?.expanded ?? false) } })}
        >
          {embedGuide && <EmbeddedSteps guide={embedGuide} />}
        </EmbedBlock>
      )
    }

    default:
      return null
  }
}
