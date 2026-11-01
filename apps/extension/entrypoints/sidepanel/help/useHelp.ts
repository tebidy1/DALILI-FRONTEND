import { useCallback, useEffect, useRef, useState } from 'react'
import type { DaliliClient, GuideDetailsDto, HelpRequestDto, MyNoteDto, MyNotesDto } from '@dalili/shared'
import type { BgMsg, HelpOutMsg, HelpPick } from '@/lib/protocol'
import { activeTabHost } from '@/lib/active-tab'
import { t } from '@/lib/i18n'

/**
 * هـ ج١ (HLP) عقل «ما هذا؟» في اللوحة: يملك الوضع والجلب، ويستمع لرسائل الصفحة
 * (help-*)، ويوحّد الخروج — بزر، أو Esc، أو تبديل التبويب أو الحساب، أو إغلاق اللوحة.
 * الشريك يكتب الشرح هنا في اللوحة (لا في بطاقة داخل الصفحة) والزر المختار يبقى مُبرزًا.
 */

export type HelpApi = Pick<
  DaliliClient,
  'notes' | 'noteSteps' | 'myNotes' | 'createNote' | 'updateNote' | 'requestHelp' | 'helpRequests' | 'suspendGuide' | 'getGuide'
>

export type HelpMode = 'off' | 'ask' | 'author'

export interface HelpPublishInput {
  body: string
  guideId: string | null
  audience: 'all' | 'listed'
  companyIds: string[]
}

export function useHelp(api: HelpApi, accountKey: string | undefined, onOpenGuide: (id: string) => void) {
  const [mode, setMode] = useState<HelpMode>('off')
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)
  const [my, setMy] = useState<MyNotesDto | null>(null)
  const [requests, setRequests] = useState<HelpRequestDto[]>([])
  const [form, setForm] = useState<{ pick: HelpPick; note: MyNoteDto | null } | null>(null)
  const modeRef = useRef<HelpMode>('off')
  modeRef.current = mode
  /** مراجعة I1/I2: منفذ الحياة — انقطاعه (إغلاق اللوحة أو تدمير المستند) يُخبر الخلفية فتُطفئ الصفحة */
  const portRef = useRef<chrome.runtime.Port | null>(null)

  const openLifecyclePort = useCallback(() => {
    portRef.current?.disconnect()
    portRef.current = chrome.runtime.connect({ name: 'help-mode' })
  }, [])

  const closeLifecyclePort = useCallback(() => {
    portRef.current?.disconnect()
    portRef.current = null
  }, [])

  const toTab = useCallback((msgToTab: BgMsg) => {
    void chrome.runtime.sendMessage(msgToTab).catch(() => {})
  }, [])

  const off = useCallback(() => {
    closeLifecyclePort()
    setForm(null)
    setMsg('')
    setMode('off')
  }, [closeLifecyclePort])

  /** توحيد الخروج: إطفاء الصفحة ثم إعادة اللوحة */
  const exit = useCallback(() => {
    toTab({ t: 'help-tab', msg: { t: 'help-off' } })
    off()
  }, [toTab, off])

  /** الموظف يسأل: الشروح والخطوات معًا (قرار الخطة) — الصفحة بلا نظام تُقال بصدق */
  const ask = useCallback(async () => {
    setMsg('')
    setBusy(true)
    try {
      const host = await activeTabHost()
      const [notes, steps] = await Promise.all([api.notes(host), api.noteSteps(host)])
      if (!notes.system) {
        setMsg(t('ext.helpNotCompanySystem'))
        return
      }
      setMode('ask')
      toTab({ t: 'help-tab', msg: { t: 'help-on', mode: 'ask', notes: notes.notes, steps, canRequest: notes.canRequest } })
      openLifecyclePort()
    } catch {
      setMsg(t('ext.helpConnFail'))
    } finally {
      setBusy(false)
    }
  }, [api, toTab])

  /** الشريك يكتب: شروحه وأدلته وعملاؤه، وطلبات الشرح */
  const author = useCallback(async () => {
    setMsg('')
    setBusy(true)
    try {
      const host = await activeTabHost()
      const mine = await api.myNotes(host)
      if (!mine.system) {
        setMsg(t('ext.helpNotOurSystem'))
        return
      }
      setMy(mine)
      setMode('author')
      toTab({ t: 'help-tab', msg: { t: 'help-on', mode: 'author', notes: mine.notes } })
      openLifecyclePort()
      api.helpRequests().then(setRequests).catch(() => setRequests([]))
    } catch {
      setMsg(t('ext.helpConnFail'))
    } finally {
      setBusy(false)
    }
  }, [api, toTab])

  /** بعد نشر أو إيقاف: تُحدَّث شروح اللوحة وتُرسل النقاط للصفحة */
  const refreshMine = useCallback(async () => {
    const host = await activeTabHost()
    const mine = await api.myNotes(host).catch(() => null)
    if (mine) {
      setMy(mine)
      toTab({ t: 'help-tab', msg: { t: 'help-notes', notes: mine.notes } })
    }
  }, [api, toTab])

  /** «انشر»/«احفظ» — ثم يُعلن النشر وتُحدَّث النقاط في الصفحة */
  const publish = useCallback(
    async (pick: HelpPick, note: MyNoteDto | null, input: HelpPublishInput) => {
      setMsg('')
      setBusy(true)
      try {
        if (note) await api.updateNote(note.id, { body: input.body, guideId: input.guideId, audience: input.audience, companyIds: input.companyIds })
        else
          await api.createNote({
            systemId: my?.system?.id ?? '',
            anchor: pick.anchor,
            screenKey: pick.screenKey,
            label: pick.label,
            body: input.body,
            ...(input.guideId ? { guideId: input.guideId } : {}),
            audience: input.audience,
            ...(input.audience === 'listed' ? { companyIds: input.companyIds } : {}),
          })
        setMsg(t('ext.helpPublished'))
        setForm(null)
        await refreshMine()
      } catch (e) {
        setMsg(e instanceof Error ? e.message : t('ext.helpConnFail'))
      } finally {
        setBusy(false)
      }
    },
    [api, my, refreshMine],
  )

  /** «أوقف» — إعادة استعمال إيقاف الدليل القائم بسببه */
  const suspend = useCallback(
    async (note: MyNoteDto, reason: string) => {
      setMsg('')
      setBusy(true)
      try {
        await api.suspendGuide(note.id, reason)
        setForm(null)
        await refreshMine()
      } catch (e) {
        setMsg(e instanceof Error ? e.message : t('ext.helpConnFail'))
      } finally {
        setBusy(false)
      }
    },
    [api, refreshMine],
  )

  /** «دربني» من بطاقة الشرح — المسار نفسه الذي يسلكه زر القارئ: الدليل كاملًا بمراسي تدريبه */
  const startTrain = useCallback(
    async (guideId: string) => {
      try {
        const details: GuideDetailsDto = await api.getGuide(guideId)
        const ack = (await chrome.runtime
          .sendMessage({ t: 'train-start', guide: details.guide, hosts: details.trainHosts })
          .catch(() => null)) as { ok?: boolean } | null
        return !!ack?.ok
      } catch {
        return false
      }
    },
    [api],
  )

  /** رسائل الصفحة: اختيار الشريك، وطلب الموظف، وفتح الدليل، والخروج.
   *  تُسجَّل ما دام الوضع حيًّا فقط — لا مصدر لرسائل help-* والوضع مطفأ */
  useEffect(() => {
    if (mode === 'off') return
    const onMsg = (raw: unknown) => {
      const m = raw as HelpOutMsg
      if (m?.t === 'help-pick') {
        if (modeRef.current === 'author') {
          const note = my?.notes.find((n) => n.id === m.noteId) ?? null
          setForm({ pick: m.pick, note })
          setMsg('')
        }
        return
      }
      if (m?.t === 'help-request') {
        void (async () => {
          try {
            await api.requestHelp({ site: m.pick.site, screenKey: m.pick.screenKey, anchor: m.pick.anchor, label: m.pick.label })
            toTab({ t: 'help-tab', msg: { t: 'help-requested' } })
          } catch (e) {
            setMsg(e instanceof Error ? e.message : t('ext.helpConnFail'))
          }
        })()
        return
      }
      if (m?.t === 'help-open') {
        if (m.train) void startTrain(m.guideId)
        else onOpenGuide(m.guideId)
        return
      }
      if (m?.t === 'help-exit') off()
    }
    chrome.runtime.onMessage.addListener(onMsg)
    return () => chrome.runtime.onMessage.removeListener(onMsg)
  }, [mode, api, my, onOpenGuide, off, startTrain, toTab])

  /** تبديل التبويب النشط يطفئ الوضع — الإطار صار على صفحة لا نراها */
  useEffect(() => {
    if (mode === 'off') return
    const onActivated = () => exit()
    chrome.tabs.onActivated.addListener(onActivated)
    return () => chrome.tabs.onActivated.removeListener(onActivated)
  }, [mode, exit])

  /** تبديل الحساب يطفئ الوضع أيضًا */
  useEffect(() => {
    if (accountKey !== undefined && modeRef.current !== 'off') exit()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountKey])

  /** إغلاق اللوحة يطفئ الوضع في الصفحة — لا يبقى حاجب بلا لوحة */
  useEffect(
    () => () => {
      if (modeRef.current !== 'off') void chrome.runtime.sendMessage({ t: 'help-tab', msg: { t: 'help-off' } }).catch(() => {})
    },
    [],
  )

  return { mode, msg, busy, my, requests, form, ask, author, exit, publish, suspend }
}
