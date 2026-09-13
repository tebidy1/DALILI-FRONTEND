import type { DaliliClient } from '@dalili/shared'
import { API_BASE, WEB_BASE } from '@/lib/config'
import { copyText } from '@/lib/copy-text'
import { TRAIN_FAIL_AR } from '@/lib/reader'
import type { TrainAck } from '@/lib/protocol'
import type { ReaderDeps } from './GuideReader'

/**
 * PNL-01: التبعيات الحقيقية للقارئ. «دربني» يرسل الدليل نفسه للخلفية (نفس مسار المحرر:
 * train-start بـguide)، فتفتح الخلفية/تعيد استعمال تبويب الهدف واللوحة تبقى مفتوحة بجواره.
 */
export function makeReaderDeps(client: DaliliClient): ReaderDeps {
  return {
    apiBase: API_BASE,
    webBase: WEB_BASE,
    load: (id, signal) => client.getGuide(id, signal),
    createShare: (id) => client.createShare(id),
    startTrain: async (guide) => {
      const ack = (await chrome.runtime.sendMessage({ t: 'train-start', guide }).catch(() => null)) as TrainAck | null
      return ack ?? { ok: false, errorAr: TRAIN_FAIL_AR }
    },
    copyText,
    openTab: (url) => {
      window.open(url, '_blank')
    },
  }
}
