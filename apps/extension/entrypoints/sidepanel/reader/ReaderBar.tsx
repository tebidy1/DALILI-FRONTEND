import { useEffect, useRef, useState, type RefObject } from 'react'
import type { GuideDetailsDto, ShareInfoDto } from '@dalili/shared'
import { canTrain, shareAction, shareUrlFor, copyFailAr, publishFirstAr, trainFailAr } from '@/lib/reader'
import { t } from '@/lib/i18n'
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
    const ack = await deps.startTrain(guide).catch(() => ({ ok: false, errorAr: trainFailAr() }))
    setBusy('none')
    if (!ack.ok) setMsg(ack.errorAr || trainFailAr())
  }

  async function share() {
    if (!details || busy !== 'none') return
    setMsg('')
    const act = shareAction(details, deps.webBase)
    if (act.kind === 'publish-first') {
      deps.openTab(act.editorUrl)
      setMsg(publishFirstAr())
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
        setMsg(copyFailAr())
        return
      }
      setCopied(true)
      window.clearTimeout(copiedTimer.current)
      copiedTimer.current = window.setTimeout(() => setCopied(false), 2000)
    } catch (e) {
      setMsg(e instanceof Error && e.message ? e.message : copyFailAr())
    } finally {
      setBusy('none')
    }
  }

  return (
    <div className="reader-bar">
      <div className="reader-bar-row">
        <button ref={backRef} type="button" className="reader-back" aria-label={t('ext.backToList')} title={t('ext.backTitle')} onClick={onBack}>
          <BackIcon />
        </button>
        <span className="reader-bar-gap" />
        {guide && canTrain(guide) && (
          <button type="button" className="reader-train" disabled={busy !== 'none'} onClick={() => void train()}>
            <GuideMeIcon /> {busy === 'train' ? t('ext.trainPreparing') : t('ext.train')}
          </button>
        )}
        <button type="button" className="reader-copy" disabled={!details || busy !== 'none'} onClick={() => void share()}>
          <LinkIcon /> {copied ? t('ext.copied') : busy === 'share' ? t('ext.copyPreparing') : t('ext.copyLink')}
        </button>
      </div>
      {msg && <div className="reader-msg" role="status">{msg}</div>}
    </div>
  )
}
