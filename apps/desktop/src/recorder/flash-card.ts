import type { MarkRectPct } from '@dalili/core'

/**
 * آلة بطاقة اللقطة (مواصفة 2026-09-30) — دورةُ حياةٍ **واحدة** لبطاقة الالتقاط.
 *
 * **العلّة التي وُلدت منها (بلاغ المالك):** «بعد الالتقاط تظل شاشة الإشعار ظاهرة
 * لمدة، وفي هذه المدة إذا تم التقاط آخر قبل اختفائها فإنه لا يتم الالتقاط».
 * الالتقاط كان يحدث فعلًا والخطوة تُبنى وتُعدّ — لكنّ حالة البطاقة كانت موزّعة
 * على ثلاثة أماكن (أعلامٌ في نافذة الحصاة · مؤقّتٌ في نافذة المنبثقة · حالةُ
 * الصوت في المتحكّم) فلم يستطع أحدها التعبير عن «لقطةٌ أحدث ألغت الحالية».
 *
 * **الحدود محقونة** (`now`/`schedule`/`voice`/`onView`) فتُختبَر السياسة بلا DOM
 * ولا Tauri ولا مؤقّتات — وفي الإنتاج تُقاد الساعة من `sensor://tick` لا من
 * `setTimeout`: مؤقّتات WebView تُخنَق في نافذةٍ غير مركَّز عليها، والمستخدم
 * بطبيعة العمل في تطبيقٍ آخر (خطّة ٣ج §٧، نفس علّة ساعة الجلسة).
 *
 * **اللامساس:** الآلة لا تملك التسجيل ولا تلمس الميكروفون — تطلب عبر `voice`
 * وحدها. مصدر الحقيقة يبقى `voiceStack` في المتحكّم واحدًا لا اثنين.
 */

/** المدّة التي تبقاها البطاقة معروضة بعد اكتمالها — سببها أن يبلغ المستخدم
 *  زرّ المايك بلا عجلة (قرار المالك 2026-09-30). التسجيل الجاري يجمّدها.
 *
 *  خُفِّضت من ٨ث إلى ٣ث بقرار المالك بعد برهانه الحيّ 2026-09-30/ب: البطاقة
 *  المعلّقة ثماني ثوانٍ تحجب العمل أكثر ممّا تخدم، والوصول إلى المايك لا
 *  يحتاجها — والتسجيل حين يبدأ يُلغي المهلة أصلًا فلا تقطعه الثلاث. */
export const FLASH_HOLD_MS = 3000

/** بكسلات اللقطة وعلامتها كما ترسمها البطاقة — العلامة نِسَبٌ مئويّة (DTOP-06) */
export interface FlashShot {
  src: string
  mark?: MarkRectPct
}

/** ما تعرضه البطاقة الآن — `null` من `onView` يعني: أخفِ البطاقة */
export interface FlashView {
  /** رقم الخطوة المعروض */
  n: number
  /** البكسلات لم تصل بعد (نبضُ الانتظار) */
  pending: boolean
  shot: FlashShot | null
  recording: boolean
}

/** طلبات الصوت — يوصّلها المتحكّم إلى `voiceStack`. `start` يعيد نجاحه */
export interface FlashVoice {
  start(): Promise<boolean>
  /** إيقافٌ **يحفظ** المقطع لخطوته */
  stop(): Promise<void>
  /** إيقافٌ **بلا حفظ** — زرّ «إلغاء» */
  cancel(): Promise<void>
}

export interface FlashCardOpts {
  now(): number
  /** يؤجّل تنفيذًا ويعيد دالّة إلغاء — نفس عقد `gesture-pacer` حرفيًّا */
  schedule(fn: () => void, ms: number): () => void
  holdMs?: number
  voice: FlashVoice
  onView(v: FlashView | null): void
}

export interface FlashCard {
  /** إيماءة قُبلت — البطاقة تقفز بالرقم المتوقّع قبل وصول البكسلات */
  capturing(n: number): Promise<void>
  /** خطوة بُنيت ببكسلاتها — `n` هو الحقيقة وقد يخالف المتوقَّع (navigate تُدرَج) */
  step(n: number, shot: FlashShot): void
  /** إيماءة سقطت (لا حقائق) */
  dropped(): void
  /** زرّ المايك — يبدأ أو ينهي حسب الحالة */
  mic(): Promise<void>
  /** زرّ «إلغاء» أثناء التسجيل */
  cancel(): Promise<void>
  /** يعكس تسجيلًا بدأه أو أنهاه غيرُها (الوضع التلقائي يبدأ على كل بطاقة)
   *  — **لا ينادي `voice` إطلاقًا**: يصف واقعًا قائمًا ولا يصنعه، فلا حلقة */
  syncRecording(on: boolean): void
  /** فُتحت بطاقةُ مستخدم (قائمة/شريط/حساب) — بطاقةُ اللقطة تُسلّم مكانها */
  userCard(): Promise<void>
  /** إسكاتٌ تامّ (نهاية الجلسة) */
  reset(): void
}

type State =
  | { k: 'idle' }
  | { k: 'pending'; n: number }
  | { k: 'shown'; n: number; shot: FlashShot }
  | { k: 'recording'; n: number; shot: FlashShot }

export function createFlashCard(opts: FlashCardOpts): FlashCard {
  const holdMs = opts.holdMs ?? FLASH_HOLD_MS
  let state: State = { k: 'idle' }
  /** إلغاء المهلة المسلَّحة — بقاؤها بعد مغادرة `shown` هو ما يُخفي بطاقةً جديدة */
  let disarm: (() => void) | null = null

  function clearTimer(): void {
    disarm?.()
    disarm = null
  }

  /** المهلة تُسلَّح لـ`shown` وحدها — `recording` بلا مهلة بالتصميم */
  function arm(): void {
    clearTimer()
    disarm = opts.schedule(() => {
      disarm = null
      if (state.k === 'shown') {
        state = { k: 'idle' }
        opts.onView(null)
      }
    }, holdMs)
  }

  function emit(): void {
    switch (state.k) {
      case 'idle':
        opts.onView(null)
        return
      case 'pending':
        opts.onView({ n: state.n, pending: true, shot: null, recording: false })
        return
      case 'shown':
        opts.onView({ n: state.n, pending: false, shot: state.shot, recording: false })
        return
      case 'recording':
        opts.onView({ n: state.n, pending: false, shot: state.shot, recording: true })
    }
  }

  /** يحفظ تعليقًا جاريًا قبل أيّ انتقال يهجر خطوته — صامتًا بلا حوار
   *  (قرار المالك 2026-09-30، وهو قرار `auto-memo` الموثَّق نفسه:
   *  «فلا يمتدّ صوت بطاقة إلى بطاقة أخرى بحسن نية»).
   *
   *  **يُنادى قبل تبديل الحالة ولا يُنتظَر**: `stopMemo` يقرأ التعليق الجاري
   *  لحظة النداء، فالترتيب مضمون بالنداء نفسه لا بالانتظار — والبطاقة يجب
   *  أن تقفز **تزامنيًّا**. انتظارُها كان يؤخّر القفزة دورةَ microtask
   *  ويسمح لحدثٍ لاحق أن يسبق سابقه. */
  function saveIfRecording(): Promise<void> {
    return state.k === 'recording' ? opts.voice.stop() : Promise.resolve()
  }

  return {
    capturing(n: number): Promise<void> {
      // النقرة الجديدة تسود دائمًا: مقطعُ الخطوة السابقة يُحفَظ لها ثم تُستبدل
      // البطاقة فورًا — العلّة المُبلَّغة كانت أنّ هذا الفرع لا يجري إطلاقًا
      // ما دامت بطاقةٌ مفتوحة، فتتجمّد الواجهة على لقطةٍ قديمة
      const saved = saveIfRecording()
      clearTimer()
      state = { k: 'pending', n }
      emit()
      return saved
    },

    step(n: number, shot: FlashShot): void {
      if (state.k === 'idle') return
      if (state.k === 'recording') {
        // البكسلات وصلت والمستخدم يتكلّم — تُحدَّث الصورة ولا يُقطع التسجيل
        state = { k: 'recording', n: state.n, shot }
        emit()
        return
      }
      state = { k: 'shown', n, shot }
      arm()
      emit()
    },

    dropped(): void {
      // بطاقةُ انتظارٍ وحدها تُغلق بصدق — بطاقةٌ مكتملة معروضة لا تُطوى
      // بإسقاط إيماءةٍ أخرى، ولا تسجيلٌ جارٍ يُقطع
      if (state.k !== 'pending') return
      clearTimer()
      state = { k: 'idle' }
      emit()
    },

    async mic(): Promise<void> {
      if (state.k === 'shown') {
        const ok = await opts.voice.start()
        if (!ok) {
          // تدهور معلن: لا حالةَ تسجيلٍ كاذبة، والمهلة تعود كما كانت
          arm()
          return
        }
        clearTimer() // لا تذوب البطاقة والمستخدم يتكلّم
        state = { k: 'recording', n: state.n, shot: state.shot }
        emit()
        return
      }
      if (state.k === 'recording') {
        await opts.voice.stop()
        state = { k: 'shown', n: state.n, shot: state.shot }
        arm()
        emit()
      }
      // pending/idle: لا تسجيل على العدم
    },

    syncRecording(on: boolean): void {
      if (on && state.k === 'shown') {
        clearTimer()
        state = { k: 'recording', n: state.n, shot: state.shot }
        emit()
        return
      }
      if (!on && state.k === 'recording') {
        state = { k: 'shown', n: state.n, shot: state.shot }
        arm()
        emit()
      }
      // مطابقةٌ للحالة القائمة ⇐ صمت: لا رسمَ ولا تسليحَ مكرَّران
    },

    async cancel(): Promise<void> {
      if (state.k !== 'recording') return
      await opts.voice.cancel()
      state = { k: 'shown', n: state.n, shot: state.shot }
      arm()
      emit()
    },

    userCard(): Promise<void> {
      const saved = saveIfRecording()
      clearTimer()
      state = { k: 'idle' }
      opts.onView(null)
      return saved
    },

    reset(): void {
      clearTimer()
      state = { k: 'idle' }
      opts.onView(null)
    },
  }
}
