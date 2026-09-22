/** مغلّف الإنتاج الرقيق (٣ج-٢/٣ج-٣) — سطور توصيل بلا منطق: يمرّر listen/invoke
 *  الحقيقيّين من ‏@tauri-apps/api إلى الجلسة المحقونة. كل الاختبارات تجري على
 *  `Bridge` المزيّف؛ هذا الملفّ يغطيه typecheck والبناء وحدهما. `ready()` تضمن
 *  تسجيل اشتراكات IPC كلّها قبل أول نبضة/حدث — كي لا يُفوَّت شيء من البدء. */
import { listen } from '@tauri-apps/api/event'
import { invoke } from '@tauri-apps/api/core'
import type { DesktopFacts } from '@dalili/core'
import type { Bridge, FramePickResult } from './session'

/** مغلف إلغاء الاشتراك المتأخر: وعدُ ‏listen يُنتظر ثم يُستدعى التفويض */
const toUnlisten = (p: Promise<() => void>): (() => void) => () => {
  void p.then((f) => f())
}

export function createTauriBridge(): Bridge & { ready(): Promise<void> } {
  const pending: Array<Promise<unknown>> = []
  return {
    listen(evt, cb) {
      const unlisten = listen(evt, (e) => cb(e.payload))
      pending.push(unlisten)
      // ‏listen تعيد وعدًا بإلغاء الاشتراك — الإلغاء المتأخر سلوكها الطبيعيّ
      return toUnlisten(unlisten)
    },
    invoke(cmd, args) {
      return invoke<FramePickResult>(cmd, args)
    },
    async factsRefresh(seq) {
      return invoke<DesktopFacts | { seq: number; error: string } | null>('facts_refresh', { seq })
    },
    async frameBlur(localId, rects) {
      await invoke('frame_blur', { localId, rects })
    },
    async ready() {
      await Promise.all(pending)
    },
  }
}

// ───────────────── حدّ الاقتران التوقيعيّ (٣د-١) ─────────────────
// توصيلُ أوامرٍ وأحداثٍ فقط، بلا منطق نقل: النقل كلّه في Rust، والرمز لا
// يعبر إلى TS إطلاقًا — ‏auth_status يعيد {paired,email} حصرًا بعقد §٣.٥.

export type AuthEvent = 'auth://paired' | 'auth://lost'
export interface PairStartInfo {
  userCode: string
  verifyUrl: string
}
export interface PairStatusInfo {
  paired: boolean
  email?: string
}

export function createDesktopAuth() {
  return {
    pairStart: (deviceName: string) => invoke<PairStartInfo>('auth_pair_start', { deviceName }),
    status: () => invoke<PairStatusInfo>('auth_status'),
    forget: () => invoke<void>('auth_forget'),
    // اق-١: فتح صفحة موافقة الاقتران — الرابط يُبنى في Rust والرمز محروس هناك
    openVerify: (code: string) => invoke<void>('auth_open_verify', { code }),
    onAuthEvent: (evt: AuthEvent, cb: (p: unknown) => void) => {
      const unlisten = listen(evt, (e) => cb(e.payload))
      return toUnlisten(unlisten)
    },
  }
}

// ───────────────── أوامر الالتقاط والمصغّرة (مرحلة الربط ١) ─────────────────
// سطور توصيل فحسب: قرار البدء/الإيقاف للمتحكّم، و`recording_pause` no-op
// موثَّق في Rust فلا يُغلَّف أصلًا — البوّابة الحقيقيّة جلسةٌ TS (٣هـ-٢).
export interface RecordingAck {
  sessionId: string
}

export function createRecordingControls() {
  return {
    start: () => invoke<RecordingAck>('recording_start'),
    stop: () => invoke<void>('recording_stop'),
    /** بكسلات اللقطة المؤقّتة data URL — لبطاقة لحظة الالتقاط الحيّة */
    thumb: (localId: string) => invoke<{ dataUrl: string }>('frame_thumb', { localId }),
  }
}

/** أوامر التطبيق العامّة — الإغلاق الرسميّ الوحيد (بطاقة الإعدادات ← إنهاء) */
export function createAppControls() {
  return {
    exit: () => invoke<void>('app_exit'),
  }
}

// ───────────────── حدّ التسليم التوقيعيّ (٣د-٣) ─────────────────
// توصيلُ أوامرٍ وأحداثٍ فقط: الطابور والعامل في Rust، والرمز لا يعبر.

import type {
  DeliveryCommands,
  DeliveryEvents,
  GuideCreatedEvt,
  UploadedEvt,
} from './deliver'

export function createDesktopDelivery(): DeliveryCommands & DeliveryEvents {
  return {
    queueFile: (sessionId: string, localId: string) =>
      invoke<void>('queue_file', { sessionId, localId }),
    queueAudio: (sessionId: string, localId: string, webmB64: string) =>
      invoke<void>('queue_audio', { sessionId, localId, webmB64 }),
    queueGuide: (sessionId: string, guideJson: string, hasVoice: boolean) =>
      invoke<void>('queue_guide', { sessionId, guideJson, hasVoice }),
    openInBrowser: (path: string) => invoke<void>('open_in_browser', { path }),
    onUploaded(cb: (e: UploadedEvt) => void) {
      const unlisten = listen<UploadedEvt>('queue://uploaded', (e) => cb(e.payload))
      return toUnlisten(unlisten)
    },
    onGuideCreated(cb: (e: GuideCreatedEvt) => void) {
      const unlisten = listen<GuideCreatedEvt>('queue://guide-created', (e) => cb(e.payload))
      return toUnlisten(unlisten)
    },
  }
}
