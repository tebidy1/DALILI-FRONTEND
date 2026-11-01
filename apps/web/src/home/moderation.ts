/**
 * ب: أفعال الإشراف على دليل منشور — للمدير ومدير القسم المالك (access.moderate).
 * «القسم» للمدير وحده (guide.team في الخادم)، فتظهر قائمته حين تُمرَّر الأقسام.
 */
export type GuideModeration =
  | { kind: 'pin' | 'unpin' | 'verify' | 'unverify' | 'resume' }
  | { kind: 'suspend'; reason: string }
  | { kind: 'team'; teamId: string | null }

/** يعيد true عند النجاح — نافذة الإيقاف تُغلق عليه، وتبقى مفتوحة مع الخطأ عند الفشل */
export type ModerateFn = (m: GuideModeration) => Promise<boolean>
