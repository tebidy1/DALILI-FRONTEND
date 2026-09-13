import { WEB_BASE } from '@/lib/config'
import { DocIcon, EnterIcon } from './icons'

/**
 * PNL-01: صف دليل واحد في اللوحة — الصف رابط إلى الويب (تبويب جديد، كما كان)،
 * وزر ↵ شقيقه يفتح الدليل داخل اللوحة للمقارنة مع الصفحة. زر داخل رابط HTML غير صالح.
 */
export function GuideRow({
  id,
  title,
  sub,
  onOpenHere,
}: {
  id: string
  title: string
  sub: string
  onOpenHere?: (id: string) => void
}) {
  return (
    <div className="doc-row">
      <a className="doc" href={`${WEB_BASE}/g/${id}`} target="_blank" rel="noreferrer">
        <span className="doc-ic"><DocIcon /></span>
        <span className="doc-tx">
          <bdi>{title}</bdi>
          {sub && <small>{sub}</small>}
        </span>
      </a>
      {onOpenHere && (
        <button
          type="button"
          className="doc-enter"
          data-guide={id}
          aria-label={`اعرض «${title}» هنا في اللوحة`}
          title="اعرضه هنا بجوار الصفحة"
          onClick={() => onOpenHere(id)}
        >
          <EnterIcon />
        </button>
      )}
    </div>
  )
}
