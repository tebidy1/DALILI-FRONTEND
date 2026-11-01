import type { CourseItemDto } from '@dalili/shared'

/** د١ب: رمز نوع الدرس — محارف بسيطة تُرسم بأي خط، واحدة في المحرر والمشغّل */
export const LESSON_GLYPH: Record<CourseItemDto['type'], string> = { guide: '⧉', video: '▶', page: '¶' }
