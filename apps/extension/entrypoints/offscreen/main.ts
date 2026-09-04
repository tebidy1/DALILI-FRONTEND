import type { BgMsg } from '@/lib/protocol'
import { makeChunkHandler } from '@/lib/recorder'
import { makeMemoRecorder } from '@/lib/memo-recorder'

/**
 * VOX-01: وثيقة offscreen — الخلفية لا تملك getUserMedia في MV3، وهذه الوثيقة
 * تعيش بلا واجهة وتدير الميكروفون: مقاطع 1000ms تُسلَّم للخلفية بإزاحتها عن البدء.
 * الإذن طُلب مسبقًا من صفحة الامتداد الظاهرة — هنا يفتح بلا موجه.
 */

const TIMESLICE_MS = 1_000

interface StartAck {
  ok: boolean
  /** t0 = Date.now() لحظة بدء التسجيل — يُخزَّن مع الجلسة لاشتقاق زمن كل خطوة */
  t0?: number
  errorAr?: string
}

let recorder: MediaRecorder | null = null
let stream: MediaStream | null = null
let activeSid = ''

/** VOX-09: مسجّل التعليق القصير — مستقل عن المسجّل المستمر بمجرى وميكروفون منفصلين */
const memo = makeMemoRecorder({})

function send(msg: BgMsg) {
  void chrome.runtime.sendMessage(msg).catch(() => {
    // الخلفية قد تكون ميتة لحظة — المقطع يُفقد لكن التسجيل يستمر
  })
}

async function start(sid: string): Promise<StartAck> {
  if (recorder && recorder.state !== 'inactive') {
    return { ok: false, errorAr: 'مسجّل صوتي يعمل بالفعل' }
  }
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true } })
  } catch {
    return { ok: false, errorAr: 'تعذر فتح الميكروفون — الالتقاط مستمر بلا صوت' }
  }
  let rec: MediaRecorder
  try {
    rec = new MediaRecorder(stream, {
      mimeType: 'audio/webm;codecs=opus',
      audioBitsPerSecond: 32_000,
    })
  } catch {
    stream.getTracks().forEach((t) => t.stop())
    stream = null
    return { ok: false, errorAr: 'متصفحك لا يدعم تسجيل webm/opus — الالتقاط مستمر بلا صوت' }
  }
  const clock0 = performance.now()
  recorder = rec
  activeSid = sid
  // المقاطع تصل بإزاحتها عن البدء (ms) — نفس ساعة الوثيقة، فتسقط الحاجة لنقل clock0
  rec.ondataavailable = makeChunkHandler((c) =>
    send({ t: 'audio-chunk', sid, idx: c.idx, b64: c.b64, offsetMs: c.clock - clock0 }),
  )
  rec.onstop = () => {
    stream?.getTracks().forEach((t) => t.stop())
    stream = null
    send({ t: 'audio-stopped', sid: activeSid })
  }
  rec.start(TIMESLICE_MS)
  return { ok: true, t0: Date.now() }
}

chrome.runtime.onMessage.addListener((msg: BgMsg, _sender, sendResponse) => {
  if (msg.t === 'offscreen-start') {
    void start(msg.sid).then(sendResponse)
    return true
  }
  if (msg.t === 'memo-start') {
    // VOX-09: تعليق خطوة — طريق مستقل عن التسجيل المستمر؛ يعمل بجلسة التقاط عادية بلا صوت
    if (recorder && recorder.state !== 'inactive') {
      sendResponse({ ok: false, errorAr: 'الصوت المستمر يعمل الآن — التعليق غير متاح أثناءه' })
      return false
    }
    void memo.start().then(sendResponse)
    return true
  }
  if (msg.t === 'memo-stop') {
    void memo.stop().then(sendResponse)
    return true
  }
  if (msg.t === 'offscreen-stop') {
    if (recorder && recorder.state !== 'inactive') recorder.stop()
    else send({ t: 'audio-stopped', sid: msg.sid })
    return false
  }
  // VOX-06: الإيقاف المؤقت يوقف الميكروفون فعلًا — لا يسمع شيئًا وأنت متوقف
  if (msg.t === 'offscreen-pause') {
    if (recorder && recorder.state === 'recording') recorder.pause()
    return false
  }
  if (msg.t === 'offscreen-resume') {
    if (recorder && recorder.state === 'paused') recorder.resume()
    return false
  }
  return false
})
