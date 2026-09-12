import type { BgMsg } from '@/lib/protocol'
import { makeMemoRecorder } from '@/lib/memo-recorder'

/**
 * وثيقة offscreen — الخلفية لا تملك getUserMedia في MV3، وهذه الوثيقة تعيش بلا
 * واجهة وتدير ميكروفون تعليقات البطاقات (VOX-09/VOX-AUTO): كل تعليق تسجيلٌ مستقل
 * يبدأ ببطاقة ويُفرَّغ عند إيقافه. الإذن طُلب مسبقًا من صفحة الامتداد الظاهرة — هنا يفتح بلا موجه.
 */

/** VOX-09: مسجّل التعليق — تعليق البطاقة ملفٌ مستقل يُرفع ويُفرَّغ بمعزل عن غيره */
const memo = makeMemoRecorder({})

chrome.runtime.onMessage.addListener((msg: BgMsg, _sender, sendResponse) => {
  if (msg.t === 'memo-start') {
    void memo.start().then(sendResponse)
    return true
  }
  if (msg.t === 'memo-stop') {
    void memo.stop().then(sendResponse)
    return true
  }
  return false
})
