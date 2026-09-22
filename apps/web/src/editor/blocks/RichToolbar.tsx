import type { RichParaDto } from '@dalili/shared'
import { t } from '../../i18n'
import { getLocale } from '../../lib/locale'
import type { Mark } from './rich-ops'
import type { MarkState } from './RichTextBlock'

/** أزرار الفقرات الثلاثة — صيغة واحدة: قيمة الفقرة، مفتاح الترجمة، الرمز الظاهر */
const PARA_BUTTONS = [
  { value: 'h2', labelKey: 'editor.richHeading', glyph: 'ع', glyphEn: 'H' },
  { value: 'ul', labelKey: 'editor.richBullet', glyph: '•', glyphEn: '•' },
  { value: 'ol', labelKey: 'editor.richNumbered', glyph: '١', glyphEn: '1' },
] as const

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
        <b aria-hidden>{getLocale() === 'en' ? 'B' : 'ب'}</b>
      </button>
      <button
        type="button"
        aria-label={t('editor.richItalic')}
        title={t('editor.richItalic')}
        aria-pressed={marks.i}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => onMark('i')}
      >
        <i aria-hidden>{getLocale() === 'en' ? 'I' : 'م'}</i>
      </button>
      <span className="rich-toolbar-sep" aria-hidden />
      {PARA_BUTTONS.map(({ value, labelKey, glyph, glyphEn }) => (
        <button
          key={value}
          type="button"
          aria-label={t(labelKey)}
          title={t(labelKey)}
          aria-pressed={para === value}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => toggleTo(value)}
        >
          <span aria-hidden>{getLocale() === 'en' ? glyphEn : glyph}</span>
        </button>
      ))}
    </div>
  )
}
