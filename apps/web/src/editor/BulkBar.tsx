import { Button } from '../ui/Button'
import { t } from '../i18n'

/**
 * S5: شريط الإجراءات الجماعية على الخطوات — يظهر فقط حين يوجد تحديد، ويلتصق
 * تحت شريط المحرر فيبقى في المتناول مهما طال الدليل.
 *
 * S4 يسكن هنا أيضًا: «لوّن الهدف» هو الجواب المفقود على «أيّ خطوة نلوّن؟».
 * لوحة الحبر في العمود تختار اللون، والتحديد هنا يختار من يأخذه.
 */
export function BulkBar({ count, onSelectAll, onDuplicate, onMerge, onRecolor, onRemove, onClear }: {
  count: number
  onSelectAll: () => void
  onDuplicate: () => void
  /** EDT-06: يُمرَّر فقط حين يكون المحدَّد متجاورين — زر الدمج لا يظهر غير ذلك */
  onMerge?: () => void
  onRecolor: () => void
  onRemove: () => void
  onClear: () => void
}) {
  return (
    <div className="bulk-bar steps-bulk-bar no-print" role="toolbar" aria-label={t('editor.bulkBar')}>
      <span className="bulk-count">{t('editor.selectedCount', { count })}</span>
      <Button size="sm" variant="ghost" onClick={onSelectAll}>
        {t('editor.selectAll')}
      </Button>
      <Button size="sm" variant="ghost" onClick={onDuplicate}>
        {t('editor.duplicateSelected')}
      </Button>
      {onMerge && (
        <Button size="sm" variant="ghost" onClick={onMerge}>
          {t('editor.mergeSelected')}
        </Button>
      )}
      <Button size="sm" variant="ghost" onClick={onRecolor}>
        {t('editor.recolorTarget')}
      </Button>
      <Button size="sm" variant="danger" onClick={onRemove}>
        {t('editor.removeSelected')}
      </Button>
      <Button size="sm" variant="ghost" onClick={onClear}>
        {t('editor.clearSelection')}
      </Button>
    </div>
  )
}
