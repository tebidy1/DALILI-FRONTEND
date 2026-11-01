import { useState } from 'react'
import { useParams } from 'react-router-dom'
import type { AccountStatus, PlatformAccountDetailDto } from '@dalili/shared'
import { client } from '../api'
import { t, type TKey } from '../i18n'
import { arDigits, dualDateAr, formatBytes } from '../lib/format'
import { Button } from '../ui/Button'
import { useConfirm } from '../components/ConfirmProvider'
import { useLoad } from '../console/useLoad'
import { LoadState } from '../console/LoadState'
import { StatusChip } from './StatusChip'
import { InviteLinkBox } from './InviteLinkBox'
import { platformActionLabel } from './actions'

/** فعل حالة واحد: نصه، ونص تأكيده، وهل يحتاج سبباً (الخطة §3.1: دورة حياة الحساب) */
const STATUS_ACTIONS: { status: AccountStatus; label: TKey; confirm: TKey; needsReason: boolean; danger: boolean }[] = [
  { status: 'suspended', label: 'platform.suspend', confirm: 'platform.suspendConfirm', needsReason: true, danger: true },
  { status: 'ended', label: 'platform.end', confirm: 'platform.endConfirm', needsReason: true, danger: true },
  { status: 'active', label: 'platform.reactivate', confirm: 'platform.reactivateConfirm', needsReason: false, danger: false },
]

/** م٢: صفحة حساب واحد — الأعداد، والمدراء، والدعوات المعلقة، والحالة بسبب، والسجل */
export function AccountDetail() {
  const { id = '' } = useParams()
  const confirm = useConfirm()
  const { data, setData, failed, reload } = useLoad((s) => client.platformAccount(id, s), [id])
  const [reason, setReason] = useState('')
  const [adminEmail, setAdminEmail] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [invite, setInvite] = useState<{ email: string; url: string; emailed: boolean } | null>(null)

  /** نداء واحد لكل فعل: ينفّذ، ويحدّث الصفحة من الخادم، ويعلن النتيجة أو السبب */
  async function run(call: () => Promise<unknown>, ok: string) {
    setError('')
    setNotice('')
    try {
      await call()
      setNotice(ok)
      reload()
      return true
    } catch (err) {
      setError((err as Error)?.message || t('common.unexpected'))
      return false
    }
  }

  async function changeStatus(a: (typeof STATUS_ACTIONS)[number], account: PlatformAccountDetailDto) {
    if (!(await confirm({ title: t(a.label), body: t(a.confirm, { name: account.name }), confirmLabel: t(a.label), danger: a.danger }))) return
    if (await run(() => client.platformSetStatus(id, a.status, reason.trim() || undefined), t('platform.statusSaved'))) setReason('')
  }

  /** دعوة مدير — نداء مباشر (run() العام يرمي النتيجة) ليظهر رابط الدعوة دائماً مع زرّي النسخ وواتساب */
  async function inviteAdmin(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setNotice('')
    setInvite(null)
    try {
      const res = await client.platformAdminInvite(id, adminEmail.trim())
      setInvite({ email: adminEmail.trim(), url: res.inviteUrl, emailed: res.emailed })
      setAdminEmail('')
      reload()
    } catch (err) {
      setError((err as Error)?.message || t('common.unexpected'))
    }
  }

  return (
    <section>
      <LoadState data={data} failed={failed} onRetry={reload}>
        {() =>
          data && (
            <>
              <h2 className="console-h2"><bdi>{data.name}</bdi> <StatusChip status={data.status} /></h2>
              {data.statusReason && <p className="muted">{t('platform.reasonShown', { reason: data.statusReason })}</p>}
              {data.retainUntil && <p className="muted">{t('platform.retainUntil', { date: dualDateAr(data.retainUntil) })}</p>}
              {error && <div className="err" role="alert">{error}</div>}
              {notice && <div className="ok-note" role="status">{notice}</div>}

              <div className="console-stats">
                <div className="console-stat"><span className="muted">{t('platform.colMembers')}</span><strong>{arDigits(data.members)}</strong></div>
                <div className="console-stat"><span className="muted">{t('platform.colGuides')}</span><strong>{arDigits(data.guides)}</strong></div>
                <div className="console-stat"><span className="muted">{t('platform.colStorage')}</span><strong>{formatBytes(data.storageBytes)}</strong></div>
                <div className="console-stat"><span className="muted">{t('platform.plan')}</span><strong>{t('account.planFree')}</strong></div>
              </div>

              {/* ش١: الشريك — الأنظمة التي ربطناه بها، وأعداد أدلته الرسمية وعملائه */}
              {data.partner && (
                <div className="card form-stack">
                  <h3 className="console-h3">{t('platform.partnerSystems')}</h3>
                  <div className="sys-chips">
                    {data.partner.systems.length ? data.partner.systems.map((s) => <span key={s.id} className="chip">{s.name}</span>) : <span className="muted">{t('systems.noProviders')}</span>}
                  </div>
                  <div className="console-stats">
                    <div className="console-stat"><span className="muted">{t('platform.partnerOfficial')}</span><strong>{arDigits(data.partner.officialGuides)}</strong></div>
                    <div className="console-stat"><span className="muted">{t('platform.partnerClients')}</span><strong>{arDigits(data.partner.clients)}</strong></div>
                  </div>
                </div>
              )}

              <div className="card form-stack">
                <h3 className="console-h3">{t('platform.admins')}</h3>
                {data.adminEmails.length ? <ul>{data.adminEmails.map((e) => <li key={e}><bdi>{e}</bdi></li>)}</ul> : <p className="muted">{t('platform.noAdminYet')}</p>}
                {data.pendingInvites.length > 0 && (
                  <p className="muted">{t('platform.pendingInvites', { emails: data.pendingInvites.map((i) => i.email).join('، ') })}</p>
                )}
                <form className="row" onSubmit={inviteAdmin}>
                  <input type="email" dir="ltr" required aria-label={t('platform.adminEmail')} placeholder={t('platform.adminEmail')} value={adminEmail} onChange={(e) => setAdminEmail(e.target.value)} />
                  <Button size="sm" variant="ghost" type="submit">{t('platform.inviteAdmin')}</Button>
                </form>
                {invite && <InviteLinkBox email={invite.email} url={invite.url} emailed={invite.emailed} sentKey="platform.adminInvited" copyKey="platform.adminInviteCopy" />}
              </div>

              <div className="card form-stack">
                <h3 className="console-h3">{t('platform.statusTitle')}</h3>
                <label>
                  {t('platform.statusReason')}
                  <input value={reason} onChange={(e) => setReason(e.target.value)} />
                </label>
                <div className="row">
                  {STATUS_ACTIONS.filter((a) => a.status !== data.status).map((a) => (
                    <Button key={a.status} size="sm" variant={a.danger ? 'ghost' : 'solid'} disabled={a.needsReason && !reason.trim()} onClick={() => void changeStatus(a, data)}>
                      {t(a.label)}
                    </Button>
                  ))}
                </div>
              </div>

              <h3 className="console-h3">{t('platform.history')}</h3>
              {data.history.length === 0 ? (
                <p className="muted">{t('platform.historyEmpty')}</p>
              ) : (
                <ul className="console-list">
                  {data.history.map((h, i) => (
                    <li key={i}>
                      <span>{platformActionLabel(h.action)}</span>
                      <span className="muted"><bdi>{h.actorEmail ?? ''}</bdi> · {dualDateAr(h.at)}</span>
                      {typeof h.meta?.reason === 'string' && <span className="muted">{h.meta.reason}</span>}
                    </li>
                  ))}
                </ul>
              )}
            </>
          )
        }
      </LoadState>
    </section>
  )
}
