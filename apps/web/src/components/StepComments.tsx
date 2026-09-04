import { useMemo, useState } from 'react'
import { threadComments } from '@dalili/core'
import type { StepCommentDto } from '@dalili/shared'
import { IconComment } from '../ui/icons'
import { t } from '../i18n'

/** GM-05: اسم الضيف يُحفظ محليًا مرة واحدة — يظهر في تعليقاته اللاحقة بلا حساب */
const NAME_KEY = 'dalili.commenter'

const fmt = new Intl.DateTimeFormat('ar', { dateStyle: 'medium', timeStyle: 'short' })

export interface StepCommentsProps {
  stepId: string
  /** كل تعليقات الدليل (حالة الصفحة) — المكوّن يرشّح خطوته ويثبّت خيوطها */
  comments: StepCommentDto[]
  /** المحرر (المالك) يرى أزرار التعديل والوسم والحذف؛ العارض العام للضيف بلاها */
  canModerate: boolean
  failed?: boolean
  onRetry?: () => void
  onAdd: (body: string, opts: { parentId?: string; author?: string }) => Promise<void>
  onEdit?: (id: string, body: string) => Promise<void>
  onResolve?: (id: string, resolved: boolean) => Promise<void>
  onDelete?: (id: string) => Promise<void>
}

function who(c: StepCommentDto): string {
  return c.isOwner ? t('comments.ownerBadge') : c.author || t('comments.guest')
}

/** سطر تعليق واحد — بسيط ومقروء: الاسم، النص، التاريخ، وأزرار المالك عند اللزوم */
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
  const edited = c.updatedAt > c.createdAt

  return (
    <div className={`comment-item${c.parentId ? ' is-reply' : ''}${c.resolved ? ' resolved' : ''}`}>
      <div className="comment-meta">
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
                if (window.confirm(t('comments.deleteConfirm'))) void onDelete(c.id)
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
 * تعليقات خطوة واحدة: زر يفتح الخيوط — الضيف يعلّق ويردّ، والمالك يوسم
 * محلولًا ويعدّل ويحذف. الحالة كلها عند الأب؛ هذا المكوّن عرض وإدخال نقي.
 */
export function StepComments(props: StepCommentsProps) {
  const { stepId, comments, canModerate, failed, onRetry, onAdd, onEdit, onResolve, onDelete } = props
  const [open, setOpen] = useState(false)
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

  const threads = useMemo(() => threadComments(comments.filter((c) => c.stepId === stepId)), [comments, stepId])
  const count = comments.reduce((n, c) => (c.stepId === stepId ? n + 1 : n), 0)

  async function send() {
    const body = draft.trim()
    if (!body) return
    setErr('')
    try {
      await onAdd(body, canModerate ? {} : { author: name.trim() || undefined })
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
      await onAdd(body, { parentId, ...(canModerate ? {} : { author: name.trim() || undefined }) })
      setReplyDraft('')
      setReplyTo(null)
    } catch {
      setErr(t('comments.sendError'))
    }
  }

  return (
    <section className="step-comments no-print">
      <button
        className={`icon-btn wide comment-toggle${count > 0 ? ' has-comments' : ''}`}
        aria-expanded={open}
        aria-label={t('comments.toggleA11y', { count })}
        onClick={() => setOpen((v) => !v)}
      >
        <IconComment size={16} />
        <span>{count > 0 ? String(count) : t('comments.toggleShort')}</span>
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
                  placeholder={t('comments.placeholder')}
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
