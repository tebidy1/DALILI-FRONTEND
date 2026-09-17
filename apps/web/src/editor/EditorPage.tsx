import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { canAddBlock, canAddEmbed, embedIdsOf, DEFAULT_MARK_COLOR, extractCapturedSites, markShapeOf, mergeSteps, stepNumbers, suggestSimilarBlur, scaleRelativeRect, toMarkdown, type MarkColor, type MarkShape, type Rect, type RelativeRect, type TargetMark } from '@dalili/core'
import { buildRichHtml } from '../lib/rich-copy'
import type { ShareInfoDto, StepDto, GuideDto, StepCommentDto } from '@dalili/shared'
import { client } from '../api'
import { createHistory, type History } from '../lib/history'
import { requestTrainStartGuide } from '../lib/ext-bridge'
import { StepCard, type ZoomCommand } from '../components/StepCard'
import { ToolRail } from './ToolRail'
import { BulkBar } from './BulkBar'
import { UrlReplaceDialog } from './UrlReplaceDialog'
import { moveTo } from './reorder'
import { DEFAULT_TOOL, type EditorTool } from './tools'
import {
  emptySelection,
  isPicked,
  rangeSelect,
  selectAll,
  toggleSelect,
  type Selection,
} from '../lib/selection'
import { GuideComments } from '../components/GuideComments'
import { InsertStep, type InsertKind } from '../components/InsertStep'
import { ShareDialog } from '../components/ShareDialog'
import { MoreMenu, type MoreMenuItem } from '../components/MoreMenu'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { useConfirm } from '../components/ConfirmProvider'
import { VersionHistoryPanel } from './VersionHistoryPanel'
import { Button } from '../ui/Button'
import { StateView } from '../ui/StateView'
import { SkeletonScreen } from '../ui/Skeleton'
import {
  IconArrowRight,
  IconBookOpen,
  IconCheck,
  IconCloudOff,
  IconClock,
  IconCopy,
  IconExternalLink,
  IconEye,
  IconFolder,
  IconGlobe,
  IconList,
  IconNumber,
  IconPencil,
  IconShare,
  IconTarget,
  IconTrash,
  IconWand,
} from '../ui/icons'
import { durationAr, guideDurationMs, hostOf, ownerNameFromEmail, relativeTimeAr } from '../lib/format'
import { t } from '../i18n'
import { GuideStepList } from './GuideStepList'
import { BookletBlockList } from './BookletBlockList'
import { EmbedPicker } from './EmbedPicker'
import { newBlockStep, type BlockInsertKind } from './booklet-insert'

type SaveState = 'saved' | 'dirty' | 'saving' | 'error'

/** معرّف خطوة جديد — crypto إن توفّر وإلا بديل زمني (نفس نمط معرّف الشرح) */
function newStepId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return `s_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

export function EditorPage({ trainAckTimeoutMs }: { trainAckTimeoutMs?: number }) {
  const { id } = useParams<{ id: string }>()
  const location = useLocation()
  const confirm = useConfirm()
  const [guide, setGuide] = useState<GuideDto | null>(null)
  const [share, setShare] = useState<ShareInfoDto | null>(null)
  // بوابة النشر قبل الرابط (قرار المالك 2026-09-10): غياب الحالة (خادم قديم) = بلا بوابة
  const [published, setPublished] = useState(true)
  // شريط المسودة: انتظار النشر يمنع النقر المزدوج (قرار المالك 2026-09-11)
  const [publishingBar, setPublishingBar] = useState(false)
  // المرحلة ٤: «تم» تصنع نقطة استعادة — تلميح مطمئن أول ٣ مرات فقط (قرار المالك)
  const [doneHint, setDoneHint] = useState(false)
  const doneHintTimer = useRef<number | undefined>(undefined)
  const [loadError, setLoadError] = useState('')
  /** وضعا العرض/التعديل — يُفتح الدليل على العرض النظيف، والتحرير باختيار صريح */
  const [editMode, setEditMode] = useState(false)
  /**
   * S1: الأداة واللون حالة **عالمية** هنا لا داخل كل بطاقة. كانت الشكوى:
   * «أزرار التعديل تعمل على كل زر على حده» — فطمس ثلاث لقطات كان ثلاث نقرات
   * في ثلاثة أماكن. الآن تُختار الأداة مرة من العمود وتسري على الدليل كله.
   */
  const [tool, setTool] = useState<EditorTool>(DEFAULT_TOOL)
  const [markColor, setMarkColor] = useState<MarkColor>(DEFAULT_MARK_COLOR)
  /**
   * طلب المالك 2026-09-04 (تجربة وورد): **شكل هدف واحد نشط** في المحرر كله —
   * نُقر عليه في لقطته فصار هو مخاطَب لوحة الألوان ومبدّل الشكل. معرّف الخطوة
   * لا فهرسها: الحذف وإعادة الترتيب لا ينقلان التنشيط إلى شكلٍ آخر بالخطأ.
   */
  const [activeMark, setActiveMark] = useState<string | null>(null)
  // BKL-01: موضع انتظار اختيار الدليل المضمّن — null يعني لا منتقي مفتوحًا
  const [pickEmbedAt, setPickEmbedAt] = useState<number | null>(null)
  /** أمر المنظار الأخير — البطاقات تنفّذه عند تغيّر `seq` لا عند كل رسم */
  const [zoomCmd, setZoomCmd] = useState<ZoomCommand | null>(null)
  /**
   * S5: التحديد المتعدد — المنطق نفسه الذي تستعمله المكتبة (`lib/selection.ts`)
   * لا نسخة ثانية تتباعد عنه: مرصاد واحد، ومدى Shift يتبع ترتيب العرض.
   */
  const [sel, setSel] = useState<Selection>(emptySelection())
  /** فهرس البطاقة المسحوبة الآن — `null` يعني لا سحب جاريًا */
  const [dragFrom, setDragFrom] = useState<number | null>(null)
  const [shareOpen, setShareOpen] = useState(false)
  /** بريد المالك لصف البيانات — تجميلي، فشله صامت */
  const [ownerEmail, setOwnerEmail] = useState('')
  const [reloadSeq, setReloadSeq] = useState(0)
  const [save, setSave] = useState<SaveState>('saved')
  const [tags, setTags] = useState('')
  const [tagsState, setTagsState] = useState<'idle' | 'saved' | 'error'>('idle')
  const [copiedHtml, setCopiedHtml] = useState(false)
  const [transcribing, setTranscribing] = useState(false)
  const [training, setTraining] = useState(false)
  const [trainMsg, setTrainMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)
  const [transcribeMsg, setTranscribeMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)
  const [sttFailed, setSttFailed] = useState(false)
  // VER-01/02: قائمة «المزيد» + حذف داخل الصفحة + سجل الإصدارات
  const [askDelete, setAskDelete] = useState(false)
  const [deleteBusy, setDeleteBusy] = useState(false)
  const [deleteError, setDeleteError] = useState('')
  // طلب المالك 2026-09-09: مبدّل «إظهار الأرقام» في قائمة «المزيد» — شارة رقم قرب علامة الهدف، مفعّل افتراضيًا
  const [showNums, setShowNums] = useState(true)
  const [versionsOpen, setVersionsOpen] = useState(false)
  const [versionMsg, setVersionMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)
  const [snapshotting, setSnapshotting] = useState(false)
  const navigate = useNavigate()
  // GM-05: تعليقات الخطوات — المالك يرى أسئلة الضيوف ويردّ ويسمّي محلولًا من هنا
  const [comments, setComments] = useState<StepCommentDto[]>([])
  const [commentsFailed, setCommentsFailed] = useState(false)
  const [commentsSeq, setCommentsSeq] = useState(0)
  const skipFirstSave = useRef(true)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const historyRef = useRef<History<GuideDto>>(createHistory<GuideDto>())
  // المرحلة ١: عدّاد إصدار المكدس — الأزرار تحتاج إعادة رسم عند كل دفع/تراجع
  const [histVer, setHistVer] = useState(0)

  const retry = useCallback(() => {
    setLoadError('')
    setGuide(null)
    setReloadSeq((s) => s + 1)
  }, [])

  /** دربني متاح فقط حين تحمل خطوة بطاقة تعريف (AUTO-01) — الأدلة القديمة بلا زر */
  const trainable = useMemo(() => !!guide?.steps.some((st) => st.target?.anchor?.length), [guide])

  /** استخراج المواقع والتطبيقات الملتقطة لشريط الشارات */
  const capturedSites = useMemo(() => (guide ? extractCapturedSites(guide.steps) : []), [guide])

  /** دربني من المحرر: الدليل الحالي كاملًا بمراسيه عبر الجسر — تجربة بلا مشاركة */
  async function startTrain() {
    if (!guide || training) return
    setTraining(true)
    setTrainMsg(null)
    const res = await requestTrainStartGuide(guide, trainAckTimeoutMs)
    setTraining(false)
    if (res.ok) setTrainMsg({ kind: 'ok', text: t('editor.trainStarted') })
    else setTrainMsg({ kind: 'err', text: res.errorAr || t('viewer.trainNoExt') })
  }

  /** التفريغ التلقائي (قرار المالك) فشل بعد النشر → لافتة صادقة تُرى مرة، وزر المحرر هو إعادة المحاولة */
  useEffect(() => {
    if (new URLSearchParams(location.search).get('stt') !== 'failed') return
    setSttFailed(true)
    // نظّف رابط المتصفح إن حمل المعيار حتى لا تصمد اللافتة عبر تحديث
    if (window.location.search) window.history.replaceState(null, '', window.location.pathname)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- قراءة إقلاعية واحدة
  }, [])

  useEffect(() => {
    if (!id) return
    const ac = new AbortController()
    client
      .getGuide(id, ac.signal)
      .then((d) => {
        setGuide(d.guide)
        setShare(d.share)
        setPublished(d.visibility !== 'private')
        // LIB-03: الوسوم من بيانات التنظيم — لا تُلمس بالحفظ التلقائي للمحتوى
        if (d.meta) setTags(d.meta.tags.join('، '))
        // EDT-10: الحالة المحمَّلة هي قاعدة التراجع — أول دفعة في المكدس
        historyRef.current.push(d.guide)
      })
      .catch((err) => {
        if (err instanceof DOMException && err.name === 'AbortError') return
        setLoadError(t('editor.loadError'))
      })
    return () => ac.abort()
  }, [id, reloadSeq])

  /** هوية المالك لصف بيانات الترويسة — تجميلية بحتة، لا تُسقط المحرر عند الفشل */
  useEffect(() => {
    if (typeof client.me !== 'function') return
    let live = true
    client
      .me()
      .then((m) => {
        if (live && m) setOwnerEmail(m.email)
      })
      .catch(() => {})
    return () => {
      live = false
    }
  }, [])

  /** GM-05: تعليقات الخطوات — قناة مستقلة كي لا يعطّل فشلها فتح المحرر نفسه */
  useEffect(() => {
    if (!id) return
    const ac = new AbortController()
    setCommentsFailed(false)
    client
      .guideComments(id, ac.signal)
      .then((d) => setComments(d.comments))
      .catch((err) => {
        if (err instanceof DOMException && err.name === 'AbortError') return
        setCommentsFailed(true)
      })
    return () => ac.abort()
  }, [id, commentsSeq])

  /** GM-05: إضافة/رد/تعديل/وسم/حذف — كلها تحدّث القائمة موضعيًا بعد نجاح الخادم */
  async function addComment(body: string, opts: { kind: 'issue' | 'note'; parentId?: string }) {
    if (!id) return
    const { comment } = await client.addGuideComment(id, { kind: opts.kind, body, parentId: opts.parentId })
    setComments((cs) => [...cs, comment])
  }

  async function editComment(cid: string, body: string) {
    if (!id) return
    const { comment } = await client.updateGuideComment(id, cid, { body })
    setComments((cs) => cs.map((c) => (c.id === comment.id ? comment : c)))
  }

  async function resolveComment(cid: string, resolved: boolean) {
    if (!id) return
    const { comment } = await client.updateGuideComment(id, cid, { resolved })
    setComments((cs) => cs.map((c) => (c.id === comment.id ? comment : c)))
  }

  async function deleteComment(cid: string) {
    if (!id) return
    await client.deleteGuideComment(id, cid)
    setComments((cs) => cs.filter((c) => c.id !== cid && c.parentId !== cid))
  }

  /** حفظ الوسوم صراحةً — منفصل تمامًا عن الحفظ التلقائي للمحتوى */
  async function saveTags() {
    if (!id) return
    const list = tags
      .split(/[،,]/)
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 10)
    try {
      await client.updateGuideMeta(id, { tags: list })
      setTagsState('saved')
      setTimeout(() => setTagsState('idle'), 2000)
    } catch {
      setTagsState('error')
    }
  }

  /** حفظ تلقائي debounce 800ms — لا يكتب فوق تحرير المستخدم */
  useEffect(() => {
    if (!guide || !id) return
    if (skipFirstSave.current) {
      skipFirstSave.current = false
      return
    }
    setSave('dirty')
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(async () => {
      setSave('saving')
      try {
        await client.updateGuide(id, guide)
        setSave('saved')
      } catch {
        setSave('error')
      }
    }, 800)
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current)
    }
  }, [guide, id])

  /**
   * EDT-10: كل تعديل يمر من هنا — الدفع للمكدس مع مفتاح دمج لسلاسل الكتابة
   * فتعود الكتابة المتصلة بتراجعة واحدة، والطمس/القص/الحذف دفعات مستقلة.
   */
  const commit = useCallback((mutate: (g: GuideDto) => GuideDto, coalesceKey?: string) => {
    setGuide((g) => {
      if (!g) return g
      const next = mutate(g)
      historyRef.current.push(next, coalesceKey)
      return next
    })
    setHistVer((v) => v + 1)
  }, [])

  /** المرحلة ١: زرا التراجع/الإعادة — نفس مكدس الاختصار، وتعطّلان حين لا ماضٍ/مستقبل.
   *  كل دفع/تراجع يرفع histVer فيُعيد الرسم فتُقرأ الحالة من المرجع مباشرة */
  const canUndo = historyRef.current.canUndo()
  const canRedo = historyRef.current.canRedo()

  const doUndo = useCallback(() => {
    const next = historyRef.current.undo()
    if (next) {
      setGuide(next)
      setHistVer((v) => v + 1)
    }
  }, [])

  const doRedo = useCallback(() => {
    const next = historyRef.current.redo()
    if (next) {
      setGuide(next)
      setHistVer((v) => v + 1)
    }
  }, [])

  const updateStep = useCallback(
    (idx: number, patch: Partial<StepDto>) => {
      const key = patch.title !== undefined ? `title:${idx}` : patch.note !== undefined ? `note:${idx}` : patch.alt !== undefined ? `alt:${idx}` : undefined
      commit(
        (g) => ({ ...g, steps: g.steps.map((s, i) => (i === idx ? { ...s, ...patch } : s)) }),
        key,
      )
    },
    [commit],
  )

  const moveStep = useCallback(
    (idx: number, dir: -1 | 1) => {
      commit((g) => {
        const j = idx + dir
        if (j < 0 || j >= g.steps.length) return g
        const steps = [...g.steps]
        const [moved] = steps.splice(idx, 1)
        steps.splice(j, 0, moved!)
        return { ...g, steps }
      })
    },
    [commit],
  )

  const removeStep = useCallback(
    (idx: number) => {
      commit((g) => ({ ...g, steps: g.steps.filter((_, i) => i !== idx) }))
    },
    [commit],
  )

  /**
   * S6: تكرار خطوة — نسخة بمعرّف جديد تُدرج بعدها مباشرة. النسخ سطحي عمدًا:
   * كل مسارات التعديل (طمس/شرح/قص/نقل الهدف) تبني كائن لقطة جديدًا ولا تعدّل
   * في مكانه، فالنسختان لا تتشاركان تعديلًا. ودفعة `commit` واحدة = تراجع واحد.
   */
  const duplicateStep = useCallback(
    (idx: number) => {
      commit((g) => {
        const src = g.steps[idx]
        if (!src) return g
        const steps = [...g.steps]
        steps.splice(idx + 1, 0, { ...src, id: newStepId() })
        return { ...g, steps }
      })
    },
    [commit],
  )

  /**
   * S3: نقل إطار الهدف. اللقطة بلا `mark` هي لقطة قديمة إطارها **محروق في
   * البكسل** وقت الالتقاط، فلا شيء هنا يُحرَّك — تُترك كما هي بلا ادّعاء نجاح.
   */
  const setMark = useCallback(
    (idx: number, rect: Rect) => {
      commit((g) => ({
        ...g,
        steps: g.steps.map((s, i) => {
          if (i !== idx) return s
          const shot = s.screenshot
          if (!shot || 'missing' in shot || !shot.mark) return s
          return { ...s, screenshot: { ...shot, mark: { ...shot.mark, rect } } }
        }),
      }))
    },
    [commit],
  )

  /**
   * طلب المالك 2026-09-04: يعدّل إطار الخطوة المنشَّطة وحدها (لونًا أو شكلًا)
   * بلا حاجة إلى تحديد بطاقتها — الشكل النشط هو المخاطَب. اللقطة بلا `mark`
   * إطارها محروق في البكسل فلا شيء يُغيَّر فيها: تُترك بلا ادّعاء نجاح.
   */
  const patchActiveMark = useCallback(
    (patch: Partial<TargetMark>) => {
      if (!activeMark) return
      commit((g) => ({
        ...g,
        steps: g.steps.map((s) => {
          if (s.id !== activeMark) return s
          const shot = s.screenshot
          if (!shot || 'missing' in shot || !shot.mark) return s
          return { ...s, screenshot: { ...shot, mark: { ...shot.mark, ...patch } } }
        }),
      }))
    },
    [commit, activeMark],
  )

  /** شكل الإطار النشط — غيابه يخفي مبدّل الشكل من الشريط (لا شكل نشط) */
  const activeMarkShape = useMemo(() => {
    if (!activeMark || !guide) return undefined
    const shot = guide.steps.find((s) => s.id === activeMark)?.screenshot
    if (!shot || 'missing' in shot || !shot.mark) return undefined
    return markShapeOf(shot.mark)
  }, [activeMark, guide])

  /** لون الشريط: يضبط حبر الأدوات القادمة، ويلوّن الشكل النشط فورًا إن وُجد */
  const pickColor = useCallback(
    (c: MarkColor) => {
      setMarkColor(c)
      patchActiveMark({ color: c })
    },
    [patchActiveMark],
  )

  /** ترتيب الخطوات المعروض — مرجع مدى Shift+Click و«تحديد الكل» معًا */
  const orderedIds = useMemo(() => guide?.steps.map((s) => s.id) ?? [], [guide])

  /** S5: إفلات بطاقة في موضع جديد — الحساب في `reorder.ts` النقي لا هنا */
  const moveStepTo = useCallback(
    (from: number, to: number) => commit((g) => ({ ...g, steps: moveTo(g.steps, from, to) })),
    [commit],
  )

  /** نقر مربّع التحديد: Shift يمدّ المدى من المرصاد، والنقر العادي يبدّل واحدة */
  const pickStep = useCallback(
    (stepId: string, shift: boolean) => {
      setSel((s) => (shift ? rangeSelect(s, stepId, orderedIds) : toggleSelect(s, stepId)))
    },
    [orderedIds],
  )

  /** حذف كل المحدَّد بدفعة `commit` واحدة — تراجعة واحدة تعيدها جميعًا */
  const removeSelected = useCallback(() => {
    commit((g) => ({ ...g, steps: g.steps.filter((s) => !sel.ids.includes(s.id)) }))
    setSel(emptySelection())
  }, [commit, sel])

  /** تكرار كل محدَّدة بعدها مباشرة — معرّف جديد لكل نسخة، ودفعة واحدة */
  const duplicateSelected = useCallback(() => {
    commit((g) => ({
      ...g,
      steps: g.steps.flatMap((s) => (sel.ids.includes(s.id) ? [s, { ...s, id: newStepId() }] : [s])),
    }))
  }, [commit, sel])

  /**
   * EDT-06: زر «دمج» يظهر عند تحديد متجاورين فقط — النقر يدمجهما بتراجع واحد.
   * الدمج النقي في core يرمي على غير المتجاورين، والزر لا يظهر أصلًا حينها.
   */
  const adjacentPairId = useMemo(() => {
    if (sel.ids.length !== 2 || !guide) return null
    const i1 = guide.steps.findIndex((s) => s.id === sel.ids[0])
    const i2 = guide.steps.findIndex((s) => s.id === sel.ids[1])
    if (i1 < 0 || i2 < 0 || Math.abs(i1 - i2) !== 1) return null
    return guide.steps[Math.min(i1, i2)]!.id
  }, [sel, guide])

  const mergeSelected = useCallback(() => {
    if (!adjacentPairId) return
    commit((g) => ({ ...g, steps: mergeSteps(g.steps, adjacentPairId) }))
    setSel(emptySelection())
  }, [commit, adjacentPairId])

  /** EDT-07: حوار استبدال الروابط */
  const [urlDialog, setUrlDialog] = useState(false)

  /**
   * EDT-12: بطاقة الطمس الذكي — بعد كل طمس يدوي تُحسب المرشحات: خطوات بنفس
   * مضيف الرابط ومركز هدفها النسبي ضمن هامش ١٢٪. لا مرشح = لا بطاقة إطلاقًا.
   */
  const [blurSuggestion, setBlurSuggestion] = useState<{
    rel: RelativeRect
    size: { w: number; h: number }
    candidates: Array<{ index: number; id: string; title: string }>
  } | null>(null)

  const onBlurApplied = useCallback(
    (index: number, rect: Rect, size: { w: number; h: number }) => {
      if (!guide) return
      const rel: RelativeRect = { x: rect.x / size.w, y: rect.y / size.h, w: rect.w / size.w, h: rect.h / size.h }
      const centers: Record<number, { x: number; y: number }> = {}
      guide.steps.forEach((s, j) => {
        if (j === index) return
        const shot = s.screenshot
        if (!shot || 'missing' in shot || !shot.mark) return
        const m = shot.mark.rect
        centers[j] = { x: (m.x + m.w / 2) / size.w, y: (m.y + m.h / 2) / size.h }
      })
      const cands = suggestSimilarBlur(guide.steps, index, rel, centers)
      if (cands.length === 0) return
      setBlurSuggestion({
        rel,
        size,
        candidates: cands.map((c) => ({
          index: c.index,
          id: guide.steps[c.index]!.id,
          title: guide.steps[c.index]!.title,
        })),
      })
    },
    [guide],
  )

  const applyBlurSuggestions = useCallback(() => {
    const sug = blurSuggestion
    if (!sug) return
    const rect = scaleRelativeRect(sug.rel, sug.size)
    commit((g) => ({
      ...g,
      steps: g.steps.map((s, j) => {
        if (!sug.candidates.some((c) => c.index === j)) return s
        const shot = s.screenshot
        if (!shot || 'missing' in shot) return s
        return { ...s, screenshot: { ...shot, blurRects: [...shot.blurRects, rect] } }
      }),
    }))
    setBlurSuggestion(null)
  }, [blurSuggestion, commit])

  /**
   * S4 (إتمام البند المُرحَّل من م٦): يطبّق لون العمود النشط على إطار هدف كل
   * خطوة محدَّدة **تملك** `mark`. من لا يملكه لقطة قديمة إطارها محروق في البكسل
   * (انظر «القرار المعماري الحاسم») — تُتخطّى بصمت: لا لون كاذب يُدّعى، ولا رمي.
   * دفعة `commit` واحدة مهما كثر المحدَّد = Ctrl+Z واحد يعيد الألوان كلها.
   */
  const recolorSelected = useCallback(() => {
    commit((g) => ({
      ...g,
      steps: g.steps.map((s) => {
        if (!sel.ids.includes(s.id)) return s
        const shot = s.screenshot
        if (!shot || 'missing' in shot || !shot.mark) return s
        return { ...s, screenshot: { ...shot, mark: { ...shot.mark, color: markColor } } }
      }),
    }))
  }, [commit, sel, markColor])

  /**
   * مغادرة وضع التعديل تصفّر الأداة — لا أداة عالقة تفاجئ المستخدم عند العودة.
   * وتفرّغ التحديد كذلك: تحديدٌ ناجٍ من الوضع يجعل أول إجراء عند العودة يقع
   * على خطوات لا يراها المستخدم محدَّدة.
   * التصفير خارج مُحدِّث الحالة عمدًا: مُحدِّثات React تُستدعى مرتين في
   * StrictMode، وأثرٌ جانبي داخلها يتكرّر بلا داعٍ.
   */
  /**
   * VER-01: عند الخروج من التحرير («تم» → عرض) نُفرّغ الحفظ المؤجّل ثم نطلب لقطة.
   * الخادم يُسقط التكرار المتجاور إن لم يتغيّر شيء (204). فشل اللقطة **لا يمنع**
   * الخروج من التحرير — لافتة صامتة فقط في `versionMsg`.
   */
  const snapshotOnDone = useCallback(async () => {
    if (!id || !guide) return
    setSnapshotting(true)
    try {
      if (saveTimer.current) {
        clearTimeout(saveTimer.current)
        saveTimer.current = null
        try {
          setSave('saving')
          await client.updateGuide(id, guide)
          setSave('saved')
        } catch {
          setSave('error')
          return
        }
      }
      try {
        await client.createVersion(id)
      } catch {
        setVersionMsg({ kind: 'err', text: t('editor.versionSaveError') })
      }
    } finally {
      setSnapshotting(false)
    }
  }, [id, guide])

  const toggleEdit = useCallback(() => {
    if (editMode) setTool(DEFAULT_TOOL)
    setSel(emptySelection())
    setActiveMark(null) // ولا شكل نشط ناجٍ من الوضع — الشريط يعود أدوات لا خصائص
    const wasEditing = editMode
    setEditMode(!editMode)
    if (wasEditing) {
      void snapshotOnDone()
      // المرحلة ٤: «تم» تحفظ إصدارًا — نطمئن بكلمة صريحة أول ٣ مرات فقط ثم نكفّ
      try {
        const n = Number(localStorage.getItem('dalili:doneHint') ?? '0')
        if (n < 3) {
          localStorage.setItem('dalili:doneHint', String(n + 1))
          setDoneHint(true)
          window.clearTimeout(doneHintTimer.current)
          doneHintTimer.current = window.setTimeout(() => setDoneHint(false), 6000)
        }
      } catch {
        // تخزين غير متاح — لا تلميح والعمل نفسه سليم
      }
    }
  }, [editMode, snapshotOnDone])

  /** VER-02: حذف الدليل من قائمة «المزيد» — نقل ناعم للسلة، ثم عودة للهوم بلافتة معلّقة */
  const confirmDelete = useCallback(async () => {
    if (!id) return
    setDeleteBusy(true)
    setDeleteError('')
    try {
      await client.deleteGuide(id, {})
      sessionStorage.setItem('dalili:pendingNotice', t('editor.delete.done'))
      navigate('/')
    } catch {
      setDeleteError(t('editor.delete.error'))
      setDeleteBusy(false)
    }
  }, [id, navigate])

  /** إلغاء التحديد السريع بالضغط على مفتاح Escape */
  useEffect(() => {
    if (!editMode || sel.ids.length === 0) return
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setSel(emptySelection())
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [editMode, sel.ids.length])

  /** أمر منظار جديد: `seq` يتقدّم فتنفّذه كل بطاقة مرة واحدة */
  const pushZoom = useCallback((kind: ZoomCommand['kind']) => {
    setZoomCmd((z) => ({ kind, seq: (z?.seq ?? 0) + 1 }))
  }, [])

  const setTitle = useCallback(
    (title: string) => commit((g) => ({ ...g, title }), 'guide-title'),
    [commit],
  )

  const setDescription = useCallback(
    (description: string) => commit((g) => ({ ...g, description }), 'guide-description'),
    [commit],
  )

  // VOX-05: يفرّغ صوت الدليل إلى نص ويملأ ملاحظة كل خطوة مباشرة — دفعة واحدة يعكسها Ctrl+Z.
  // المرحلة ٢: وجود ملاحظات مكتوبة يسأل قبل استبدالها — لا حذف صامت لكلام المستخدم
  const runTranscribe = useCallback(async () => {
    if (!id || transcribing) return
    if (guide?.steps.some((s) => (s.note ?? '').trim())) {
      const ok = await confirm({
        title: t('editor.transcribe'),
        body: t('editor.transcribeOverwrite'),
        danger: true,
      })
      if (!ok) return
    }
    setTranscribing(true)
    setTranscribeMsg(null)
    try {
      const res = await client.transcribeGuide(id)
      const byStep = new Map(res.suggestions.map((s) => [s.stepId, s.text]))
      if (byStep.size === 0) {
        setTranscribeMsg({ kind: 'ok', text: t('editor.transcribeEmpty') })
        return
      }
      commit((g) => ({
        ...g,
        steps: g.steps.map((s) => (byStep.has(s.id) ? { ...s, note: byStep.get(s.id) } : s)),
      }))
      setTranscribeMsg({ kind: 'ok', text: t('editor.transcribeDone', { count: byStep.size }) })
      setSttFailed(false) // نجحت إعادة المحاولة اليدوية — اللافتة تختفي
    } catch (e) {
      setTranscribeMsg({ kind: 'err', text: e instanceof Error ? e.message : t('editor.saveError') })
    } finally {
      setTranscribing(false)
    }
  }, [id, transcribing, commit, guide, confirm])

  // EDT-10: Ctrl+Z تراجع · Ctrl+Shift+Z أو Ctrl+Y إعادة — وضع التعديل وحده:
  // قارئ «يقرأ فقط» لا يعدّل الدليل بغير قصد عبر اختصار كان يظنه للتصفح
  useEffect(() => {
    if (!editMode) return
    function onKeydown(e: KeyboardEvent) {
      if (!(e.ctrlKey || e.metaKey)) return
      const k = e.key.toLowerCase()
      if (k !== 'z' && k !== 'y') return
      e.preventDefault()
      const next = e.shiftKey || k === 'y' ? historyRef.current.redo() : historyRef.current.undo()
      if (next) {
        setGuide(next)
        setHistVer((v) => v + 1)
      }
    }
    document.addEventListener('keydown', onKeydown)
    return () => document.removeEventListener('keydown', onKeydown)
  }, [editMode])

  /**
   * قرار المالك 2026-09-10: الالتقاط الحقيقي من الامتداد وحده بلوحته الجانبية —
   * زر «أضف خطوات» في الشريط وقائمة «+» يدرجان خطوات يدوية (صورة مرفقة + تعليق).
   * مسار الالتقاط من صفحة الويب أُزيل كله: بلا جلسة إضافة من المحرر، فلا تعارض
   * حفظ تلقائي مع خطوات قادمة.
   */

  /**
   * BLK-01: إدراج كتلة من قائمة «+». كل الأنواع كتل عميل تُدرج في الموضع بدفعة
   * `commit` واحدة (تراجع واحد). الخطوة اليدوية خطوة عادية بقيم حيادية آمنة
   * تجتاز العقد، فتعمل عليها كل أدوات الريشة — وصورتها تُرفق من «أضف لقطة».
   */
  function insertBlock(kind: InsertKind, at: number) {
    // BKL-01: سقوف الكرّاسة — رفض صادق برسالة محددة لا انهيار ولا صمت
    if (guide?.kind === 'booklet') {
      const room = canAddBlock(guide.steps.length)
      if (!room.ok) return setLoadError(room.reason)
      if (kind === 'embed') {
        const slots = canAddEmbed(embedIdsOf(guide.steps).length)
        if (!slots.ok) return setLoadError(slots.reason)
        // التضمين يحتاج اختيار دليل أولًا — المنتقي يكمل الإدراج
        return setPickEmbedAt(at)
      }
    }
    insertStepAt(newBlockStep(kind as BlockInsertKind), at)
  }

  /** BKL-01: إدراج كتلة جاهزة في موضعها بدفعة تراجع واحدة */
  function insertStepAt(blk: StepDto, at: number) {
    commit((g) => {
      const steps = [...g.steps]
      steps.splice(at, 0, blk)
      return { ...g, steps }
    })
  }

  /** BLK-01: رفع لقطة لخطوة يدوية — يرفع الملف ثم يضع screenshot (دفعة تراجع واحدة عبر updateStep) */
  const attachShot = useCallback(
    async (idx: number, file: File) => {
      // خصوصيّة ٢ب: الرابط الموقَّع من استجابة الرفع — المعاينة قبل الحفظ لا تركّب رابطًا من المعرّف
      const { fileId, fileUrl, thumbFileId, thumbUrl } = await client.uploadBlob(file, file.name)
      updateStep(idx, { screenshot: { fileId, fileUrl, thumbFileId, thumbUrl, blurRects: [] } })
    },
    [updateStep],
  )

  // وصول من البحث: #step-<id> — تمرير وإبراز مؤقت بعد اكتمال التحميل
  useEffect(() => {
    if (!guide || !location.hash.startsWith('#step-')) return
    const el = document.getElementById(location.hash.slice(1))
    if (!el) return
    el.scrollIntoView({ block: 'start' })
    el.classList.add('flash')
    const timer = setTimeout(() => el.classList.remove('flash'), 2200)
    return () => clearTimeout(timer)
  }, [guide, location.hash])

  async function toggleShare() {
    if (!id) return
    if (share) {
      if (!(await confirm({ title: t('editor.revokeShare'), body: t('editor.revokeConfirm'), danger: true }))) return
      try {
        await client.revokeShare(id)
        setShare(null)
      } catch {
        setLoadError(t('editor.revokeError'))
      }
    } else {
      try {
        setShare(await client.createShare(id))
      } catch {
        setLoadError(t('editor.shareError'))
      }
    }
  }

  /** ينشئ رابط المشاركة إن لم يوجد — بضغطة صريحة من نافذة المشاركة فقط */
  async function ensureShare() {
    if (!id || share) return
    try {
      setShare(await client.createShare(id))
    } catch {
      setLoadError(t('editor.shareError'))
    }
  }

  /** بوابة النشر قبل الرابط — النشر فعل المالك/المدير وحده، والفشل يُعرض بصدق */
  async function publishGuide(): Promise<boolean> {
    if (!id) return false
    try {
      await client.updateGuideMeta(id, { visibility: 'workspace' })
      setPublished(true)
      return true
    } catch {
      setLoadError(t('home.publishError'))
      return false
    }
  }

  /** قرار المالك 2026-09-11: زر «نشر للمساحة» في شريط المسودة — نفس النشر بانتظار يمنع النقر المزدوج */
  async function publishFromBar() {
    if (publishingBar) return
    setPublishingBar(true)
    try {
      await publishGuide()
    } finally {
      setPublishingBar(false)
    }
  }

  function exportMarkdown() {
    if (!guide) return
    const md = toMarkdown(guide as never, (s) => {
      const shot = s.screenshot
      // روابط مطلقة للنطاق العام — الملف المُنزَّل يُقرأ خارج التطبيق فالمسار النسبي ينكسر
      return shot && !('missing' in shot) ? shot.fileUrl ?? `${window.location.origin}/files/${shot.fileId}` : ''
    })
    const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `dalili-${guide.id}.md`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  /** VIEW-10: نسخ غني بصور **مضمّنة** (data-URI) — الصق في Word/Google Docs/Confluence فتظهر الخطوات بصورها حتى دون اتصال */
  async function copyRichHtml() {
    if (!guide) return
    const html = await buildRichHtml(guide, window.location.origin)
    const md = toMarkdown(guide as never, (s) => {
      const shot = s.screenshot
      if (!shot || 'missing' in shot) return ''
      return shot.fileUrl ?? `${window.location.origin}/files/${shot.fileId}`
    })
    try {
      await navigator.clipboard.write([
        new ClipboardItem({
          'text/html': new Blob([html], { type: 'text/html' }),
          'text/plain': new Blob([md], { type: 'text/plain' }),
        }),
      ])
      setCopiedHtml(true)
      setTimeout(() => setCopiedHtml(false), 2500)
    } catch {
      // متصفحات بلا ClipboardItem: نسخ HTML عبر تحديد مؤقت — أفضل جهد صادق
      try {
        const div = document.createElement('div')
        div.innerHTML = html
        div.style.position = 'fixed'
        div.style.opacity = '0'
        document.body.appendChild(div)
        const range = document.createRange()
        range.selectNodeContents(div)
        const sel = window.getSelection()
        sel?.removeAllRanges()
        sel?.addRange(range)
        document.execCommand('copy')
        sel?.removeAllRanges()
        div.remove()
        setCopiedHtml(true)
        setTimeout(() => setCopiedHtml(false), 2500)
      } catch {
        setCopiedHtml(false)
      }
    }
  }

  if (loadError && !guide) {
    return (
      <div className="page">
        <StateView
          kind="error"
          icon={<IconCloudOff size={30} />}
          title={t('editor.loadError')}
          desc={t('editor.loadErrorDesc')}
          action={{ label: t('common.retry'), onAction: retry }}
        />
        <div className="row center">
          <Link className="btn ghost" to="/">
            {t('common.backToLibrary')}
          </Link>
        </div>
      </div>
    )
  }
  if (!guide) return <SkeletonScreen steps={3} />

  // بيانات الترويسة المشتقة — مدة الدليل ومضيف موقعه
  const durationMs = guideDurationMs(guide.steps, guide.audio?.durationMs)
  const siteHost = hostOf(guide.steps[0]?.url ?? '')
  // BLK-01: رقم العرض المُصفّى (الكتل بلا رقم) — مصدره الوحيد دالة core النقية
  const nums = stepNumbers(guide.steps)

  const saveLabel: Record<SaveState, string> = {
    saved: t('editor.saved'),
    dirty: t('editor.dirty'),
    saving: t('editor.saving'),
    error: t('editor.saveError'),
  }

  return (
    <div className={`editor-page-wrapper${editMode ? ' editing' : ''}`}>
      {/* ترويسة موحّدة: شريط إجراءات كامل يمتد بعرض الشاشة */}
      <div className="editor-bar no-print">
        {/* طلب المالك 2026-08-31: «تعديل/تم» أعلى الشاشة بعد «المكتبة» مباشرة في ركن البداية */}
        <div className="editor-bar-start">
          {/* طلب المالك 2026-09-03: «الإعداد» في شريط المحرر تصرف خاطئ — زر عودة «مساحتي الرئيسية» بسهم يقود للرئيسية */}
          <Link className="btn ghost" to="/">
            <IconArrowRight size={16} />
            {t('editor.myHome')}
          </Link>
          <Button
            variant={editMode ? 'solid' : 'ghost'}
            onClick={toggleEdit}
            aria-pressed={editMode}
            disabled={snapshotting}
            icon={editMode ? <IconCheck size={16} /> : <IconPencil size={16} />}
          >
            {editMode ? t('editor.done') : t('editor.edit')}
          </Button>
          {/* المرحلة ١: تراجع/إعادة ظاهران في وضع التعديل — الممحانة لا تكون مخفية */}
          {editMode && (
            <>
              <Button variant="ghost" onClick={doUndo} disabled={!canUndo} aria-label={t('editor.undo')} title={t('shortcuts.undo')}>
                <span aria-hidden="true">↶</span>
              </Button>
              <Button variant="ghost" onClick={doRedo} disabled={!canRedo} aria-label={t('editor.redo')} title={t('shortcuts.redo')}>
                <span aria-hidden="true">↷</span>
              </Button>
            </>
          )}
        </div>
        {/* الباقي هنا: دربني ← (أضف خطوات) ← مشاركة ← «المزيد» في آخر الشريط (وضع استاندرد) */}
        <div className="editor-bar-end">
          {trainable && (
            <Button
              variant="ghost"
              onClick={() => void startTrain()}
              disabled={training}
              aria-label={t('viewer.train')}
              icon={<IconTarget size={16} />}
            >
              {t('viewer.train')}
            </Button>
          )}
          {/* قرار المالك 2026-09-10: زر «أضف خطوات» بالشريط أُزيل — الإدراج من أزرار «+»
              بين الشرائح، وهو إدراج يدوي (صورة مرفقة + تعليق) لا التقاط */}
          <Button variant="solid" onClick={() => setShareOpen(true)} icon={<IconShare size={16} />}>
            {t('editor.shareOpen')}
          </Button>
          {/* VER-02: قائمة «المزيد» في آخر الشريط — الإصدارات والحذف فعّالان، البقية تصميم فقط بتلميح «قريبًا».
              طلب المالك 2026-09-09: النقاط الثلاث تعيش آخر الشاشة كما في الاستاندرد (كروم)، وفيها مبدّل «إظهار الأرقام» */}
          <div className="more-menu-wrap">
            <MoreMenu
              ariaLabel={t('editor.more.aria')}
              items={
                [
                  { key: 'showNumbers', label: t('editor.more.showNumbers'), icon: <IconNumber size={16} />, checked: showNums, onSelect: () => setShowNums((v) => !v) },
                  { key: 'sendToBooklet', label: t('editor.more.sendToBooklet'), icon: <IconBookOpen size={16} />, disabled: true, disabledHint: t('editor.more.soon') },
                  { key: 'duplicate', label: t('editor.more.duplicate'), icon: <IconCopy size={16} />, disabled: true, disabledHint: t('editor.more.soon') },
                  { key: 'translate', label: t('editor.more.translate'), icon: <IconWand size={16} />, disabled: true, disabledHint: t('editor.more.soon') },
                  { key: 'versions', label: t('editor.more.versions'), icon: <IconClock size={16} />, onSelect: () => setVersionsOpen((v) => !v) },
                  { key: 'moveTo', label: t('editor.more.moveTo'), icon: <IconFolder size={16} />, disabled: true, disabledHint: t('editor.more.soon') },
                  { key: 'delete', label: t('editor.more.delete'), icon: <IconTrash size={16} />, onSelect: () => setAskDelete(true), danger: true },
                ] satisfies MoreMenuItem[]
              }
            />
            {versionsOpen && id && (
              <div className="version-drawer">
                <VersionHistoryPanel
                  guideId={id}
                  onClose={() => setVersionsOpen(false)}
                  onPick={(vid) => {
                    setVersionsOpen(false)
                    navigate(`/g/${id}/v/${vid}`)
                  }}
                />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* قرار المالك 2026-09-11: المسودة تُرى — شريط حالة فوق الصفحة ونشر بضغطة من هنا */}
      {!published && (
        <div className="draft-bar no-print" role="status">
          <span className="draft-bar-tx">{t('editor.draftBarTitle')}</span>
          <Button size="sm" variant="solid" disabled={publishingBar} onClick={() => void publishFromBar()}>
            {publishingBar ? t('editor.publishingDraftBar') : t('editor.publishDraftBar')}
          </Button>
        </div>
      )}

      {/* المرحلة ٤: «تم» تصنع نقطة استعادة — التلميح يظهر أول ٣ مرات ثم يهدأ */}
      {doneHint && (
        <div className="draft-bar no-print" role="status">
          <span className="draft-bar-tx">{t('editor.doneVersionHint')}</span>
        </div>
      )}

      <div className={`page editor-page${editMode ? ' editing' : ''}${guide.kind === 'booklet' ? ' is-booklet' : ''}`}>
        {/* S1/S2/S4: منضدة الأدوات — عمود ثابت يمين الشاشة، أداته سارية على كل اللقطات */}
        <ToolRail
          editing={editMode}
          tool={tool}
          onTool={setTool}
          color={markColor}
          onColor={pickColor}
          markShape={activeMarkShape}
          onMarkShape={(shape: MarkShape) => patchActiveMark({ shape })}
          onZoom={(dir) => pushZoom(dir > 0 ? 'in' : 'out')}
          onFit={() => pushZoom('fit')}
          onReplaceUrls={editMode ? () => setUrlDialog(true) : undefined}
        />

        {/* بطاقة هوية الدليل: العنوان + الوصف + صف البيانات المهمة + شارات المواقع */}
        <header className="guide-head">
          {editMode ? (
            <div className="guide-head-fields">
              <input
                type="text"
                className="guide-title-input"
                dir="rtl"
                value={guide.title}
                onChange={(e) => setTitle(e.target.value)}
                aria-label={t('editor.titleA11y')}
              />
              <textarea
                className="guide-desc-input"
                dir="rtl"
                rows={2}
                value={guide.description ?? ''}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={t('editor.descPlaceholder')}
                aria-label={t('editor.descA11y')}
              />
            </div>
          ) : (
            <div className="guide-head-read">
              <h1 className="guide-title-read" dir="rtl">
                <bdi>{guide.title}</bdi>
              </h1>
              {guide.description && (
                <p className="guide-desc-read" dir="auto">
                  <bdi>{guide.description}</bdi>
                </p>
              )}
            </div>
          )}
          <div className="guide-meta">
            <span className="meta-owner">
              <span className="avatar" aria-hidden="true">
                {(ownerNameFromEmail(ownerEmail) || t('editor.you')).charAt(0)}
              </span>
              <bdi>{ownerNameFromEmail(ownerEmail) || t('editor.you')}</bdi>
            </span>
            <span className="meta-item">
              {/* الكرّاسة كتلٌ لا خطوات — والعدّ يسمّي ما يعدّه (بلاغ المالك 2026-09-07) */}
              <IconList size={14} />{' '}
              {t(guide.kind === 'booklet' ? 'common.blocks' : 'common.steps', {
                count: guide.steps.length.toLocaleString('ar-EG'),
              })}
            </span>
            {guide.kind !== 'booklet' && durationMs > 0 && (
              <span className="meta-item">
                <IconClock size={14} /> {durationAr(durationMs)}
              </span>
            )}
            <span className="meta-item">{relativeTimeAr(guide.updatedAt)}</span>
            {share && (
              <button
                className="meta-item meta-views"
                onClick={() => setShareOpen(true)}
                aria-label={t('editor.metaViewsA11y', { count: share.views })}
              >
                <IconEye size={14} /> {t('editor.metaViews', { count: share.views })}
              </button>
            )}
            <span className={`save-state ${save}`}>
              {save === 'saved' && <IconCheck size={14} />}
              {saveLabel[save]}
            </span>
          </div>

          {/* شارات المواقع والتطبيقات الملتقطة — للدليل وحده: الكرّاسة تُؤلَّف ولا تُلتقط */}
          {guide.kind !== 'booklet' && capturedSites.length > 0 && (
            <div className="site-badges-row" aria-label={t('editor.capturedSites')}>
              {capturedSites.map((site) => (
                <span key={site.host} className="site-badge" title={site.host}>
                  <span className="site-badge-icon" style={{ backgroundColor: site.color }}>
                    {site.initial}
                  </span>
                  <span className="site-badge-name" dir="ltr">{site.name}</span>
                </span>
              ))}
            </div>
          )}

          {/* GM-05 تطوّر: التعليقات والمشكلات على مستوى الدليل مع معلومات الرأس */}
          <GuideComments
            comments={comments}
            canModerate
            failed={commentsFailed}
            onRetry={() => setCommentsSeq((s2) => s2 + 1)}
            onAdd={addComment}
            onEdit={editComment}
            onResolve={resolveComment}
            onDelete={deleteComment}
          />
        </header>

      {shareOpen && (
        <ShareDialog
          title={guide.title}
          share={share}
          // BKL-01: قائمة الفحص قبل المشاركة — عناوين الأدلة التي سيمنحها التوكن
          embedTitles={
            guide.kind === 'booklet'
              ? guide.steps.filter((s) => s.block === 'embed').map((s) => s.title)
              : undefined
          }
          onClose={() => setShareOpen(false)}
          onEnsureShare={ensureShare}
          onToggleShare={toggleShare}
          onPublish={publishGuide}
          published={published}
          onExportMarkdown={exportMarkdown}
          onCopyRich={copyRichHtml}
          copiedHtml={copiedHtml}
          onPrint={() => window.print()}
        />
      )}

      {/* EDT-07: حوار استبدال الروابط — معاينة قبل التنفيذ وتطبيق بتراجع واحد */}
      {urlDialog && (
        <UrlReplaceDialog
          guide={guide}
          onClose={() => setUrlDialog(false)}
          onApply={(steps) => {
            commit((g) => ({ ...g, steps }))
            setUrlDialog(false)
          }}
        />
      )}
      {loadError && guide && <div className="err no-print">{loadError}</div>}
      {trainMsg && (
        <div className={`card no-print append-msg ${trainMsg.kind}`} role="status">
          {trainMsg.text}
        </div>
      )}

      {/* LIB-03: وسوم الدليل — في وضع التعديل فقط، مطويّة كي لا تزدحم البداية */}
      <details className="guide-tags no-print" hidden={!editMode}>
        <summary>{t('editor.guideTagsSection')}</summary>
        <div className="tags-row">
          <input
            type="text"
            dir="rtl"
            aria-label={t('library.tags')}
            placeholder={t('library.tags')}
            value={tags}
            onChange={(e) => {
              setTags(e.target.value)
              setTagsState('idle')
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                void saveTags()
              }
            }}
          />
          <Button size="sm" variant="ghost" onClick={saveTags}>
            {t('library.tagsSave')}
          </Button>
          {tagsState === 'saved' && <span className="save-state saved">{t('library.tagsSaved')}</span>}
          {tagsState === 'error' && (
            <span className="save-state error" role="alert">
              {t('library.tagsError')}
            </span>
          )}
        </div>
      </details>

      {/* VOX: تعليق المالك الصوتي — يُسمع هنا، ويُحوَّل إلى نص يملأ ملاحظة كل خطوة */}
      {guide.audio && (
        <div className="audio-bar audio-bar-editor no-print">
          <span className="audio-label">{t('editor.audioLabel')}</span>
          <audio
            controls
            preload="metadata"
            aria-label={t('editor.audioLabel')}
            src={guide.audio.fileUrl ?? `/files/${guide.audio.fileId}`}
          />
          <Button variant="solid" onClick={runTranscribe} disabled={transcribing}>
            {transcribing ? t('editor.transcribing') : t('editor.transcribe')}
          </Button>
          {transcribeMsg && (
            <span
              className={`save-state ${transcribeMsg.kind === 'ok' ? 'saved' : 'error'}`}
              role="status"
            >
              {transcribeMsg.text}
            </span>
          )}
        </div>
      )}
      {sttFailed && (
        <p className="save-state error" role="alert">
          {t('editor.sttFailed', { button: t('editor.transcribe') })}
        </p>
      )}

      {/* S5: الشريط الجماعي — لا يظهر إلا وفي اليد تحديد، ويحمل «لوّن الهدف» (S4) */}
      {editMode && sel.ids.length > 0 && (
        <BulkBar
          count={sel.ids.length}
          onSelectAll={() => setSel((s) => selectAll(s, orderedIds))}
          onDuplicate={duplicateSelected}
          onMerge={adjacentPairId ? mergeSelected : undefined}
          onRecolor={recolorSelected}
          onRemove={removeSelected}
          onClear={() => setSel(emptySelection())}
        />
      )}

      {/* EDT-12: بطاقة الطمس الذكي — اقتراح صادق بعدّ المرشحين قبل أي تنفيذ */}
      {blurSuggestion && (
        <div className="blur-suggest no-print" role="status">
          <p>{t('editor.blurSuggestTitle', { count: blurSuggestion.candidates.length })}</p>
          <ul>
            {blurSuggestion.candidates.map((c) => (
              <li key={c.id}>
                <bdi>{c.title}</bdi>
              </li>
            ))}
          </ul>
          <div className="row">
            <Button size="sm" onClick={applyBlurSuggestions}>
              {t('editor.blurSuggestApply')}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setBlurSuggestion(null)}>
              {t('editor.blurSuggestSkip')}
            </Button>
          </div>
        </div>
      )}

      <div className="col-stack editor-step-stack">
        {guide.steps.length === 0 && (
          <StateView
            kind="empty"
            icon={<IconBookOpen size={30} />}
            title={t('editor.emptyTitle')}
            desc={t('editor.emptyDesc')}
          />
        )}
        {/* BKL-01: الكرّاسة لقائمة كتلها، والدليل لحلقته الحالية بلا مساس */}
        {guide.kind === 'booklet' ? (
          <BookletBlockList
            steps={guide.steps}
            editing={editMode}
            onPatch={(i, patch) => updateStep(i, patch)}
            onRemove={(i) => removeStep(i)}
            onInsert={insertBlock}
            onAttachShot={(i, file) => void attachShot(i, file)}
          />
        ) : (
          <GuideStepList
            guide={guide}
            guideId={id}
            nums={nums}
            editMode={editMode}
            showNums={showNums}
            tool={tool}
            markColor={markColor}
            zoomCmd={zoomCmd}
            sel={sel}
            dragFrom={dragFrom}
            activeMark={activeMark}
            onInsert={insertBlock}
            onVoiceTranscribed={() => setReloadSeq((v) => v + 1)}
            onBlurApplied={onBlurApplied}
            onAttachShot={(i, file) => void attachShot(i, file)}
            updateStep={updateStep}
            moveStep={moveStep}
            removeStep={removeStep}
            duplicateStep={duplicateStep}
            setMark={setMark}
            setActiveMark={setActiveMark}
            pickStep={pickStep}
            moveStepTo={moveStepTo}
            setDragFrom={setDragFrom}
          />
        )}
        {pickEmbedAt !== null && (
          <EmbedPicker
            onClose={() => setPickEmbedAt(null)}
            onPick={(guideId, title) => {
              insertStepAt(newBlockStep('embed', { guideId, title }), pickEmbedAt)
              setPickEmbedAt(null)
            }}
          />
        )}
      </div>
      </div>
      {/* VER-01: لافتة صامتة إن فشل حفظ نسخة السجل — لا تُبقي المستخدم في التحرير */}
      {versionMsg && (
        <p className={`save-state ${versionMsg.kind === 'ok' ? 'saved' : 'error'}`} role="alert">
          {versionMsg.text}
        </p>
      )}
      {/* VER-02: حوار تأكيد الحذف — نقل ناعم للسلة */}
      <ConfirmDialog
        open={askDelete}
        danger
        busy={deleteBusy}
        errorAr={deleteError || undefined}
        title={t('editor.delete.title')}
        body={t('editor.delete.body', { title: guide?.title ?? '' })}
        confirmLabel={t('editor.delete.confirm')}
        cancelLabel={t('editor.delete.cancel')}
        onCancel={() => {
          if (deleteBusy) return
          setAskDelete(false)
          setDeleteError('')
        }}
        onConfirm={() => {
          void confirmDelete()
        }}
      />
    </div>
  )
}
