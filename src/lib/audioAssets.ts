// 효과음·BGM 파일을 빌드에 data URL 로 인라인한다(파일명 → data URL).
// 왜 인라인인가: 이 게임은 file:// 더블클릭에서도 동작해야 하는데(CLAUDE.md "서버리스 빌드 제약"), Web Audio 로
// 디코드하려면 파일 바이트가 필요하고 file:// 에선 fetch/XHR 이 CORS 로 막힌다. <audio src> 는 로드되지만
// HTMLMediaElement 는 보이스마다 미디어 파이프라인(미디어 스레드·GPU 컨텍스트)을 세워 모바일에서 무겁다.
// 그래서 게임 데이터 JSON 과 같은 방식으로 public/ 의 파일을 정적 import 로 번들한다 — 런타임 fetch 없음.
// 새 사운드는 파일을 public/audio/ 에 두고 sound.ts 의 SFX_FILES/BGM_FILES 에 이름을 등록하면 된다(글롭이 자동 포함).
// 빌드 산출물 크기: WAV 원본 합 ≈ 230KB → base64 ≈ 310KB 가 index.html 에 더해진다(의도된 트레이드오프).
const modules = import.meta.glob('../../public/audio/*.{wav,mp3,ogg}', {
  query: '?inline',
  import: 'default',
  eager: true,
}) as Record<string, string>

// 파일명(예: 'enhance_kang.wav') → data URL
export const audioAssets: Readonly<Record<string, string>> = Object.fromEntries(
  Object.entries(modules).map(([path, dataUrl]) => [
    path.slice(path.lastIndexOf('/') + 1),
    dataUrl,
  ]),
)
