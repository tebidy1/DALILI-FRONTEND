import { useState } from 'react'
import { youtubeEmbedUrl, youtubeId, youtubeWatchUrl } from '@dalili/core'
import { t } from '../i18n'

/**
 * BKL-06: فيديو يوتيوب **بواجهة أولًا** (قرار المالك 2026-09-07).
 *
 * لا إطار ولا صورة مصغّرة من غوغل قبل أن ينقر القارئ — الكرّاسة تُفتح برابط عام،
 * وتحميل إطار يوتيوب مع الصفحة يعني أن كل من فتحها اتصل بغوغل ولو لم يشاهد.
 * (ولهذا لا نجلب `i.ytimg.com` أيضًا: مصغّرةٌ من غوغل تنقض الوعد نفسه.)
 * وعند النقر: `youtube-nocookie` من معرّف متحقَّق منه في النواة، لا من نص المؤلف.
 */
export function VideoBlock({ url, title }: { url: string; title?: string }) {
  const [playing, setPlaying] = useState(false)
  const id = youtubeId(url)

  if (!id) {
    return (
      <div className="video-card video-card-bad">
        <p>{t('block.videoBadUrl')}</p>
      </div>
    )
  }

  if (playing) {
    return (
      <div className="video-frame">
        <iframe
          src={youtubeEmbedUrl(id)}
          title={title || t('block.videoLabel')}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          referrerPolicy="strict-origin-when-cross-origin"
        />
      </div>
    )
  }

  return (
    <div className="video-card">
      <button type="button" className="video-play" onClick={() => setPlaying(true)}>
        <span className="video-play-glyph" aria-hidden>
          ▶
        </span>
        <span className="video-play-text">
          <span className="video-title">{title?.trim() || t('block.videoLabel')}</span>
          <span className="video-hint">{t('block.videoPlayHint')}</span>
        </span>
      </button>
      <a className="video-open" href={youtubeWatchUrl(id)} rel="noopener noreferrer nofollow" target="_blank">
        {t('block.videoOpen')}
      </a>
    </div>
  )
}
