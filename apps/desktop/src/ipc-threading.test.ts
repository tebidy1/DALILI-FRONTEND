import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, it, expect } from 'vitest'

/**
 * عقد الخيوط (علّة الأداء 2026-09-30) — أمرٌ حاجب لا يجوز أن يكون متزامنًا.
 *
 * **الحقيقة المقيسة من مولّد الماكرو** (`tauri-macros-2.6.3/src/command/wrapper.rs`):
 * الافتراض هو `ExecutionContext::Blocking`، وجسمه `body_blocking` ينادي الدالّة
 * **مباشرةً بلا spawn**: `let result = $path(args...)`. ومعالج IPC على ويندوز
 * يُستدعى من حدث `WebMessageReceived` في ‏WebView2 = **خيط الواجهة الرئيسي**.
 *
 * أثرُ ذلك مقيسٌ في بلاغ المالك: كل `frame_pick` كان يجمّد الخيط الرئيسي عشرات
 * إلى مئات الميلي ثانية، فتتكدّس نبضات `sensor://tick` ولا تُعالَج، فتتجمّد ساعة
 * الجلسة، فلا تُغلق نافذة الإيماءة الـ٦٠مث في موعدها — فكل نقرةٍ سريعة تجعل
 * التي بعدها أبطأ (حلقة تغذية راجعة، لا «زمن أداء»).
 *
 * `#[tauri::command(async)]` على دالّة متزامنة ⇒ `sync_threadpool`: تُنفَّذ على
 * مجمّع الخيوط الحاجبة فلا تلمس خيط الواجهة أبدًا.
 */
const here = fileURLToPath(new URL('.', import.meta.url))
const lib = readFileSync(join(here, '..', 'src-tauri', 'src', 'lib.rs'), 'utf8')

/** الأوامر الحاجبة وسببُ حجبها — كلٌّ يجب أن يخرج عن خيط الواجهة */
const BLOCKING: Array<[cmd: string, why: string]> = [
  ['frame_pick', 'ذهابٌ وإيابٌ مع خيط الحلقة (≤350مث) + قراءة الشاشة كاملةً + بناء المصغّرة'],
  ['facts_refresh', 'انتظار خيط UIA حتى مهلة 250مث'],
  ['frame_blur', 'فكّ JPEG كامل + طمس + إعادة ترميز'],
  ['frame_thumb', 'قراءة ملفّ + ترميز base64'],
  ['queue_file', 'wait_pending_encoders بسقف ١٥ ثانية'],
  ['recording_stop', 'انضمام خيوط التفكيك بسقف ثانيتين'],
]

/** إعلان الأمر كما في المصدر: سطر السمة الذي يسبق `fn <cmd>(` مباشرةً */
function attrOf(cmd: string): string {
  const at = lib.indexOf(`fn ${cmd}(`)
  expect(at, `الأمر ${cmd} موجود في lib.rs`).toBeGreaterThan(-1)
  const before = lib.slice(0, at)
  const line = before.lastIndexOf('#[tauri::command')
  expect(line, `الأمر ${cmd} مزيَّن بـ#[tauri::command]`).toBeGreaterThan(-1)
  return lib.slice(line, at)
}

describe('عقد الخيوط: أمرٌ حاجب لا يحجب خيط الواجهة', () => {
  for (const [cmd, why] of BLOCKING) {
    it(`${cmd} غير حاجب للواجهة — ${why}`, () => {
      const decl = attrOf(cmd)
      const asyncAttr = decl.includes('#[tauri::command(async)]')
      const asyncFn = decl.includes('async fn') || decl.trimEnd().endsWith('async ')
      expect(
        asyncAttr || asyncFn,
        `${cmd} متزامنٌ بلا (async) ⇒ يُنفَّذ على خيط الواجهة ويجمّد النبض`,
      ).toBe(true)
    })
  }

  it('الأوامر الخفيفة تبقى كما هي — لا تحويل جماعيّ بلا سبب', () => {
    // خروجٌ فوريّ ولا عمل: تحويلها يضيف قفزة خيطٍ بلا مقابل
    expect(attrOf('recording_pause').replace(/\s+/g, ' ')).toBe('#[tauri::command] ')
  })
})
