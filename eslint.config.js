import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import prettier from 'eslint-config-prettier'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  // dist = 빌드 산출물. .claude = Claude 도구 디렉토리(worktree 사본 등) — 둘 다 소스가 아니므로 린트 제외.
  // (.claude/worktrees 의 저장소 사본이 보이면 tsconfig 루트가 둘로 갈려 타입 파서가 멈춘다 — 그 방지.)
  globalIgnores(['dist', '.claude']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
      prettier,
    ],
    languageOptions: {
      globals: globals.browser,
    },
  },
])
