/** مغلّف الإنتاج الرقيق (٣ج-٢/٣ج-٣) — سطور توصيل بلا منطق: يمرّر listen/invoke
 *  الحقيقيّين من ‏@tauri-apps/api إلى الجلسة المحقونة. كل الاختبارات تجري على
 *  `Bridge` المزيّف؛ هذا الملفّ يغطيه typecheck والبناء وحدهما. `ready()` تضمن
 *  تسجيل اشتراكات IPC كلّها قبل أول نبضة/حدث — كي لا يُفوَّت شيء من البدء. */
import { listen } from '@tauri-apps/api/event'
import { invoke } from '@tauri-apps/api/core'
import type { DesktopFacts } from '@dalili/core'
import type { Bridge, FramePickResult } from './session'

export function createTauriBridge(): Bridge & { ready(): Promise<void> } {
  const pending: Array<Promise<unknown>> = []
  return {
    listen(evt, cb) {
      const unlisten = listen(evt, (e) => cb(e.payload))
      pending.push(unlisten)
      // ‏listen تعيد وعدًا بإلغاء الاشتراك — الإلغاء المتأخر سلوكها الطبيعيّ
      return () => {
        void unlisten.then((f) => f())
      }
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
      return () => {
        void unlisten.then((f) => f())
      }
    },
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
    queueGuide: (sessionId: string, guideJson: string) =>
      invoke<void>('queue_guide', { sessionId, guideJson }),
    openInBrowser: (path: string) => invoke<void>('open_in_browser', { path }),
    onUploaded(cb: (e: UploadedEvt) => void) {
      const unlisten = listen<UploadedEvt>('queue://uploaded', (e) => cb(e.payload))
      return () => {
        void unlisten.then((f) => f())
      }
    },
    onGuideCreated(cb: (e: GuideCreatedEvt) => void) {
      const unlisten = listen<GuideCreatedEvt>('queue://guide-created', (e) => cb(e.payload))
      return () => {
        void unlisten.then((f) => f())
      }
    },
  }
}
