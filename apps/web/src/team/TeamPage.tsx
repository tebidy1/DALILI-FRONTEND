import { useCallback, useEffect, useState } from 'react'
import type { MemberDto, TeamDto } from '@dalili/shared'
import { client, webInviteUrl } from '../api'
import { Button } from '../ui/Button'
import { StateView } from '../ui/StateView'
import { IconCloudOff, IconPlus, IconTrash, IconUsers } from '../ui/icons'
import { t } from '../i18n'
import { arDigits, copyToClipboard, hijriDateAr, roleLabelAr } from '../lib/format'
import { useOverview } from '../shell/OverviewContext'
import { useConfirm } from '../components/ConfirmProvider'

/**
 * المرحلة د (الفرق — WS-08) على نمط المرجع داخل القشرة: جدول أعضاء (بريد + حالة
 * الدعوة + الدور + الفريق + الانضمام + عدد أدلته)، دعوة برابط يُنسخ ويُرسل واتساب
 * (بلا SMTP)، وفرق ككيان تُنشأ وتُحذف ويُجمَّع فيها الأعضاء. **الإزالة تنقل ملكية
 * أدلة المنقول للمدير** فلا دليل يتيم — والتأكيد يذكر ذلك بعددها. الإدارة للمدير
 * وحده، والقائمة قراءة مشتركة («من في المنظمة»).
 */

type TeamRole = 'admin' | 'creator' | 'viewer'

export function TeamPage() {
  const { overview } = useOverview()
  const confirm = useConfirm()
  const isAdmin = overview?.myRole === 'admin'

  const [members, setMembers] = useState<MemberDto[] | null>(null)
  const [teams, setTeams] = useState<TeamDto[]>([])
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [reloadSeq, setReloadSeq] = useState(0)

  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState<TeamRole>('creator')
  const [inviteLink, setInviteLink] = useState('')
  const [newTeam, setNewTeam] = useState('')

  const reload = useCallback(() => setReloadSeq((s) => s + 1), [])

  useEffect(() => {
    const ac = new AbortController()
    Promise.all([client.getTeamMembers(), client.listTeams(ac.signal).catch(() => [])])
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

  async function changeRole(id: string, role: TeamRole) {
    try {
      await client.updateMember(id, { role })
      reload()
    } catch {
      setError(t('team.actionError'))
    }
  }

  async function changeTeam(id: string, teamId: string) {
    try {
      await client.updateMember(id, { teamId: teamId || null })
      reload()
    } catch {
      setError(t('team.actionError'))
    }
  }

  async function remove(m: MemberDto) {
    const ok = await confirm({
      title: t('team.remove'),
      body: t('team.removeConfirm', { email: m.email, count: arDigits(m.guideCount ?? 0) }),
      confirmLabel: t('team.remove'),
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

  async function createTeam(e: React.FormEvent) {
    e.preventDefault()
    const name = newTeam.trim()
    if (!name) return
    try {
      await client.createTeam(name)
      setNewTeam('')
      reload()
    } catch (err) {
      setError((err as { message?: string })?.message ?? t('team.inviteError'))
    }
  }

  async function deleteTeam(tm: TeamDto) {
    const ok = await confirm({
      title: t('team.deleteTeam'),
      body: t('team.deleteTeamConfirm', { name: tm.name }),
      confirmLabel: t('team.deleteTeam'),
      danger: true,
    })
    if (!ok) return
    try {
      await client.deleteTeam(tm.id)
      reload()
    } catch {
      setError(t('team.actionError'))
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
                    <option value="admin">{t('team.roleAdmin')}</option>
                    <option value="creator">{t('team.roleCreator')}</option>
                    <option value="viewer">{t('team.roleViewer')}</option>
                  </select>
                </div>
                <Button type="submit" icon={<IconPlus size={16} />}>
                  {t('team.inviteBtn')}
                </Button>
              </form>
              {inviteLink && (
                <div className="invite-box">
                  <div className="muted">{t('team.inviteLinkTitle')}</div>
                  <div className="row invite-link-row">
                    <code className="invite-url" dir="ltr">{inviteLink}</code>
                    <Button size="sm" onClick={copyInvite}>{t('team.copyLink')}</Button>
                    <a className="btn ghost sm" href={waHref} target="_blank" rel="noreferrer">{t('team.waSend')}</a>
                  </div>
                </div>
              )}
            </div>
          )}

          {isAdmin && (
            <div className="row teams-row" role="group" aria-label={t('team.teamsTitle')}>
              <span className="muted">{t('team.teamsTitle')}:</span>
              {teams.map((tm) => (
                <span className="chip team-chip" key={tm.id}>
                  {tm.name} ({arDigits(tm.memberCount)})
                  <button className="af-x" aria-label={`${t('team.deleteTeam')} — ${tm.name}`} onClick={() => void deleteTeam(tm)}>
                    ✕
                  </button>
                </span>
              ))}
              <form className="row team-new" onSubmit={createTeam}>
                <input aria-label={t('team.newTeam')} value={newTeam} onChange={(e) => setNewTeam(e.target.value)} placeholder={t('team.newTeam')} />
                <Button size="sm" variant="ghost" type="submit">
                  {t('team.createTeam')}
                </Button>
              </form>
            </div>
          )}

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
                    {isAdmin && <th>{t('team.colActions')}</th>}
                  </tr>
                </thead>
                <tbody>
                  {members.map((m) => {
                    // توحيد القاموس: تاريخ الانضمام هجري كبقية الواجهة (النتائج والتقارير)
                    const joined = m.joinedAt ? hijriDateAr(m.joinedAt) : '—'
                    return (
                      <tr key={m.id}>
                        <td>
                          <span className="col-title"><bdi>{m.email}</bdi></span>
                          {m.pending && <span className="chip pending-chip">{t('team.pending')}</span>}
                        </td>
                        <td>
                          {isAdmin ? (
                            <select aria-label={t('team.roleA11y')} value={m.role} onChange={(e) => void changeRole(m.id, e.target.value as TeamRole)}>
                              <option value="admin">{t('team.roleAdmin')}</option>
                              <option value="creator">{t('team.roleCreator')}</option>
                              <option value="viewer">{t('team.roleViewer')}</option>
                            </select>
                          ) : (
                            <span className="chip">{roleLabelAr(m.role)}</span>
                          )}
                        </td>
                        <td>
                          {isAdmin ? (
                            <select aria-label={t('team.colTeam')} value={m.teamId ?? ''} onChange={(e) => void changeTeam(m.id, e.target.value)}>
                              <option value="">{t('team.noTeam')}</option>
                              {teams.map((tm) => (
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
                            {m.email !== overview?.myEmail && (
                              <Button size="sm" variant="ghost" icon={<IconTrash size={14} />} onClick={() => void remove(m)}>
                                {t('team.remove')}
                              </Button>
                            )}
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
