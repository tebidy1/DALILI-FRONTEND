import { useEffect, useRef, useState } from 'react'
import type { Annotation, MarkColor, Rect, Step } from '@dalili/core'
import { StepImage } from '../components/StepImage'
import { StepVoiceBadge } from './StepVoiceBadge'
import { focusViewport, zoomAround, type Viewport } from '../editor/focus'
import { annotationToolOf, toolDef, toolToMode, type EditorTool } from '../editor/tools'
import type { Suspect, SuspectKind } from '../editor/suspects'
import { IconArrowUp, IconArrowDown, IconCopy, IconExternalLink, IconGrip, IconPlus, IconTrash } from '../ui/icons'
import { shotOf } from '../lib/format'
import { t, type TKey } from '../i18n'

/** TAM-01: نوع الشك → مفتاح اسمه بالعربية في الشارة */
const SUSPECT_KIND_KEY: Record<SuspectKind, TKey> = {
  iban: 'editor.autoMask.iban',
  nid: 'editor.autoMask.nid',
  phone: 'editor.autoMask.phone',
  email: 'editor.autoMask.email',
}

/** أمر منظار قادم من عمود الأدوات — `seq` وحده يميّز نقرة عن أختها */
export interface ZoomCommand {
  kind: 'in' | 'out' | 'fit'
  seq: number
}

interface Props {
  index: number
  step: Step
  /** VOX-09: معرف الدليل لزر إعادة تفريغ التعليق الصوتي — غيابه = عرض بلا إعادة */
  guideId?: string
  /** VOX-09: بعد نجاح إعادة التفريغ يعيد الأب جلب الدليل فيظهر النص الجديد */
  onVoiceTranscribed?: () => void
  /** EDT-12: طمس يدوي تم بمقاس اللقطة — يفتح بطاقة اقتراح الطمس الذكي بالمحرر */
  onBlurApplied?: (index: number, rect: Rect, size: { w: number; h: number }) => void
  /** BLK-01: رقم العرض المُصفّى (الكتل null) — بدل index+1 كي لا تُرقَّم الكتل */
  displayNo: number | null
  /** طلب المالك 2026-09-09: مبدّل «إظهار الأرقام» من قائمة «المزيد» — شارة رقم
   *  تُرسم بعيدًا عن علامة الهدف بلونها، معاينة حيّة لا محتوى محفوظًا */
  showNumber?: boolean
  /** طلب المالك 2026-09-09: كبسولة الرابط عند أول ظهور للدومين أو تغيّره فقط —
   *  غيابها أو false يخفي الكبسولة (الخطوات التابعة لنفس النطاق) */
  showUrl?: boolean
  canUp: boolean
  canDown: boolean
  /** وضع التعديل: الأدوات والحقول تظهر. وضع العرض: قراءة نظيفة فقط */
  editing: boolean
  /**
   * S1: الأداة النشطة تأتي من المحرر لا من حالة داخلية — البطاقة صارت مكوّنًا
   * مُتحكَّمًا فيه، فاختيار «طمس» مرة واحدة في العمود يطمس في كل اللقطات.
   */
  tool: EditorTool
  /** S4: لون الحبر الموحّد (هدف + شرح) من لوحة العمود */
  markColor: MarkColor
  /** أمر التكبير/التصغير/الملاءمة من العمود — غيابه يعني «لا أمر بعد» */
  zoomCmd?: ZoomCommand | null
  onChange: (patch: Partial<Step>) => void
  onMove: (dir: -1 | 1) => void
  onRemove: () => void
  /** S6: نسخة كاملة من الخطوة تُدرج بعدها مباشرة */
  onDuplicate: () => void
  /** S3: إفلات إطار الهدف في موضع جديد (بإحداثيات الصورة الأصلية) */
  onMoveMark: (rect: Rect) => void
  /** طلب المالك 2026-09-04: هل شكل هذه اللقطة هو النشط في المحرر؟ والنقر يبدّله.
   *  الإمساك المباشر بالشكل حكرٌ على وضع التعديل — وضع القراءة لا يُلمس فيه شيء. */
  markActive?: boolean
  onMarkActivate?: (active: boolean) => void
  /** TAM-01 (2026-09-21): شكوك الطمس التلقائي لحقائق هذه الخطوة — قراءة فقط،
   *  غيابها أو فراغها = لا شريط. تظهر في وضع التعديل حصرًا. */
  suspects?: Suspect[]
  /** طمس موضع الهدف بنقرة — يدخل إطار الهدف نفسه في قائمة التمويه */
  onMaskTarget?: () => void
  /** فتح أداة الطمس ليراجع المستخدم بنفسه */
  onOpenBlur?: () => void
  /** BLK-01: رفع لقطة لخطوة يدوية — الأب يرفع الملف ويضع screenshot */
  onAttachShot: (file: File) => void
  /** S5: هذه الخطوة ضمن التحديد الجاري */
  picked: boolean
  /** نقر مربّع التحديد — الحدث كاملًا كي يقرأ المحرر `shiftKey` ويفرّع على المدى */
  onPick: (e: React.MouseEvent) => void
  /** S5: السحب — البطاقة مصدرٌ ومَقصِد في آن، والمقبض وحده هو المسموح بسحبه */
  dragging: boolean
  onDragStart: (e: React.DragEvent) => void
  onDragOver: (e: React.DragEvent) => void
  onDrop: (e: React.DragEvent) => void
  onDragEnd: () => void
}

/**
 * BLK-01: الشريط الجانبي (تحديد + مقبض) خارج البطاقة — مشترك بين الخطوة العادية
 * وكتل النداء/الهيدر كي لا يتكرّر ثلاث مرات. آخر عنصر في الصف = طرف اليسار في RTL.
 */
function StepRail({
  index,
  picked,
  onPick,
  onDragStart,
  onDragEnd,
}: {
  index: number
  picked: boolean
  onPick: (e: React.MouseEvent) => void
  onDragStart: (e: React.DragEvent) => void
  onDragEnd: () => void
}) {
  return (
    <div className="step-rail no-print">
      <input
        type="checkbox"
        className="step-pick"
        checked={picked}
        readOnly
        onClick={onPick}
        aria-label={t('editor.pickStep', { no: index + 1 })}
      />
      <button
        className="icon-btn drag-handle"
        draggable
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        title={t('editor.dragStep')}
        aria-label={t('editor.dragStep')}
      >
        <IconGrip size={16} />
      </button>
    </div>
  )
}

export function StepCard({
  index,
  step,
  guideId,
  onVoiceTranscribed,
  onBlurApplied,
  displayNo,
  showNumber,
  showUrl,
  canUp,
  canDown,
  editing,
  tool,
  markColor,
  markActive,
  onMarkActivate,
  suspects,
  onMaskTarget,
  onOpenBlur,
  zoomCmd,
  onChange,
  onMove,
  onRemove,
  onDuplicate,
  onMoveMark,
  onAttachShot,
  picked,
  onPick,
  dragging,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
}: Props) {
  const [viewport, setViewport] = useState<Viewport | null>(null)
  const figRef = useRef<HTMLDivElement>(null)
  // طلب المالك 2026-09-09: حقل واحد لعنوان الخطوة يتمدد بنفسه مع النص
  const titleRef = useRef<HTMLTextAreaElement>(null)
  const shot = shotOf(step)
  const missing = step.screenshot && 'missing' in step.screenshot ? step.screenshot : null
  // الوضع مشتقّ من الأداة العالمية — لا `useState` هنا، فلا حالتان تتباعدان
  const mode = editing ? toolToMode(tool) : 'view'
  const drawing = mode !== 'view'
  const annotations = shot?.annotations ?? []
  /** دليل قديم: لقطة بلا `mark` — إطارها مخبوز في البكسل فلا يقبل التحريك */
  const legacyMark = editing && tool === 'move-target' && !!shot && !shot.mark

  /**
   * S7: أمر المنظار من العمود. القياسات تُقرأ من DOM البطاقة لأن أبعاد
   * الصندوق واللوحة تعيش هنا لا في المحرر، والحساب نفسه يبقى في `focus.ts`
   * (`zoomAround`/`focusViewport`) فلا رياضيات تكبير ثانية تتفرّع عن الأولى.
   */
  useEffect(() => {
    if (!zoomCmd || !viewport) return
    const box = figRef.current?.querySelector('.shot-viewport')
    const canvas = figRef.current?.querySelector('canvas')
    if (!box || !canvas) return
    const r = box.getBoundingClientRect()
    if (r.width === 0 || r.height === 0) return
    const iw = canvas.width
    const ih = canvas.height
    // «الإعادة للطبيعي» ترجع للمنظر الافتتاحي: مبؤّرًا على الهدف إن وُجدت علامة
    // (بإحداثيات اللوحة بعد القص)، وإلا ملء العرض — نفس منطق أول تحميل للقطة.
    const markRect = shot?.mark
      ? {
          x: shot.mark.rect.x - (shot.crop?.x ?? 0),
          y: shot.mark.rect.y - (shot.crop?.y ?? 0),
          w: shot.mark.rect.w,
          h: shot.mark.rect.h,
        }
      : undefined
    setViewport(
      zoomCmd.kind === 'fit'
        ? focusViewport(markRect, iw, ih, r.width, r.height)
        : zoomAround(viewport, zoomCmd.kind === 'in' ? 1.25 : 1 / 1.25, r.width, r.height, iw, ih),
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps -- الأمر يُنفَّذ مرة لكل نقرة (seq)
  }, [zoomCmd?.seq])

  // الحقل الواحد يتمدد مع النص — يقيس المحتوى ويضبط ارتفاعه بلا شريط تمرير
  useEffect(() => {
    const el = titleRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [step.title, step.note, editing])

  function setBlurRects(rects: Rect[]) {
    if (!shot) return
    onChange({ screenshot: { ...shot, blurRects: rects } })
  }

  function setAnnotations(next: Annotation[]) {
    if (!shot) return
    onChange({ screenshot: { ...shot, annotations: next.length ? next : undefined } })
  }

  /** تلميح الأداة النشطة — نصّه من `TOOL_GROUPS` فلا يتفرّع عن تعريف الأداة */
  function drawHint(): string {
    const def = toolDef(tool)
    if (!def) return ''
    return def.hintKey === 'editor.annDrawHint'
      ? t('editor.annDrawHint', { tool: t(def.key) })
      : t(def.hintKey)
  }

  // BLK-01: الهيدر — عنوان قسم، بلا رقم ولا لقطة
  if (step.block === 'header') {
    return (
      <div
        className={`step-card-row${dragging ? ' dragging' : ''}`}
        onDragOver={editing ? onDragOver : undefined}
        onDrop={editing ? onDrop : undefined}
      >
        {editing && <StepRail index={index} picked={picked} onPick={onPick} onDragStart={onDragStart} onDragEnd={onDragEnd} />}
        <div className="card step-body block-card header">
          {editing ? (
            <input
              className="block-header-input"
              dir="rtl"
              value={step.title}
              onChange={(e) => onChange({ title: e.target.value })}
              placeholder={t('block.headerPlaceholder')}
              aria-label={t('block.headerPlaceholder')}
            />
          ) : (
            <h2 className="block-header-read" dir="rtl">
              <bdi>{step.title}</bdi>
            </h2>
          )}
        </div>
      </div>
    )
  }

  // BLK-01: التنبيه/التحذير — بطاقة نداء ملوّنة نصّية (سماوي/برتقالي)، بلا رقم ولا لقطة
  if (step.block === 'tip' || step.block === 'alert') {
    const bodyPlaceholder = step.block === 'tip' ? t('block.tipBody') : t('block.alertBody')
    return (
      <div
        className={`step-card-row${dragging ? ' dragging' : ''}`}
        onDragOver={editing ? onDragOver : undefined}
        onDrop={editing ? onDrop : undefined}
      >
        {editing && <StepRail index={index} picked={picked} onPick={onPick} onDragStart={onDragStart} onDragEnd={onDragEnd} />}
        <div className={`card step-body block-card ${step.block}`}>
          {editing ? (
            <>
              <input
                className="block-label-input"
                dir="rtl"
                value={step.title}
                onChange={(e) => onChange({ title: e.target.value })}
                aria-label={t('editor.stepTitleLabel', { no: index + 1 })}
              />
              <textarea
                className="block-body-input"
                dir="rtl"
                rows={2}
                value={step.note ?? ''}
                onChange={(e) => onChange({ note: e.target.value || undefined })}
                placeholder={bodyPlaceholder}
              />
            </>
          ) : (
            <>
              <strong dir="rtl">
                <bdi>{step.title}</bdi>
              </strong>
              {step.note && (
                <p dir="auto">
                  <bdi>{step.note}</bdi>
                </p>
              )}
            </>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className={`step-card-row${dragging ? ' dragging' : ''}`}>
      {/*
        مربّع التحديد ومقبض السحب على اليمين (أول عنصر في الصف في RTL)
      */}
      {editing && <StepRail index={index} picked={picked} onPick={onPick} onDragStart={onDragStart} onDragEnd={onDragEnd} />}
      <div
        className={`card step-card${drawing ? ' is-drawing' : ''}${picked ? ' picked' : ''}${dragging ? ' dragging' : ''}`}
        /* البطاقة كلها مَقصِد إفلات — هدف أوسع من المقبض وحده فلا يُفلت السحب في الفراغ */
        onDragOver={editing ? onDragOver : undefined}
        onDrop={editing ? onDrop : undefined}
      >
      <div className="step-head">
        {/* طلب المالك: الرقم والعنوان أولًا فيلتصقان بيمين الشاشة (RTL) — رقم مُصفّى */}
        <div className="step-num">{displayNo}</div>
        {editing ? (
          /* طلب المالك 2026-09-09 (تصحيح): حقل واحد فقط لعنوان الخطوة — السطر الأول
             هو العنوان وما بعده ملاحظة تُقرأ تحت الخطوة في العرض، والحقل يتمدد بنفسه */
          <div className="step-title-field">
            <textarea
              ref={titleRef}
              className="step-title-input"
              dir="rtl"
              rows={1}
              value={step.note ? `${step.title}\n${step.note}` : step.title}
              onChange={(e) => {
                const v = e.target.value
                const nl = v.indexOf('\n')
                if (nl === -1) onChange({ title: v, note: undefined })
                else onChange({ title: v.slice(0, nl), note: v.slice(nl + 1) || undefined })
              }}
              placeholder={t('editor.stepTitlePlaceholder')}
              aria-label={t('editor.stepTitleLabel', { no: index + 1 })}
            />
          </div>
        ) : (
          <h2 className="step-title-read" dir="auto">
            <bdi>{step.title}</bdi>
          </h2>
        )}

        {step.url && showUrl !== false && (
          <a
            href={step.url}
            target="_blank"
            rel="noopener noreferrer"
            className="step-url-pill no-print"
            title={step.url}
          >
            <span className="step-url-text" dir="ltr">{step.url}</span>
            <IconExternalLink size={13} className="step-url-icon" />
          </a>
        )}

        {/* VOX-09: شارة 🎙 بجانب العنوان — النص المفرَّغ يظهر تحته لأنه صار الملاحظة */}
        {step.voice && guideId && (
          <StepVoiceBadge
            voice={step.voice}
            guideId={guideId}
            canRetry={editing}
            onTranscribed={onVoiceTranscribed}
          />
        )}

        {editing && (
          <>
            <div className="step-tools no-print">
              <button
                className="icon-btn"
                onClick={() => onMove(-1)}
                disabled={!canUp}
                title={t('editor.moveUp')}
                aria-label={t('editor.moveUp')}
              >
                <IconArrowUp size={17} />
              </button>
              <button
                className="icon-btn"
                onClick={() => onMove(1)}
                disabled={!canDown}
                title={t('editor.moveDown')}
                aria-label={t('editor.moveDown')}
              >
                <IconArrowDown size={17} />
              </button>
              {/* S6: التكرار إجراء ثانوي — يظهر عند التحويم/التركيز فلا يزاحم الحذف */}
              <button
                className="icon-btn on-hover"
                onClick={onDuplicate}
                title={t('editor.duplicateStep')}
                aria-label={t('editor.duplicateStep')}
              >
                <IconCopy size={17} />
              </button>
              {/* S6: الحذف ظاهر دائمًا بنقرة واحدة — لا يُدفن في قائمة ⋯ */}
              <button
                className="icon-btn danger"
                onClick={onRemove}
                title={t('editor.removeStep')}
                aria-label={t('editor.removeStep')}
              >
                <IconTrash size={17} />
              </button>
            </div>
          </>
        )}
      </div>

      {/* بلاغ المالك 2026-09-04: نص التفريغ يُقرأ مباشرة بعد العنوان لا أسفل البطاقة —
          وفي التعديل صار داخل إطار العنوان نفسه فوق */}
      {!editing && step.note && (
        <p className="muted step-note-read" dir="auto">
          <bdi>{step.note}</bdi>
        </p>
      )}

      {shot ? (
        <div className="step-figure" ref={figRef}>
          {/* TAM-01: شريط الطمس التلقائي — شكوك قراءة فقط وأزرار قرار المستخدم */}
          {editing && suspects && suspects.length > 0 && (
            <div className="automask-strip" role="note">
              <span className="automask-kinds">
                {t('editor.autoMask.badge')} —{' '}
                {suspects.map((su) => t(SUSPECT_KIND_KEY[su.kind])).join(' · ')}
              </span>
              <span className="automask-actions">
                {onMaskTarget && shot.mark && (
                  <button type="button" className="automask-btn" onClick={onMaskTarget}>
                    {t('editor.autoMask.maskTarget')}
                  </button>
                )}
                {onOpenBlur && (
                  <button type="button" className="automask-btn ghost" onClick={onOpenBlur}>
                    {t('editor.autoMask.review')}
                  </button>
                )}
              </span>
            </div>
          )}
          <StepImage
            src={shot.fileUrl ?? `/files/${shot.fileId}`}
            blurRects={shot.blurRects}
            crop={shot.crop}
            annotations={shot.annotations}
            mark={shot.mark}
            autoNumber={showNumber ? displayNo ?? undefined : undefined}
            mode={mode}
            tool={annotationToolOf(tool)}
            color={markColor}
            viewport={viewport ?? undefined}
            onViewportChange={setViewport}
            alt={step.alt ?? step.title}
            onAddRect={(r) => setBlurRects([...shot.blurRects, r])}
            onBlurRectNatural={(r, size) => onBlurApplied?.(index, r, size)}
            onCrop={(r) => onChange({ screenshot: { ...shot, crop: r } })}
            onAddAnnotation={(a) => setAnnotations([...annotations, a])}
            onMoveAnnotation={(id, rect) =>
              setAnnotations(annotations.map((a) => (a.id === id ? { ...a, rect } : a)))
            }
            onMoveMark={editing ? onMoveMark : undefined}
            markActive={markActive}
            onMarkActivate={onMarkActivate}
          />
          {editing && (
            <>
              {/*
                أدوات الاختيار كلها انتقلت إلى عمود الأدوات (S1/S2).
                يبقى هنا **التنظيف السياقي** وحده: أزرار لا تظهر إلا حين يوجد
                فعلًا ما تمسحه في هذه اللقطة بعينها — لا معنى لرفعها إلى عمود
                عالمي لأنها تخصّ محتوى بطاقة واحدة.
              */}
              {(shot.crop || shot.blurRects.length > 0 || annotations.length > 0) && (
                <div className="shot-cleanup no-print">
                  {shot.crop && (
                    <button
                      className="icon-btn wide"
                      onClick={() => onChange({ screenshot: { ...shot, crop: undefined } })}
                      title={t('editor.removeCrop')}
                      aria-label={t('editor.removeCrop')}
                    >
                      <span>{t('editor.removeCrop')}</span>
                    </button>
                  )}
                  {shot.blurRects.length > 0 && (
                    <button
                      className="icon-btn wide"
                      onClick={() => setBlurRects([])}
                      title={t('editor.clearBlurs')}
                      aria-label={t('editor.clearBlurs')}
                    >
                      <span>{t('editor.clearBlurs')}</span>
                    </button>
                  )}
                  {annotations.length > 0 && (
                    <button
                      className="icon-btn wide"
                      onClick={() => setAnnotations([])}
                      title={t('editor.clearAnnotations')}
                      aria-label={t('editor.clearAnnotations')}
                    >
                      <span>{t('editor.clearAnnotations')}</span>
                    </button>
                  )}
                </div>
              )}

              {/*
                لقطة قديمة: إطارها محروق في البكسل و`mark` غائب ⇒ لا شيء
                يُحرَّك. نقولها صراحةً بدل تلميح «اسحب الهدف» الكاذب — الأداة
                لا تصمت ولا تدّعي نجاحًا.
              */}
              {legacyMark ? (
                <span className="draw-hint muted">{t('editor.markLegacy')}</span>
              ) : (
                drawing && <span className="draw-hint">{drawHint()}</span>
              )}
            </>
          )}
        </div>
      ) : editing && !missing ? (
        /* BLK-01: خطوة يدوية بلا لقطة — زر رفع (بعده تعمل الريشة كأي لقطة) */
        <label className="attach-shot icon-btn wide">
          <input
            type="file"
            accept="image/*"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) onAttachShot(f)
              e.currentTarget.value = ''
            }}
          />
          <IconPlus size={16} />
          <span>{t('editor.addShot')}</span>
        </label>
      ) : (
        <div className="missing-shot">{missing?.reason ?? t('editor.noShot')}</div>
      )}

      {editing && (
        <details className="step-details no-print">
          <summary>{t('editor.stepDetails')}</summary>
          <div className="step-details-body">
            {/* EDT-13: نص بديل للقطة — وصولية حقيقية لقارئات الشاشة، يُصدَّر مع HTML ويعرض في العارض */}
            <input
              type="text"
              className="alt-input"
              dir="rtl"
              aria-label={t('editor.altLabel')}
              placeholder={t('editor.altLabel')}
              value={step.alt ?? ''}
              onChange={(e) => onChange({ alt: e.target.value || undefined })}
            />
            {shot && shot.autoBlurred && <span className="chip">{t('editor.autoBlurredChip')}</span>}
            {shot && shot.blurRects.length > 0 && (
              <div className="rect-list">
                {shot.blurRects.map((_, i) => (
                  <button
                    key={i}
                    className="chip"
                    onClick={() => setBlurRects(shot.blurRects.filter((_, j) => j !== i))}
                    title={t('editor.removeBlurTitle')}
                  >
                    {t('editor.blurChipN', { i: i + 1 })}
                  </button>
                ))}
              </div>
            )}
            {step.sensitive && <div className="chip">{t('editor.sensitiveChip')}</div>}
            <div className="muted step-source">
              <bdi>{step.pageTitle}</bdi> — <span dir="ltr">{step.url}</span>
            </div>
          </div>
        </details>
      )}
      </div>
    </div>
  )
}
