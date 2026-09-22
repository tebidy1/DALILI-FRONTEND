import { useEffect, useMemo, useState } from 'react'
import type { AssignTargetDto, MemberDto, TeamDto } from '@dalili/shared'
import { client } from '../api'
import { t } from '../i18n'

/**
 * ASG: حوار الإسناد — شخص / فريق (عدة فرق) / كل الشركة، مع ملاحظة اختيارية.
 * إن كان الدليل خاصًّا يظهر تحذير أن المستهدَفين سيُمنحون حق القراءة (قائمة الفحص).
 * يبني targets[] ويستدعي client.assignGuide. مكوّن ≤٢٥٠ سطرًا.
 */

type Mode = 'user' | 'team' | 'workspace'

interface Props {
  guideId: string
  isPrivate: boolean
  onClose: () => void
  onDone?: () => void
}

export function AssignDialog({ guideId, isPrivate, onClose, onDone }: Props) {
  const [mode, setMode] = useState<Mode>('user')
  const [members, setMembers] = useState<MemberDto[]>([])
  const [teams, setTeams] = useState<TeamDto[]>([])
  const [pickedUsers, setPickedUsers] = useState<Set<string>>(new Set())
  const [pickedTeams, setPickedTeams] = useState<Set<string>>(new Set())
  const [note, setNote] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    client.getTeamMembers().then(setMembers).catch(() => setMembers([]))
    client.listTeams().then(setTeams).catch(() => setTeams([]))
  }, [])

  const targets = useMemo<AssignTargetDto[]>(() => {
    if (mode === 'workspace') return [{ kind: 'workspace', id: '*' }]
    if (mode === 'team') return [...pickedTeams].map((id) => ({ kind: 'team', id }))
    return [...pickedUsers].map((id) => ({ kind: 'user', id }))
  }, [mode, pickedTeams, pickedUsers])

  function toggle(set: Set<string>, id: string, apply: (s: Set<string>) => void) {
    const next = new Set(set)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    apply(next)
  }

  async function submit() {
    if (targets.length === 0) {
      setError(t('assign.pickTarget'))
      return
    }
    setBusy(true)
    setError('')
    try {
      await client.assignGuide(guideId, targets, note.trim() || '')
      onDone?.()
      onClose()
    } catch {
      setError(t('assign.pickTarget'))
      setBusy(false)
    }
  }

  const tabs: { key: Mode; label: string }[] = [
    { key: 'user', label: t('assign.tabUser') },
    { key: 'team', label: t('assign.tabTeam') },
    { key: 'workspace', label: t('assign.tabWorkspace') },
  ]

  return (
    <div className="palette-backdrop" onClick={onClose}>
      <div className="palette assign-dialog" role="dialog" aria-modal="true" aria-label={t('assign.title')} onClick={(e) => e.stopPropagation()}>
        <div className="dialog-head">
          <h2>{t('assign.title')}</h2>
        </div>

        <div className="assign-tabs" role="tablist">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              type="button"
              role="tab"
              aria-selected={mode === tab.key}
              className={`assign-tab${mode === tab.key ? ' sel' : ''}`}
              onClick={() => {
                setMode(tab.key)
                setError('')
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="assign-body">
          {mode === 'user' && (
            <ul className="assign-picker">
              {members.map((m) => (
                <li key={m.id}>
                  <button
                    type="button"
                    className={`assign-opt${pickedUsers.has(m.id) ? ' sel' : ''}`}
                    aria-pressed={pickedUsers.has(m.id)}
                    onClick={() => toggle(pickedUsers, m.id, setPickedUsers)}
                    dir="auto"
                  >
                    {m.email}
                  </button>
                </li>
              ))}
            </ul>
          )}
          {mode === 'team' && (
            <ul className="assign-picker">
              {teams.map((tm) => (
                <li key={tm.id}>
                  <button
                    type="button"
                    className={`assign-opt${pickedTeams.has(tm.id) ? ' sel' : ''}`}
                    aria-pressed={pickedTeams.has(tm.id)}
                    onClick={() => toggle(pickedTeams, tm.id, setPickedTeams)}
                    dir="auto"
                  >
                    {tm.name}
                  </button>
                </li>
              ))}
            </ul>
          )}
          {mode === 'workspace' && <p className="assign-ws-note">{t('assign.pickWorkspace')}</p>}

          <label className="assign-note-label">
            <span>{t('assign.note')}</span>
            <textarea
              className="assign-note-input"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={t('assign.notePlaceholder')}
              dir="auto"
              rows={2}
            />
          </label>

          {isPrivate && <p className="assign-private-warn" role="note">{t('assign.privateWarn')}</p>}
          {error && <p className="assign-error" role="alert">{error}</p>}
        </div>

        <div className="dialog-actions">
          <button type="button" className="btn primary" onClick={submit} disabled={busy}>
            {t('assign.submit')}
          </button>
          <button type="button" className="btn" onClick={onClose}>
            {t('booklet.shareCheckCancel')}
          </button>
        </div>
      </div>
    </div>
  )
}
