import { useMemo, useState } from 'react'
import type { MemberDto, TeamDto } from '@dalili/shared'
import { client } from '../api'
import { Button } from '../ui/Button'
import { t } from '../i18n'
import { arDigits, nameOrEmail } from '../lib/format'
import { useConfirm } from '../components/ConfirmProvider'

/**
 * منصة الشركة أ٢ (ORG-01/02): لوحة الأقسام للمدير — أب بمستوى واحد، ومدراء القسم،
 * والأرشفة هي الطريق العادي (المبدأ ٥). الحذف لقسم فارغ أُنشئ خطأً فقط. القواعد
 * يحسمها الخادم، واللوحة تخفي ما سيُرفض وتعرض سبب الرفض كما جاء.
 */

interface Props {
  /** كل الأقسام ومنها المؤرشفة */
  teams: TeamDto[]
  members: MemberDto[]
  onTeamsChange: (teams: TeamDto[]) => void
}

/** الرئيسية بالأبجدية، وكل فرع يلي أباه */
function treeOrder(live: TeamDto[]): TeamDto[] {
  const byName = (a: TeamDto, b: TeamDto) => a.name.localeCompare(b.name, 'ar')
  const ids = new Set(live.map((d) => d.id))
  // فرع أبوه مؤرشف يُعرض رئيسياً كي لا يختفي
  const isRoot = (d: TeamDto) => !d.parentId || !ids.has(d.parentId)
  return live.filter(isRoot).sort(byName).flatMap((root) => [root, ...live.filter((d) => d.parentId === root.id).sort(byName)])
}

export function DepartmentsPanel({ teams, members, onTeamsChange }: Props) {
  const confirm = useConfirm()
  const [name, setName] = useState('')
  const [parentId, setParentId] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const live = useMemo(() => treeOrder(teams.filter((d) => !d.archivedAt)), [teams])
  const archived = teams.filter((d) => d.archivedAt)
  const roots = live.filter((d) => !d.parentId)
  const hasChildren = (d: TeamDto) => live.some((c) => c.parentId === d.id)
  const labelOf = (id: string) => {
    const m = members.find((x) => x.id === id)
    return m ? nameOrEmail(m) : id
  }
  const activeMembers = members.filter((m) => m.status !== 'deactivated')

  /** نداء واحد لكل فعل: يرسل، ويستبدل القسم بالرد، ويعلن النتيجة أو سبب الرفض */
  async function run(call: () => Promise<TeamDto>, okNotice?: (d: TeamDto) => string) {
    setError('')
    setNotice('')
    try {
      const updated = await call()
      const exists = teams.some((d) => d.id === updated.id)
      onTeamsChange(exists ? teams.map((d) => (d.id === updated.id ? updated : d)) : [...teams, updated])
      if (okNotice) setNotice(okNotice(updated))
      return true
    } catch (err) {
      setError((err as Error)?.message || t('team.actionError'))
      return false
    }
  }

  async function create(e: React.FormEvent) {
    e.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) return
    if (await run(() => client.createTeam(trimmed, parentId || null))) {
      setName('')
      setParentId('')
    }
  }

  const setManagers = (d: TeamDto, ids: string[]) => run(() => client.setTeamManagers(d.id, ids))

  async function remove(d: TeamDto) {
    if (!(await confirm({ title: t('dept.delete'), body: t('dept.deleteConfirm', { name: d.name }), danger: true }))) return
    setError('')
    try {
      await client.deleteTeam(d.id)
      onTeamsChange(teams.filter((x) => x.id !== d.id))
    } catch (err) {
      setError((err as Error)?.message || t('team.actionError'))
    }
  }

  return (
    <section className="dept-panel" aria-labelledby="dept-title">
      <h2 id="dept-title" className="dept-title">{t('dept.title')}</h2>
      {error && <div className="err" role="alert">{error}</div>}
      {notice && <div className="ok-note" role="status">{notice}</div>}

      {live.length === 0 ? (
        <p className="muted">{t('dept.empty')}</p>
      ) : (
        <ul className="dept-list" aria-label={t('dept.title')}>
          {live.map((d) => {
            const child = !!d.parentId && roots.some((r) => r.id === d.parentId)
            const managerIds = d.managerIds ?? []
            const candidates = activeMembers.filter((m) => !managerIds.includes(m.id))
            const empty = d.memberCount === 0 && managerIds.length === 0 && !hasChildren(d)
            return (
              <li key={d.id} aria-label={d.name} className={`dept-row${child ? ' dept-child' : ''}`}>
                <div className="dept-head">
                  <span className="dept-name"><bdi>{d.name}</bdi></span>
                  <span className="muted">{d.memberCount ? t('dept.members', { count: arDigits(d.memberCount) }) : t('dept.noMembers')}</span>
                </div>
                <div className="row dept-controls">
                  <select
                    aria-label={t('dept.parentA11y', { name: d.name })}
                    value={d.parentId ?? ''}
                    disabled={hasChildren(d)}
                    title={hasChildren(d) ? t('dept.parentLocked') : undefined}
                    onChange={(e) => void run(() => client.updateTeam(d.id, { parentId: e.target.value || null }))}
                  >
                    <option value="">{t('dept.noParent')}</option>
                    {roots.filter((r) => r.id !== d.id).map((r) => (
                      <option key={r.id} value={r.id}>{r.name}</option>
                    ))}
                  </select>
                  <span className="dept-managers" role="group" aria-label={t('dept.managers')}>
                    {managerIds.map((id) => (
                      <span className="chip" key={id}>
                        <bdi>{labelOf(id)}</bdi>
                        <button
                          type="button"
                          className="af-x"
                          aria-label={t('dept.removeManager', { email: labelOf(id), name: d.name })}
                          onClick={() => void setManagers(d, managerIds.filter((x) => x !== id))}
                        >
                          ✕
                        </button>
                      </span>
                    ))}
                    {candidates.length > 0 && (
                      <select
                        aria-label={t('dept.addManagerA11y', { name: d.name })}
                        value=""
                        onChange={(e) => e.target.value && void setManagers(d, [...managerIds, e.target.value])}
                      >
                        <option value="">{t('dept.addManager')}</option>
                        {candidates.map((m) => (
                          <option key={m.id} value={m.id}>{nameOrEmail(m)}</option>
                        ))}
                      </select>
                    )}
                  </span>
                  <Button size="sm" variant="ghost" onClick={() => void run(() => client.archiveTeam(d.id), (x) => t('dept.archivedNote', { name: x.name }))}>
                    {t('dept.archive')}
                  </Button>
                  {empty && (
                    <button type="button" className="af-x" aria-label={t('dept.deleteA11y', { name: d.name })} onClick={() => void remove(d)}>
                      ✕
                    </button>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      )}

      <form className="row dept-new" onSubmit={create}>
        <input aria-label={t('dept.newName')} placeholder={t('dept.newName')} value={name} onChange={(e) => setName(e.target.value)} />
        <select aria-label={t('dept.newParent')} value={parentId} onChange={(e) => setParentId(e.target.value)}>
          <option value="">{t('dept.noParent')}</option>
          {roots.map((r) => (
            <option key={r.id} value={r.id}>{r.name}</option>
          ))}
        </select>
        <Button size="sm" variant="ghost" type="submit">{t('dept.create')}</Button>
      </form>

      {archived.length > 0 && (
        <details className="dept-archived">
          <summary>{t('dept.archivedTitle', { count: arDigits(archived.length) })}</summary>
          <ul>
            {archived.map((d) => (
              <li key={d.id} className="row">
                <bdi>{d.name}</bdi>
                <Button size="sm" variant="ghost" aria-label={t('dept.unarchiveA11y', { name: d.name })} onClick={() => void run(() => client.unarchiveTeam(d.id))}>
                  {t('dept.unarchive')}
                </Button>
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  )
}
