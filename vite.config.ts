import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { viteSingleFile } from 'vite-plugin-singlefile'

// https://vite.dev/config/ — vitest/config 의 defineConfig 로 test 설정을 함께 둔다.
//
// 서버 없이 동작하는 빌드:
//  · base: './' — 자산을 상대 경로로 참조해 file:// 더블클릭과 GitHub Pages 하위 경로 양쪽에서 동작.
//  · viteSingleFile — JS/CSS 를 index.html 에 인라인. file:// 에서는 <script type="module" src>
//    외부 모듈 로드가 CORS 로 막히는데(이미지·CSS 는 상대 경로로 로드되지만 JS 만 차단), 인라인으로 회피한다.
//    inlinePattern: [] 로 빌드 청크(JS/CSS)만 인라인하고, public/ 의 이미지·오디오는 외부 상대 경로로 남긴다.
export default defineConfig({
  base: './',
  plugins: [react(), tailwindcss(), viteSingleFile({ inlinePattern: [] })],
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
