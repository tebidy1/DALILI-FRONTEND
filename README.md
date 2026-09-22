# دليلي — الواجهة (DALILI Frontend)

واجهة أداة **دليلي**: التقط خطوات أي مهمة في المتصفح وحوّلها تلقائيًا إلى دليل عربي بخطوة لكل نقرة — لقطة، عنوان عربي مولّد، ورابط مشاركة يفتح بلا حساب.

> منتج مشابه لـ Tango موجَّه للسعودية: عربي أولًا RTL. جزء الواجهة من مشروع دليلي. الخادم في مستودع منفصل: `DALILI-BACKEND`.

## البنية

مستودع pnpm (workspace) يحوي:

| الحزمة | الوصف |
|---|---|
| `apps/web` | تطبيق الويب Vite + React (المحرّر والعارض) |
| `apps/extension` | امتداد المتصفح WXT MV3 (الالتقاط) |
| `packages/core` | منطق نقي بلا اعتمادات (مشترك) |
| `packages/shared` | عقود zod المشتركة |

## التشغيل

```bash
pnpm install                         # تثبيت الاعتمادات
pnpm dev                             # الويب على 5174 (يتطلّب تشغيل الخادم من DALILI-BACKEND)
pnpm --filter @dalili/extension dev  # تطوير الامتداد
pnpm test                            # كل الاختبارات
pnpm typecheck                       # فحص الأنواع
```

**بناء الامتداد للإنتاج:**

```bash
pnpm --filter @dalili/extension build
```

ثم في كروم/إيدج: `chrome://extensions` ← فعّل «وضع المطوّر» ← «تحميل غير مضغوط» ← اختر `apps/extension/.output/chrome-mv3`.

> يتّصل بالخادم من مستودع `DALILI-BACKEND` (المنفذ الافتراضي 8787).
