import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

/** اختصار @/ نفسه الذي يولّده wxt للإنتاج — كي تُحمَّل اختبارات المكوّنات عبر vitest */
export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('.', import.meta.url)),
    },
  },
})
