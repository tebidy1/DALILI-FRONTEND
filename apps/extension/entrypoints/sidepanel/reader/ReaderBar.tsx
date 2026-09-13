import { useEffect, useRef, useState, type RefObject } from 'react'
import type { GuideDetailsDto, ShareInfoDto } from '@dalili/shared'
import { canTrain, shareAction, shareUrlFor, COPY_FAIL_AR, PUBLISH_FIRST_AR, TRAIN_FAIL_AR } from '@/lib/reader'
import { BackIcon, GuideMeIcon, LinkIcon } from '../icons'
import type { ReaderDeps } from './GuideReader'

/** PNL-01: الشريط الثابت — رجوع · «دربني» · «نسخ الرابط» (بلا تجديد رمز قائم أبدًا) */
export function ReaderBar({
  details,
  deps,
  backRef,
  onBack,
  onShareCreated,
}: {
  details: GuideDetailsDto | undefined
  deps: ReaderDeps
  backRef: RefObject<HTMLButtonElement | null>
  onBack: () => void
  onShareCreated: (share: ShareInfoDto) => void
}) {
  const [busy, setBusy] = useState<'none' | 'train' | 'share'>('none')
  const [copied, setCopied] = useState(false)
  const [msg, setMsg] = useState('')
  const copiedTimer = useRef<number | undefined>(undefined)
  useEffect(() => () => window.clearTimeout(copiedTimer.current), [])

  const guide = details?.guide

  async function train() {
    if (!guide || busy !== 'none') return
    setBusy('train')
    setMsg('')
    const ack = await deps.startTrain(guide).catch(() => ({ ok: false, errorAr: TRAIN_FAIL_AR }))
    setBusy('none')
    if (!ack.ok) setMsg(ack.errorAr || TRAIN_FAIL_AR)
  }

  async function share() {
    if (!details || busy !== 'none') return
    setMsg('')
    const act = shareAction(details, deps.webBase)
    if (act.kind === 'publish-first') {
      deps.openTab(act.editorUrl)
      setMsg(PUBLISH_FIRST_AR)
      return
    }
    setBusy('share')
    try {
      let url: string
      if (act.kind === 'copy') url = act.url
      else {
        const created = await deps.createShare(details.guide.id)
        onShareCreated(created)
        url = shareUrlFor(created.token, deps.webBase)
      }
      try {
        await deps.copyText(url)
      } catch {
        setMsg(COPY_FAIL_AR)
        return
      }
      setCopied(true)
      window.clearTimeout(copiedTimer.current)
      copiedTimer.current = window.setTimeout(() => setCopied(false), 2000)
    } catch (e) {
      setMsg(e instanceof Error && e.message ? e.message : COPY_FAIL_AR)
    } finally {
      setBusy('none')
    }
  }

  return (
    <div className="reader-bar">
      <div className="reader-bar-row">
        <button ref={backRef} type="button" className="reader-back" aria-label="رجوع إلى القائمة" title="رجوع (Esc)" onClick={onBack}>
          <BackIcon />
        </button>
        <span className="reader-bar-gap" />
        {guide && canTrain(guide) && (
          <button type="button" className="reader-train" disabled={busy !== 'none'} onClick={() => void train()}>
            <GuideMeIcon /> {busy === 'train' ? 'يجهّز…' : 'دربني'}
          </button>
        )}
        <button type="button" className="reader-copy" disabled={!details || busy !== 'none'} onClick={() => void share()}>
          <LinkIcon /> {copied ? 'نُسخ ✓' : busy === 'share' ? 'يجهّز الرابط…' : 'نسخ الرابط'}
        </button>
      </div>
      {msg && <div className="reader-msg" role="status">{msg}</div>}
    </div>
  )
}
