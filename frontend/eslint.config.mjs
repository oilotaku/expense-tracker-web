// ESLint flat config（Next 16 已移除 `next lint`，直接跑 `eslint .`）
import { defineConfig, globalIgnores } from 'eslint/config'
import nextVitals from 'eslint-config-next/core-web-vitals'
import nextTs from 'eslint-config-next/typescript'

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
    },
  },
  // schema.d.ts 由 openapi-typescript 產生（FE-066），不 lint、仍由 tsc 檢查
  globalIgnores(['.next/**', 'out/**', 'coverage/**', 'next-env.d.ts', 'src/lib/api/schema.d.ts']),
])
