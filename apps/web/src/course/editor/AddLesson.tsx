import { useState } from 'react'
import { newLessonStep } from '@dalili/core'
import type { StepDto } from '@dalili/shared'
import { t } from '../../i18n'
import { EmbedPicker } from '../../editor/EmbedPicker'
import { VideoBlock } from '../../components/VideoBlock'

/**
 * د١ب: «أضف درساً» — ثلاثة أنواع: دليل من المكتبة (عنوان الدرس عنوانه افتراضياً)، وفيديو برابطه
 * (يُعاين قبل الإضافة)، وصفحة تُكتب كتلها في مكانها.
 */
export function AddLesson({ onAdd }: { onAdd: (lesson: StepDto) => void }) {
  const [mode, setMode] = useState<'closed' | 'menu' | 'guide' | 'video'>('closed')
  const [url, setUrl] = useState('')
  const [title, setTitle] = useState('')

  const add = (lesson: StepDto) => {
    onAdd(lesson)
    setMode('closed')
    setUrl('')
    setTitle('')
  }

  return (
    <div className="add-lesson no-print">
      <button type="button" className="btn ghost add-lesson-btn" aria-expanded={mode !== 'closed'} onClick={() => setMode((m) => (m === 'closed' ? 'menu' : 'closed'))}>
        <span aria-hidden>+ </span>
        {t('course.addLesson')}
      </button>
      {mode === 'menu' && (
        <div className="add-lesson-menu" role="group">
          <button type="button" className="btn ghost" onClick={() => setMode('guide')}><span aria-hidden>⧉ </span>{t('course.typeGuide')}</button>
          <button type="button" className="btn ghost" onClick={() => setMode('video')}><span aria-hidden>▶ </span>{t('course.typeVideo')}</button>
          <button type="button" className="btn ghost" onClick={() => add(newLessonStep({ type: 'page', title: t('course.typePage') }) as StepDto)}>
            <span aria-hidden>¶ </span>
            {t('course.typePage')}
          </button>
        </div>
      )}
      {mode === 'guide' && (
        <EmbedPicker
          onPick={(guideId, guideTitle) => add(newLessonStep({ type: 'guide', title: guideTitle, guideId }) as StepDto)}
          onClose={() => setMode('closed')}
        />
      )}
      {mode === 'video' && (
        <div className="add-lesson-video">
          <input type="url" dir="ltr" aria-label={t('block.videoUrl')} placeholder={t('block.videoUrl')} value={url} onChange={(e) => setUrl(e.target.value)} />
          <input type="text" aria-label={t('course.lessonTitle')} placeholder={t('course.lessonTitle')} value={title} onChange={(e) => setTitle(e.target.value)} />
          {url.trim() && <VideoBlock url={url.trim()} title={title} />}
          <button
            type="button"
            className="btn"
            disabled={!url.trim()}
            onClick={() => add(newLessonStep({ type: 'video', title: title.trim() || t('course.typeVideo'), video: { url: url.trim() } }) as StepDto)}
          >
            {t('course.addThis')}
          </button>
        </div>
      )}
    </div>
  )
}
