import type { AudioMeta } from '@dalili/core'
import type { DaliliClient } from '@dalili/shared'
import type { SessionMeta } from './protocol'
import { AUDIO_PREFIX, MAX_AUDIO_BYTES, audioChunkKey, audioStateKey, b64Bytes, shouldStopForCap, type AudioSessionState } from './audio-store'
import { buildAudioMeta, stopRecorderAndWait } from './audio-publish'

/**
 * VOX-01..06 — الصوت المستمر المتزامن مع جلسة الالتقاط: استُخلص من background.ts
 * بلا أي تغيير سلوك. المسار قديم ومستقر ولا يُمسّ منطقه؛ التعليق الصوتي الجديد
 * (VOX-09 ميك الخطوة) طريق موازٍ مستقل في voice-memo.ts لا يلتقي هنا إلا في
 * صفحة الإذن المشتركة.
 */

export interface VoiceLiveDeps {
  meta: () => SessionMeta
  saveMeta: (patch: Partial<SessionMeta>) => Promise<void>
  startCapture: (opts?: { audio?: boolean }) => Promise<void>
  activeTab: () => Promise<chrome.tabs.Tab | undefined>
}

export function createVoiceLive(deps: VoiceLiveDeps) {
  /** VOX: حالة تسجيل الصوت — مرآة للمخزَّن، تُستعاد عند إيقاظ العامل */
  let audioState: AudioSessionState | null = null
  let micReturnTabId: number | null = null

  async function ensureOffscreen(): Promise<void> {
    const existing = await chrome.runtime.getContexts({ contextTypes: ['OFFSCREEN_DOCUMENT'] as never })
    if (existing.length > 0) return
    await chrome.offscreen.createDocument({
      url: 'offscreen.html',
      reasons: ['USER_MEDIA'] as never,
      justification: 'تسجيل التعليق الصوتي المتزامن مع خطوات الدليل',
    })
  }

  async function restoreAudioState(): Promise<void> {
    // VOX: وثيقة offscreen بقيت تسجّل أثناء موت العامل — استعادة عدّاداتها
    const meta = deps.meta()
    if (meta.micOn && meta.sessionId) {
      const key = audioStateKey(meta.sessionId)
      const saved = (await chrome.storage.local.get(key))[key] as AudioSessionState | undefined
      audioState = saved ?? null
    }
  }

  /** زر «ابدأ مع تعليق صوتي»: يفتح صفحة الإذن الظاهرة — القرار يعود منها برسالة */
  async function requestMicThenStart(): Promise<void> {
    const meta = deps.meta()
    if (meta.state === 'capturing' || meta.state === 'paused') return
    if (meta.state === 'draft') return
    const active = await deps.activeTab()
    if (active?.id !== undefined) micReturnTabId = active.id
    await chrome.tabs.create({ url: chrome.runtime.getURL('mic-permission.html') })
  }

  /** نتيجة صفحة الإذن للمسار المستمر: المنح يشغّل التسجيل، والرفض يبدأ بلا صوت (VOX-06) */
  async function onMicResult(granted: boolean): Promise<void> {
    if (granted) {
      await deps.startCapture({ audio: true })
      await ensureOffscreen()
      const ack = (await chrome.runtime
        .sendMessage({ t: 'offscreen-start', sid: deps.meta().sessionId })
        .catch(() => null)) as { ok?: boolean; t0?: number; errorAr?: string } | null
      if (ack?.ok && typeof ack.t0 === 'number') {
        audioState = { sid: deps.meta().sessionId, t0: ack.t0, count: 0, bytes: 0, lastOffsetMs: 0 }
        await chrome.storage.local.set({ [audioStateKey(deps.meta().sessionId)]: audioState })
        await deps.saveMeta({ micOn: true })
      } else {
        await deps.saveMeta({ notice: ack?.errorAr ?? 'تعذر بدء تسجيل الصوت — الالتقاط مستمر بلا صوت' })
      }
    } else {
      await deps.startCapture()
      await deps.saveMeta({ notice: 'لا صوت — الالتقاط مستمر بلا تعليق' })
    }
  }

  async function onAudioChunk(sid: string, idx: number, b64: string, offsetMs: number): Promise<void> {
    if (!audioState || audioState.sid !== sid) return // مقطع من جلسة منتهية — يُتجاهل
    const chunkBytes = b64Bytes(b64)
    audioState = {
      ...audioState,
      count: audioState.count + 1,
      bytes: audioState.bytes + chunkBytes,
      lastOffsetMs: Math.max(audioState.lastOffsetMs, offsetMs),
    }
    await chrome.storage.local.set({
      [audioChunkKey(sid, idx)]: b64,
      [audioStateKey(sid)]: audioState,
    })
    // سقف 25MB: نقصّر قبل الخادم — الالتقاط يستمر، والصوت الذي عندي يُرفق كاملًا
    if (shouldStopForCap(audioState.bytes - chunkBytes, chunkBytes) || audioState.bytes > MAX_AUDIO_BYTES) {
      await deps.saveMeta({ notice: 'بلغ الصوت حده 25 ميغابايت — توقف تسجيله، والالتقاط مستمر' })
      await stopRecorderAndWait(sid)
    }
  }

  /** VOX-06: الإيقاف المؤقت يوقف الميكروفون فعلًا — لا يُسمع شيء وأنت متوقف */
  async function pauseAudio(): Promise<void> {
    const meta = deps.meta()
    if (!audioState) return
    audioState = { ...audioState, pausedAt: Date.now() }
    await chrome.storage.local.set({ [audioStateKey(meta.sessionId)]: audioState })
    void chrome.runtime.sendMessage({ t: 'offscreen-pause', sid: meta.sessionId }).catch(() => {})
  }

  async function resumeAudio(): Promise<void> {
    const meta = deps.meta()
    if (!audioState || typeof audioState.pausedAt !== 'number') return
    const from = audioState.pausedAt
    const to = Date.now()
    const pauses = [...(audioState.pauses ?? []), [from, to] as [number, number]]
    audioState = { ...audioState, pausedAt: undefined, pauses }
    await chrome.storage.local.set({ [audioStateKey(meta.sessionId)]: audioState })
    void chrome.runtime.sendMessage({ t: 'offscreen-resume', sid: meta.sessionId }).catch(() => {})
  }

  /** تجميع + رفع + ميتا الدليل — الفشل لا يسقط النشر أبدًا */
  async function finishAudio(client: DaliliClient, sid: string): Promise<AudioMeta | undefined> {
    const state = audioState
    if (!deps.meta().micOn || !state || state.sid !== sid) return undefined
    return buildAudioMeta(client, sid, state)
  }

  async function purgeAudio(sid: string): Promise<void> {
    audioState = null
    const all = await chrome.storage.local.get(null)
    const keys = Object.keys(all).filter((k) => k.startsWith(AUDIO_PREFIX) && k.includes(`:${sid}:`))
    if (keys.length > 0) await chrome.storage.local.remove(keys)
  }

  /** التبويب الأصلي الذي نعيد التركيز إليه بعد صفحة الإذن — يديره الخلفية عبر هذين */
  return {
    ensureOffscreen,
    restoreAudioState,
    requestMicThenStart,
    onMicResult,
    onAudioChunk,
    pauseAudio,
    resumeAudio,
    finishAudio,
    purgeAudio,
    setMicReturnTab: (id: number | null) => {
      micReturnTabId = id
    },
    getMicReturnTab: () => micReturnTabId,
  }
}

export type VoiceLive = ReturnType<typeof createVoiceLive>
