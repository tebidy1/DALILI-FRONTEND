import { defineConfig } from 'wxt'

export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  manifest: ({ mode }) => ({
    // SEO-01: الاسم أقوى إشارة بحثية في المتجر — كلمات ما يبحث عنه المستخدم أولًا
    // («مكتبة»، «الأدلة»، «الإجرائية») ثم العلامة بالحرفين، فيُوجَد بـ«إتقان» وبـ«itqan» معًا.
    // نسخة التطوير باسم مختلف: حزمتا الإنتاج والتطوير كانتا بالاسم والإصدار نفسيهما في
    // chrome://extensions، فحُمِّلت القديمة بدل الجديدة دون أن يُلاحَظ (2026-10-30)
    name: mode === 'development' ? 'إتقان — نسخة التطوير المحلية' : 'مكتبة الإجراءات القياسية - إتقان ITQAN',
    description: 'سجّل خطوات أي مهمة في المتصفح وحوّلها إلى دليل عربي قابل للمشاركة بخطوة واحدة — مكتبة أدلة إجرائية SOP لفريقك',
    // OPS-06: إصدار دلالي — يُرفع مع كل إرسال للمتجر
    version: '0.2.3',
    // scripting (2026-09-14): الحقن عند الطلب — التبويبات المفتوحة قبل تحميل الامتداد
    // تُفَعَّل لحظة بدء الالتقاط بلا F5. لا تحذير تركيب جديد: وصول <all_urls> ممنوح أصلًا.
    permissions: ['storage', 'unlimitedStorage', 'tabs', 'sidePanel', 'offscreen', 'scripting'],
    host_permissions: ['<all_urls>'],
    // دربني: خط الرقعة العربي (Aref Ruqaa، رخصة OFL داخل الحزمة) يُحمَّل داخل
    // Shadow DOM في أي صفحة — يجب كشفه للويب وإلا ظهر خط الصفحة بدل خط اليد
    web_accessible_resources: [{ resources: ['fonts/*'], matches: ['<all_urls>'] }],
    // PLAT-01: بلا هذه يرفض متجر كروم الرفع — الملفات يولّدها scripts/make-icons.mjs
    icons: {
      '16': 'icons/16.png',
      '32': 'icons/32.png',
      '48': 'icons/48.png',
      '128': 'icons/128.png',
    },
    action: {
      default_title: 'إتقان — افتح اللوحة الجانبية',
      default_icon: {
        '16': 'icons/16.png',
        '32': 'icons/32.png',
        '48': 'icons/48.png',
        '128': 'icons/128.png',
      },
    },
    commands: {
      'toggle-capture': {
        suggested_key: { default: 'Ctrl+Shift+U' },
        description: 'بدء أو إيقاف الالتقاط',
      },
      // CAP-15: إخفاء الشريط حين يغطي ما تصوره — التسجيل يستمر
      'toggle-bar': {
        suggested_key: { default: 'Ctrl+Shift+H' },
        description: 'إظهار أو إخفاء شريط التسجيل',
      },
    },
  }),
})
