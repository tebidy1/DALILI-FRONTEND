import { useEffect, useMemo, useState } from 'react'
import type { GuideDto, StepDto } from '@dalili/shared'
import { client } from '../api'
import { t } from '../i18n'
import { InsertStep, type InsertKind } from '../components/InsertStep'
import { BookletOutline } from '../components/BookletOutline'
import { BlockBody, type EmbedMeta } from './blocks/BookletBlock'

/** بطاقة الدليل المضمّن من الدليل نفسه — المصغّرة من أول لقطة صالحة */
function metaOf(guide: GuideDto, deletedAt?: string): EmbedMeta {
  const shot = guide.steps.find((s) => s.screenshot && !('missing' in s.screenshot))?.screenshot
  const thumb = shot && !('missing' in shot) ? (shot.thumbFileId ?? shot.fileId) : undefined
  return { title: guide.title, stepCount: guide.steps.length, thumbFileId: thumb, trashed: !!deletedAt }
}

/**
 * BKL-01: قائمة كتل الكرّاسة في المحرر. كل منطق الكتل هنا — `EditorPage` يوجّه فقط
 * (قانون الحجم §5.7: الملف الضخم لا يزداد).
 */
export function BookletBlockList({
  steps,
  editing,
  busy,
  onPatch,
  onRemove,
  onInsert,
  onAttachShot,
}: {
  steps: StepDto[]
  editing: boolean
  busy?: boolean
  onPatch: (index: number, patch: Partial<StepDto>) => void
  onRemove: (index: number) => void
  onInsert: (kind: InsertKind, at: number) => void
  onAttachShot: (index: number, file: File) => void
}) {
  // الدليل المضمّن كاملًا لا ملخّصه: «افرد الخطوات» يفتح محتواه في المحرر كما في العارض
  const [docs, setDocs] = useState<Record<string, { guide: GuideDto; deletedAt?: string }>>({})
  const [gone, setGone] = useState<Record<string, true>>({})

  // معرّفات الأدلة المضمّنة وحدها — مفتاح ثابت كي لا يعيد التأثير النداء بلا داعٍ
  const embedIds = useMemo(
    () =>
      Array.from(new Set(steps.filter((s) => s.block === 'embed' && s.embed?.guideId).map((s) => s.embed!.guideId)))
        .sort()
        .join(','),
    [steps],
  )

  /**
   * نسأل عن كل دليل مضمّن باسمه — لا مسحًا لقائمة (القائمة مسقوفة بمئة، وكانت
   * ٢٠٠ تُرفض ٤٠٠ فتصير كل بطاقة «٠ خطوة»: علة حية بلّغ عنها المالك).
   * والغياب يُدّعى فقط حين يقول الخادم ٤٠٤ — تعذّر الاتصال ليس حذفًا (قانون الصدق).
   */
  useEffect(() => {
    const ids = embedIds ? embedIds.split(',') : []
    if (ids.length === 0) return
    let alive = true
    // نداء واحد لكل مضمّن لكن **تحديث حالة واحد** — لا ثلاثون رسمًا متتاليًا عند السقف
    void Promise.allSettled(ids.map((id) => client.getGuide(id))).then((results) => {
      if (!alive) return
      const nextDocs: Record<string, { guide: GuideDto; deletedAt?: string }> = {}
      const nextGone: Record<string, true> = {}
      results.forEach((r, i) => {
        const id = ids[i]!
        if (r.status === 'fulfilled') nextDocs[id] = { guide: r.value.guide, deletedAt: r.value.deletedAt }
        // الغياب يُدّعى فقط حين يقول الخادم ٤٠٤ — تعذّر الاتصال ليس حذفًا (قانون الصدق)
        else if ((r.reason as { status?: number })?.status === 404) nextGone[id] = true
      })
      setDocs((d) => ({ ...d, ...nextDocs }))
      setGone(nextGone)
    })
    return () => {
      alive = false
    }
  }, [embedIds])

  return (
    // كيان مستند بعمود قراءة وفهرس — لا نموذج إدخال (طلب المالك 2026-09-07)
    <div className={`booklet-doc${editing ? ' is-editing' : ''}`}>
      {!editing && <BookletOutline steps={steps} prefix="step-" />}
      <div className="booklet-body">
      {steps.map((s, i) => (
        <div key={s.id} className="booklet-row">
          {editing && (
            <InsertStep
              label={t('editor.insertBefore', { no: i + 1 })}
              insertAt={i}
              docKind="booklet"
              onInsert={onInsert}
              busy={busy}
            />
          )}
          <div id={`step-${s.id}`} className={`booklet-block block-${s.block ?? 'step'}`}>
            <BlockBody
              step={s}
              editing={editing}
              meta={s.embed && docs[s.embed.guideId] ? metaOf(docs[s.embed.guideId]!.guide, docs[s.embed.guideId]!.deletedAt) : undefined}
              embedGuide={s.embed ? docs[s.embed.guideId]?.guide : undefined}
              missing={!!s.embed && !!gone[s.embed.guideId]}
              onPatch={(patch) => onPatch(i, patch)}
              onAttachShot={(file) => onAttachShot(i, file)}
            />
            {editing && (
              <button type="button" className="booklet-remove no-print" onClick={() => onRemove(i)}>
                {t('editor.embedRemove')}
              </button>
            )}
          </div>
        </div>
      ))}
      {editing && (
        <InsertStep
          label={steps.length ? t('editor.insertAtEnd') : t('editor.addStepsShort')}
          insertAt={steps.length}
          docKind="booklet"
          onInsert={onInsert}
          busy={busy}
        />
      )}
      </div>
    </div>
  )
}
