import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import type { MemberDto, TeamDto, UpdateMemberReq } from '@dalili/shared'
import { client, webInviteUrl } from '../api'
import { Button } from '../ui/Button'
import { StateView } from '../ui/StateView'
import { IconCloudOff, IconPlus, IconTrash, IconUsers } from '../ui/icons'
import { t } from '../i18n'
import { arDigits, copyToClipboard, hijriDateAr, roleLabelAr } from '../lib/format'
import { useOverview } from '../shell/OverviewContext'
import { useConfirm } from '../components/ConfirmProvider'
import { DepartmentsPanel } from './DepartmentsPanel'

/**
 * المرحلة د (الفرق — WS-08) على نمط المرجع داخل القشرة: جدول أعضاء (بريد + حالة
 * الدعوة + الدور + الفريق + الانضمام + عدد أدلته)، دعوة برابط يُنسخ ويُرسل واتساب
 * (بلا SMTP)، والأقسام في لوحتها (`DepartmentsPanel`، ORG-01/02) ويُجمَّع فيها الأعضاء. **الإزالة تنقل ملكية
 * أدلة المنقول للمدير** فلا دليل يتيم — والتأكيد يذكر ذلك بعددها. الإدارة للمدير
 * وحده، والقائمة قراءة مشتركة («من في المنظمة»).
 */

type TeamRole = 'admin' | 'creator' | 'viewer'

export function TeamPage() {
  const { overview } = useOverview()
  const confirm = useConfirm()
  const isAdmin = overview?.myRole === 'admin'
  const kind = overview?.accountKind

  const [members, setMembers] = useState<MemberDto[] | null>(null)
  const [teams, setTeams] = useState<TeamDto[]>([])
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [reloadSeq, setReloadSeq] = useState(0)

  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState<TeamRole>('creator')
  const [inviteLink, setInviteLink] = useState('')
  /** م١: بريد من وصلته الدعوة — فارغ إن تعطّل البريد فالرابط للنسخ وحده */
  const [inviteEmailedTo, setInviteEmailedTo] = useState('')
  /** PUB-01: قيمة «ينشر» المرسلة ولم يرد الخادم بعد — تُعرض فوراً والمفتاح مقفل، فلا تعكسها نقرة ثانية */
  const [pubPending, setPubPending] = useState<Record<string, boolean>>({})

  const reload = useCallback(() => setReloadSeq((s) => s + 1), [])

  useEffect(() => {
    const ac = new AbortController()
    Promise.all([client.getTeamMembers(), client.listTeams(ac.signal, true).catch(() => [])])
      .then(([m, ts]) => {
        setMembers(m)
        setTeams(ts)
        // اللافتات لا تُمسح هنا — إعادة الجلب بعد فعل (إزالة/إضافة) تمحو لافتته لحظة
        // ظهورها (نفس علة المرحلة ج ②)
      })
      .catch(() => setError(t('library.loadError')))
    return () => ac.abort()
  }, [reloadSeq])

  /** دعوة برابط — وبريد له حساب فعلي (409) يُضاف مباشرة بلا مستخدم معلّق أبدًا */
  async function submitInvite(e: React.FormEvent) {
    e.preventDefault()
    const email = inviteEmail.trim()
    if (!email) return
    setError('')
    try {
      const inv = await client.createInvite({ email, role: inviteRole })
      setInviteLink(webInviteUrl(inv.inviteUrl))
      setInviteEmailedTo(inv.emailed ? inv.email : '')
    } catch (err) {
      const status = (err as { status?: number })?.status
      if (status === 409) {
        try {
          await client.inviteMember({ email, role: inviteRole, department: '' })
          setNotice(t('team.addedDirect'))
          setInviteEmail('')
          reload()
        } catch {
          setError(t('team.inviteError'))
        }
      } else {
        setError(t('team.inviteError'))
      }
    }
  }

  async function copyInvite() {
    if (await copyToClipboard(inviteLink)) setNotice(t('team.linkCopied'))
    else setNotice(t('home.shareManual', { url: inviteLink }))
  }

  /** تعديل عضو (دور/قسم) — التحديث ثم إعادة جلب الأعضاء والأقسام (عدّاداتها)، والفشل بسبب الخادم */
  async function updateMember(id: string, patch: UpdateMemberReq) {
    try {
      await client.updateMember(id, patch)
      reload()
    } catch (err) {
      setError((err as Error)?.message || t('team.actionError'))
    }
  }

  async function remove(m: MemberDto) {
    const ok = await confirm({
      title: t('team.remove'),
      body: t('team.removeConfirm', { email: m.email, count: arDigits(m.guideCount ?? 0) }),
      danger: true,
    })
    if (!ok) return
    setError('')
    try {
      await client.removeMember(m.id)
      setNotice(t('team.removed'))
      reload()
    } catch {
      setError(t('team.actionError'))
    }
  }

  /** ORG-07: تعطيل لا حذف — المحتوى يبقى، والوصول يُقطع في الطلب التالي */
  async function setCanPublish(m: MemberDto, value: boolean) {
    if (m.id in pubPending) return
    setPubPending((p) => ({ ...p, [m.id]: value }))
    setError('')
    try {
      await client.updateMember(m.id, { canPublish: value })
      setMembers((list) => list?.map((x) => (x.id === m.id ? { ...x, canPublish: value } : x)) ?? list)
      setNotice(t(value ? 'team.publishGranted' : 'team.publishRevoked', { email: m.email }))
    } catch {
      setError(t('team.actionError'))
    } finally {
      setPubPending(({ [m.id]: _, ...rest }) => rest)
    }
  }

  async function deactivate(m: MemberDto) {
    const ok = await confirm({
      title: t('team.deactivate'),
      body: t('team.deactivateConfirm', { email: m.email }),
      confirmLabel: t('team.deactivateYes'),
      danger: true,
    })
    if (!ok) return
    setError('')
    try {
      await client.deactivateMember(m.id)
      setNotice(t('team.deactivatedNote', { email: m.email }))
      reload()
    } catch (err) {
      setError((err as { message?: string })?.message ?? t('team.actionError'))
    }
  }

  async function reactivate(m: MemberDto) {
    setError('')
    try {
      await client.reactivateMember(m.id)
      setNotice(t('team.reactivatedNote', { email: m.email }))
      reload()
    } catch (err) {
      setError((err as { message?: string })?.message ?? t('team.actionError'))
    }
  }

  const waHref = inviteLink ? `https://wa.me/?text=${encodeURIComponent(t('team.waText', { url: inviteLink }))}` : ''

  return (
    <div className="page team">
      <div className="toolbar">
        <h1 className="row screen-title">
          <IconUsers size={20} />
          {t('team.title')}
        </h1>
        {isAdmin && (
          <Link className="btn ghost sm" to="/audit">
            {t('audit.title')}
          </Link>
        )}
      </div>

      {error && members === null ? (
        <StateView kind="error" icon={<IconCloudOff size={30} />} title={t('library.loadError')} desc={t('library.loadErrorDesc')} action={{ label: t('common.retry'), onAction: reload }} />
      ) : (
        <>
          {error && <div className="err" role="alert">{error}</div>}
          {notice && <div className="ok-note" role="status">{notice}</div>}
          {!isAdmin && <div className="muted team-note">{t('team.readonlyNote')}</div>}

          {isAdmin && (
            <div className="card invite-card">
              <form className="row invite-form" onSubmit={submitInvite}>
                <div className="invite-field">
                  <label htmlFor="invite-email">{t('team.email')}</label>
                  <input id="invite-email" type="email" required value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} placeholder="name@example.com" />
                </div>
                <div className="invite-field">
                  <label htmlFor="invite-role">{t('team.role')}</label>
                  <select id="invite-role" value={inviteRole} onChange={(e) => setInviteRole(e.target.value as TeamRole)}>
                    <option value="admin">{roleLabelAr('admin', kind)}</option>
                    <option value="creator">{roleLabelAr('creator', kind)}</option>
                    <option value="viewer">{roleLabelAr('viewer', kind)}</option>
                  </select>
                </div>
                <Button type="submit" icon={<IconPlus size={16} />}>
                  {t('team.inviteBtn')}
                </Button>
              </form>
              {inviteLink && (
                <div className="invite-box">
                  <div className="muted">{inviteEmailedTo ? t('team.inviteEmailed', { email: inviteEmailedTo }) : t('team.inviteLinkTitle')}</div>
                  <div className="row invite-link-row">
                    <code className="invite-url" dir="ltr">{inviteLink}</code>
                    <Button size="sm" onClick={copyInvite}>{t('team.copyLink')}</Button>
                    <a className="btn ghost sm" href={waHref} target="_blank" rel="noreferrer">{t('team.waSend')}</a>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ش١: الشريك بلا أقسام (§٣.٤) */}
          {isAdmin && members && <DepartmentsPanel teams={teams} members={members} onTeamsChange={setTeams} />}

          {members === null ? (
            <div role="status" aria-live="polite" className="muted">{t('library.loadingA11y')}</div>
          ) : (
            <div className="table-wrap">
              <table className="team-table">
                <thead>
                  <tr>
                    <th>{t('team.colMember')}</th>
                    <th>{t('team.colRole')}</th>
                    <th>{t('team.colTeam')}</th>
                    <th>{t('team.colJoined')}</th>
                    <th>{t('team.colGuides')}</th>
                    {isAdmin && <th>{t('team.colPublish')}</th>}
                    {isAdmin && <th>{t('team.colActions')}</th>}
                  </tr>
                </thead>
                <tbody>
                  {members.map((m) => {
                    // توحيد القاموس: تاريخ الانضمام هجري كبقية الواجهة (النتائج والتقارير)
                    const joined = m.joinedAt ? hijriDateAr(m.joinedAt) : '—'
                    const isMe = m.email === overview?.myEmail
                    const off = m.status === 'deactivated'
                    // المدير ينشر دائماً (PUB-01)، والمشاهد لا ينشر — المفتاح للمنشئ والشريك
                    const pubFixed = m.role === 'admin' || m.role === 'viewer'
                    return (
                      <tr key={m.id} className={off ? 'member-off' : undefined}>
                        <td>
                          {m.name ? (
                            <span className="col-title">
                              <bdi>{m.name}</bdi> <small className="muted"><bdi>{m.email}</bdi></small>
                            </span>
                          ) : (
                            <span className="col-title"><bdi>{m.email}</bdi></span>
                          )}
                          {m.pending && <span className="chip pending-chip">{t('team.pending')}</span>}
                          {off && <span className="chip off-chip">{t('team.deactivated')}</span>}
                        </td>
                        <td>
                          {isAdmin ? (
                            <select aria-label={t('team.roleA11y')} value={m.role} onChange={(e) => void updateMember(m.id, { role: e.target.value as TeamRole })}>
                              <option value="admin">{roleLabelAr('admin', kind)}</option>
                              <option value="creator">{roleLabelAr('creator', kind)}</option>
                              <option value="viewer">{roleLabelAr('viewer', kind)}</option>
                            </select>
                          ) : (
                            <span className="chip">{roleLabelAr(m.role, kind)}</span>
                          )}
                        </td>
                        <td>
                          {isAdmin ? (
                            <select aria-label={t('team.colTeam')} value={m.teamId ?? ''} onChange={(e) => void updateMember(m.id, { teamId: e.target.value || null })}>
                              <option value="">{t('team.noTeam')}</option>
                              {teams.filter((tm) => !tm.archivedAt || tm.id === m.teamId).map((tm) => (
                                <option key={tm.id} value={tm.id}>
                                  {tm.name}
                                </option>
                              ))}
                            </select>
                          ) : (
                            <span className="muted">{m.teamName ?? t('team.noTeam')}</span>
                          )}
                        </td>
                        <td className="muted">{joined}</td>
                        <td className="col-views">{arDigits(m.guideCount ?? 0)}</td>
                        {isAdmin && (
                          <td>
                            <input
                              type="checkbox"
                              aria-label={t('team.canPublishA11y', { email: m.email })}
                              title={pubFixed ? t(m.role === 'admin' ? 'team.publishAdminAlways' : 'team.publishViewerNever') : undefined}
                              checked={m.role === 'admin' || (m.role !== 'viewer' && (pubPending[m.id] ?? m.canPublish !== false))}
                              disabled={pubFixed || m.id in pubPending}
                              onChange={(e) => void setCanPublish(m, e.target.checked)}
                            />
                          </td>
                        )}
                        {isAdmin && (
                          <td>
                            <div className="row member-actions">
                            {!isMe &&
                              (off ? (
                                <Button size="sm" variant="ghost" onClick={() => void reactivate(m)}>
                                  {t('team.reactivate')}
                                </Button>
                              ) : (
                                <Button size="sm" variant="ghost" onClick={() => void deactivate(m)}>
                                  {t('team.deactivate')}
                                </Button>
                              ))}
                            {!isMe && (
                              <Button size="sm" variant="ghost" icon={<IconTrash size={14} />} onClick={() => void remove(m)}>
                                {t('team.remove')}
                              </Button>
                            )}
                            </div>
                          </td>
                        )}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  )
}
