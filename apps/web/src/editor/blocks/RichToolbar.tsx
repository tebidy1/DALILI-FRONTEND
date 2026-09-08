import type { RichParaDto } from '@dalili/shared'
import { t } from '../../i18n'
import type { Mark } from './rich-ops'
import type { MarkState } from './RichTextBlock'

/** BKL-01: شريط التنسيق الخفيف — أزرار فقط، والمنطق كله في rich-ops (نقي مختبر) */
export function RichToolbar({
  para,
  marks,
  onMark,
  onPara,
}: {
  para: RichParaDto['para']
  /** حالة العلامة عند المؤشّر — الزر يعلن حاله فلا يبدو ميتًا (بلاغ المالك) */
  marks: MarkState
  onMark: (m: Mark) => void
  onPara: (p: RichParaDto['para']) => void
}) {
  // زر النوع يبدّل: ضغطه وهو مفعَّل يعيد الفقرة عادية (تبديل لا تكديس)
  const toggleTo = (p: RichParaDto['para']) => onPara(para === p ? 'p' : p)
  return (
    <div className="rich-toolbar no-print" role="toolbar" aria-label={t('editor.richArea')}>
      <button
        type="button"
        aria-label={t('editor.richBold')}
        title={t('editor.richBold')}
        aria-pressed={marks.b}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => onMark('b')}
      >
        <b aria-hidden>ب</b>
      </button>
      <button
        type="button"
        aria-label={t('editor.richItalic')}
        title={t('editor.richItalic')}
        aria-pressed={marks.i}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => onMark('i')}
      >
        <i aria-hidden>م</i>
      </button>
      <span className="rich-toolbar-sep" aria-hidden />
      <button
        type="button"
        aria-label={t('editor.richHeading')}
        title={t('editor.richHeading')}
        aria-pressed={para === 'h2'}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => toggleTo('h2')}
      >
        <span aria-hidden>ع</span>
      </button>
      <button
        type="button"
        aria-label={t('editor.richBullet')}
        title={t('editor.richBullet')}
        aria-pressed={para === 'ul'}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => toggleTo('ul')}
      >
        <span aria-hidden>•</span>
      </button>
      <button
        type="button"
        aria-label={t('editor.richNumbered')}
        title={t('editor.richNumbered')}
        aria-pressed={para === 'ol'}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => toggleTo('ol')}
      >
        <span aria-hidden>١</span>
      </button>
    </div>
  )
}
