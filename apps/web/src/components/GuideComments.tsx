import { useMemo, useState } from 'react'
import { threadComments } from '@dalili/core'
import type { CommentKind, StepCommentDto } from '@dalili/shared'
import { IconComment } from '../ui/icons'
import { t } from '../i18n'
import { useConfirm } from './ConfirmProvider'

/** GM-05: اسم الضيف يُحفظ محليًا مرة واحدة — يظهر في تعليقاته اللاحقة بلا حساب */
const NAME_KEY = 'dalili.commenter'

const fmt = new Intl.DateTimeFormat('ar', { dateStyle: 'medium', timeStyle: 'short' })

export interface GuideCommentsProps {
  /** كل تعليقات الدليل (حالة الصفحة) — المكوّن يثبّت خيوطها بلا تصفية خطوة */
  comments: StepCommentDto[]
  /** المحرر (المالك) يرى أزرار التعديل والوسم والحذف؛ العارض العام للضيف بلاها */
  canModerate: boolean
  failed?: boolean
  onRetry?: () => void
  onAdd: (body: string, opts: { kind: CommentKind; parentId?: string; author?: string }) => Promise<void>
  onEdit?: (id: string, body: string) => Promise<void>
  onResolve?: (id: string, resolved: boolean) => Promise<void>
  onDelete?: (id: string) => Promise<void>
}

function who(c: StepCommentDto): string {
  return c.isOwner ? t('comments.ownerBadge') : c.author || t('comments.guest')
}

/** سطر تعليق واحد — الاسم، النص، التاريخ، وأزرار المالك؛ الأصل من نوع مشكلة بمعلَم أحمر */
function CommentRow({
  c,
  canModerate,
  onEdit,
  onResolve,
  onDelete,
}: {
  c: StepCommentDto
  canModerate: boolean
  onEdit?: (id: string, body: string) => Promise<void>
  onResolve?: (id: string, resolved: boolean) => Promise<void>
  onDelete?: (id: string) => Promise<void>
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(c.body)
  const confirm = useConfirm()
  const edited = c.updatedAt > c.createdAt
  const isIssue = c.kind === 'issue' && !c.parentId

  return (
    <div className={`comment-item${c.parentId ? ' is-reply' : ''}${c.resolved ? ' resolved' : ''}${isIssue ? ' is-issue' : ''}`}>
      <div className="comment-meta">
        {isIssue && <span className="chip issue-chip">{t('comments.issueBadge')}</span>}
        <bdi className={`comment-author${c.isOwner ? ' is-owner' : ''}`}>{who(c)}</bdi>
        <span className="muted">{fmt.format(new Date(c.createdAt))}</span>
        {edited && <span className="muted">· {t('comments.editedMark')}</span>}
        {c.resolved && <span className="chip resolved-chip">{t('comments.resolvedBadge')}</span>}
      </div>
      {editing ? (
        <div className="row">
          <textarea className="comment-box" dir="auto" value={draft} onChange={(e) => setDraft(e.target.value)} rows={2} />
          <button
            className="btn sm"
            onClick={() => {
              const text = draft.trim()
              if (!text || !onEdit) return
              void onEdit(c.id, text).then(() => setEditing(false))
            }}
          >
            {t('comments.save')}
          </button>
          <button
            className="btn sm ghost"
            onClick={() => {
              setEditing(false)
              setDraft(c.body)
            }}
          >
            {t('comments.cancel')}
          </button>
        </div>
      ) : (
        <p className="comment-body" dir="auto">
          <bdi>{c.body}</bdi>
        </p>
      )}
      {canModerate && !editing && (
        <div className="row comment-actions">
          {!c.parentId && onResolve && (
            <button className="btn sm ghost" onClick={() => void onResolve(c.id, !c.resolved)}>
              {c.resolved ? t('comments.unresolve') : t('comments.resolve')}
            </button>
          )}
          {onEdit && (
            <button className="btn sm ghost" onClick={() => setEditing(true)}>
              {t('comments.edit')}
            </button>
          )}
          {onDelete && (
            <button
              className="btn sm ghost danger"
              onClick={() => {
                void confirm({
                  title: t('comments.delete'),
                  body: t('comments.deleteConfirm'),
                  confirmLabel: t('comments.delete'),
                  danger: true,
                }).then((ok) => {
                  if (ok) void onDelete(c.id)
                })
              }}
            >
              {t('comments.delete')}
            </button>
          )}
        </div>
      )}
    </div>
  )
}

/**
 * GM-05 تطوّر: تعليقات الدليل كله في لوحة واحدة أعلى الصفحة (لا تعليق لكل خطوة).
 * نوعان: «تبليغ مشكلة» (معلَم أحمر يدخل عدّاد المشكلات) و«تعليق» عام. الحالة عند الأب.
 */
export function GuideComments(props: GuideCommentsProps) {
  const { comments, canModerate, failed, onRetry, onAdd, onEdit, onResolve, onDelete } = props
  const [open, setOpen] = useState(false)
  const [kind, setKind] = useState<CommentKind>('note')
  const [draft, setDraft] = useState('')
  const [name, setName] = useState(() => {
    try {
      return window.localStorage.getItem(NAME_KEY) ?? ''
    } catch {
      return ''
    }
  })
  const [replyTo, setReplyTo] = useState<string | null>(null)
  const [replyDraft, setReplyDraft] = useState('')
  const [err, setErr] = useState('')

  const threads = useMemo(() => threadComments(comments), [comments])
  const count = comments.length
  const openIssues = comments.reduce((n, c) => (c.kind === 'issue' && !c.parentId && !c.resolved ? n + 1 : n), 0)
  /** نوع خيط لتوريثه للردود — الرد يتبع نوع أصله (لا يُحسب مشكلةً على أي حال) */
  const kindOfRoot = (rootId: string): CommentKind => (comments.find((c) => c.id === rootId)?.kind === 'issue' ? 'issue' : 'note')

  async function send() {
    const body = draft.trim()
    if (!body) return
    setErr('')
    try {
      await onAdd(body, { kind, ...(canModerate ? {} : { author: name.trim() || undefined }) })
      setDraft('')
      if (!canModerate && name.trim()) {
        try {
          window.localStorage.setItem(NAME_KEY, name.trim())
        } catch {
          /* التخزين المحلي رفاهية — لا يُسقط التعليق */
        }
      }
    } catch {
      setErr(t('comments.sendError'))
    }
  }

  async function sendReply(parentId: string) {
    const body = replyDraft.trim()
    if (!body) return
    setErr('')
    try {
      await onAdd(body, { kind: kindOfRoot(parentId), parentId, ...(canModerate ? {} : { author: name.trim() || undefined }) })
      setReplyDraft('')
      setReplyTo(null)
    } catch {
      setErr(t('comments.sendError'))
    }
  }

  return (
    <section className="guide-comments no-print">
      <button
        className={`icon-btn wide comment-toggle${count > 0 ? ' has-comments' : ''}${openIssues > 0 ? ' has-issues' : ''}`}
        aria-expanded={open}
        aria-label={t('comments.toggleA11y', { count })}
        onClick={() => setOpen((v) => !v)}
      >
        <IconComment size={16} />
        <span>{t('comments.sectionTitle')}</span>
        {count > 0 && <span className="comment-count">{count}</span>}
        {openIssues > 0 && <span className="chip issue-chip">{openIssues}</span>}
      </button>

      {open && (
        <div className="comments-panel">
          {failed ? (
            <div className="row">
              <span className="muted">{t('comments.loadError')}</span>
              {onRetry && (
                <button className="btn sm ghost" onClick={onRetry}>
                  {t('common.retry')}
                </button>
              )}
            </div>
          ) : (
            <>
              {threads.length === 0 && <p className="muted">{t('comments.empty')}</p>}

              {threads.map((th) => (
                <div className={`comment-thread${th.root.resolved ? ' resolved' : ''}`} key={th.root.id}>
                  <CommentRow c={th.root} canModerate={canModerate} onEdit={onEdit} onResolve={onResolve} onDelete={onDelete} />
                  {th.replies.map((r) => (
                    <CommentRow c={r} key={r.id} canModerate={canModerate} onEdit={onEdit} onDelete={onDelete} />
                  ))}
                  {replyTo === th.root.id ? (
                    <div className="row">
                      <textarea
                        className="comment-box"
                        dir="auto"
                        placeholder={t('comments.replyPlaceholder')}
                        value={replyDraft}
                        rows={2}
                        onChange={(e) => setReplyDraft(e.target.value)}
                      />
                      <button className="btn sm" onClick={() => void sendReply(th.root.id)}>
                        {t('comments.send')}
                      </button>
                      <button className="btn sm ghost" onClick={() => setReplyTo(null)}>
                        {t('comments.cancel')}
                      </button>
                    </div>
                  ) : (
                    <button className="btn sm ghost comment-reply-btn" onClick={() => setReplyTo(th.root.id)}>
                      {t('comments.reply')}
                    </button>
                  )}
                </div>
              ))}

              <div className="comment-composer">
                {/* مبدّل النوع: تبليغ مشكلة أو تعليق عام */}
                <div className="comment-kind-toggle" role="group" aria-label={t('comments.kindA11y')}>
                  <button
                    type="button"
                    className={`btn sm${kind === 'issue' ? ' active issue' : ' ghost'}`}
                    aria-pressed={kind === 'issue'}
                    onClick={() => setKind('issue')}
                  >
                    {t('comments.kindIssue')}
                  </button>
                  <button
                    type="button"
                    className={`btn sm${kind === 'note' ? ' active' : ' ghost'}`}
                    aria-pressed={kind === 'note'}
                    onClick={() => setKind('note')}
                  >
                    {t('comments.kindNote')}
                  </button>
                </div>
                {!canModerate && (
                  <input
                    type="text"
                    dir="auto"
                    className="comment-name"
                    aria-label={t('comments.nameA11y')}
                    placeholder={t('comments.namePlaceholder')}
                    maxLength={40}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                )}
                <textarea
                  className="comment-box"
                  dir="auto"
                  placeholder={kind === 'issue' ? t('comments.placeholderIssue') : t('comments.placeholder')}
                  value={draft}
                  rows={2}
                  maxLength={2000}
                  onChange={(e) => setDraft(e.target.value)}
                />
                <button className="btn sm" disabled={!draft.trim()} onClick={() => void send()}>
                  {t('comments.send')}
                </button>
              </div>
              {err && (
                <p className="save-state error" role="alert">
                  {err}
                </p>
              )}
            </>
          )}
        </div>
      )}
    </section>
  )
}
