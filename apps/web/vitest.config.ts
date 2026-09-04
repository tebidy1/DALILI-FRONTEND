import { defineConfig } from 'vitest/config'

/** بيئة jsdom لاختبارات المكوّنات (UX-02) — بقية الاختبارات المنطقية النقية تعمل هنا أيضًا */
export default defineConfig({
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test-setup.ts'],
  },
})
