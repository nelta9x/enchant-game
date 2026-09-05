# CLAUDE.md — AI 에이전트 작업 지침

검 강화 게임(enchant-game)의 코드를 고칠 때 어기기 쉬운 규약·함정만 담는다.
**프로젝트 소개·스택·디렉토리·개발/배포 방법은 [README.md](README.md)를 참조한다.**
**UI·연출 작업 시 디자인 토큰·시각 규약(색·타이포·크기·반응형 스케일)은 [DESIGN.md](DESIGN.md)를 참조한다.**

## 빌드를 깨뜨리는 것들 — 가장 먼저 확인

`tsconfig.app.json`이 엄격 플래그를 강제한다. 로컬 dev(Vite HMR)는 타입을 무시하고 돌지만,
`npm run build`(`tsc -b`)와 GitHub Pages 배포는 타입 에러에서 멈춘다 — **타입 에러 = 배포 차단**.

- 타입 import는 반드시 `import type` (`verbatimModuleSyntax`). 일반 `import`로 타입을 빼면 실패.
- `enum`·`namespace`·생성자 파라미터 프로퍼티 금지 (`erasableSyntaxOnly`) → `as const` 객체로 대체.
- 미사용 로컬 변수·함수 파라미터 금지 (`noUnusedLocals`/`noUnusedParameters`).
- 애니메이션: 강화 경로의 1회성 연출은 `lib/fx.ts`(`playFx` — Web Animations API)로 건다. `motion/react`는 남은 두 곳(게임 클리어 모달·망치 스윙)에만 쓰고 강화 경로에 다시 들이지 말 것(JS 프레임루프가 연출 내내 메인 스레드를 깨운다). **`framer-motion`은 별개 패키지 — 설치·import 금지.**

## 서버리스 빌드 제약

`base: './'` + `viteSingleFile`로 빌드 산출물이 `file://` 더블클릭과 GitHub Pages 하위 경로 양쪽에서 동작해야 한다.

- 동적 `import()`·`React.lazy`·코드 분할 금지 (`file://`에서 CORS로 외부 모듈 로드 차단).
- 외부 CDN `import`·`<script>` 태그 금지. 의존성은 npm으로 번들한다.
- 자산을 절대경로(`/sprites/...`)로 박지 말 것. URL 조립은 `lib/sprites.ts`·`lib/sound.ts`의 `BASE_URL` 경계에서만.
- 게임 데이터 JSON(`public/data/*.json`)은 **런타임 `fetch` 금지 → 로더에서 정적 `import`로 번들**한다(`file://`에서 `fetch`는 CORS로 막힘 — 이미지·오디오만 예외). 상세는 "게임 데이터" 섹션.

## 게임 데이터 = 디자이너 영역

- **편집은 `public/data/*.json`에서.** `types.ts`·로더 `parse*` 함수·`DataManager`는 데이터 레이어의 *뼈대*이니, 데이터를 바꾸려고 여기를 고치지 말 것. (앞으로 새 데이터 파일도 `public/data`에 둔다.)
- **로더는 `public/data`의 JSON을 정적 `import`로 읽어 번들한다(상대경로 `../../public/data/*.json`) — `fetch`로 바꾸지 말 것.** `public/`에 있다고 런타임 `fetch`로 전환하면 `file://` 더블클릭에서 CORS로 막혀 게임이 안 뜬다. 빌드 시 HTML에 인라인되며, dist에 동일 JSON 사본이 한 벌 더 복사되는 건 의도된 무해한 동작.
- 모든 게임 데이터는 `DataManager` 경유로만 접근(단일 출처). `main.tsx`가 시작 시 동기 `load()` 한다.
- 표시명(검·아이템 이름)을 JSON에 박지 말 것 — i18n 키로 파생한다(검 `sword.<level>.name`, 아이템 `item.<id>`).
- **새 검/아이템 추가 = JSON 항목 + i18n 키를 한 세트로.** 키를 빠뜨리면 컴파일이 아니라 게임 시작 시 런타임 throw(`assertNameKeysResolve`)로 터진다.
- 새 사운드는 `public/audio/`에 파일을 두고 `lib/sound.ts`의 `SFX_FILES`/`BGM_FILES`에 등록한다(이름이 곧 타입). 파일은 `lib/audioAssets.ts`의 글롭이 빌드에 data URL 로 인라인해 Web Audio 로 디코드한다(`file://`에서 `fetch`가 막히기 때문) — `<audio>`/`new Audio()`로 되돌리지 말 것(보이스마다 미디어 파이프라인을 세워 모바일 프레임을 떨군다). 등록만 하고 파일이 없으면 시작 시 `assertAudioAssets`가 throw 한다.

## 문자열·다국어

- UI 텍스트 하드코딩 금지 → `useT` 훅 + i18n 키. `i18n/locales/ko.ts`가 단일 출처이고 `en.ts`는 타입으로 누락이 강제된다(새 문자열은 `ko.ts`에 먼저).
- **에러·예외·로그 메시지는 영어.** 주석·UI 텍스트·테스트명은 한국어 OK.

## 뷰/로직 분리

- 게임 로직은 순수 `.ts`(`game/enhancer.ts`, `store/*Queue.ts`)에 둔다. RNG·시간·타이머·`DataManager` 읽기는 zustand store 셸에서 주입한다 — 순수 코어는 결정적이어야 테스트된다.
- zustand `create()` 시점엔 `DataManager`가 아직 비어 있다. 설정은 `create()`가 아니라 action에서 읽을 것.
- 연출 상수·계산도 `.ts`로 분리(`components/particles.ts`·`coins.ts` 등)하고, 컴포넌트는 렌더만 한다. 애니메이션 시간값을 컴포넌트에 하드코딩하면 연출 동기화가 깨진다.
- 색상은 Tailwind v4 `@theme` 토큰(`--color-*`, `index.css`)을 쓰고 hex 하드코딩 금지.
- 연출 재생은 증가하는 trigger key(0은 무시)로, 컴포넌트 정리는 `useOneShot`으로. 좌표는 엘리먼트 unmount 전에 동기로 `getBoundingClientRect()` 측정.
- **연출 재생은 `playFx`(WAAPI)** — 키프레임 채널(x/y/scale/rotate/opacity/filter)·times·구간 이징을 motion 표기 그대로 넘긴다(`buildFx` 순수·테스트). 시작 스타일은 첫 키프레임과 같게 인라인으로 두고(`opacity: 0` 등), 타임라인이 다른 채널은 요소를 나눈다(플로팅 텍스트의 이동/회전).
- **효과 store 는 "시작"만 발행한다.** 뷰는 `latestOf(kind)` 로 kind 별 최신 효과(id)를 구독하고 자기 수명(useOneShot·WAAPI 길이)으로 끝낸다. 종료(finish)를 구독하거나 `running` 리스트를 뷰에서 읽지 말 것 — 종료 전이마다 커밋이 생긴다. 잠금(lockCount)은 EnhanceButton 리프만 구독하고 핸들러·연사 엔진은 `getState()` 로 읽는다.
- **GameScreen 은 탭 커밋 최소 구독**: 불리언 셀렉터(`canEnhance/canSell/canStore`)·현재 검·보호권 수만. 골드·가방·잠금·공개(heldSwordId)는 리프(GoldDisplay·InventoryPanel/EquippedSlot·EnhanceButton·CenterStage·CommissionCard)가 직접 구독한다. 새 상태를 GameScreen 에 구독으로 올리기 전에 리프에 둘 수 있는지 먼저 본다.
- **연출은 합성 전용 속성(transform·opacity)만 움직인다.** `clip-path`·`filter`·`box-shadow`·`background-position`·등록 커스텀 프로퍼티 보간처럼 페인트 속성을 매 프레임 바꾸면 화면 전체가 프레임마다 다시 래스터된다(모바일 프레임 드랍의 실측 원인). 상시 반복은 CSS `@keyframes`, 1회성은 motion — 어느 쪽이든 움직이는 요소엔 `.fx-layer`(index.css)를 붙여 자기 합성 레이어를 준다(정적 장식엔 금지).
- **커밋 중 레이아웃 읽기 금지.** 캔버스 스프라이트는 `SpriteCanvasBinding`(lib/spriteStore.ts) 경유 — 크기는 ResizeObserver 가 준다. 렌더/effect 안에서 `offsetWidth`·`getBoundingClientRect()`를 읽고 `canvas.width`를 쓰는 패턴을 새로 만들지 말 것(여러 캔버스가 한 커밋에서 이걸 번갈아 하면 강제 레이아웃이 캔버스 수만큼 반복된다).
- 캔버스 파티클은 프레임마다 그라데이션·객체를 만들지 않는다 — 단면 텍스처를 1회 구워(`hitSparks.ts`/`dotParticles.ts`의 `bake*`/`get*Texture`) `drawImage`+`globalAlpha`로 찍는다.

## 테스트

- **디자이너가 튜닝하는 값(판매가·강화비용·성공률·드랍 수량·스프라이트 파일명)을 `toBe(...)`로 박지 말 것.** 구조·방향(`< before`)·관계만 검증한다. 단언 가능한 것: 합성 픽스처 입력, 파생값(`nameKey`), 순수함수 산출, 엔진 반환값.
- 확률 로직은 `Math.random()` 대신 고정 시드 PRNG로 검증한다. 유의미한 로직만 테스트한다.
- vitest `environment: 'node'`(DOM 테스트 없음), `npm test`로 실행.

## 함정

- **난이도(Easy/Hard) 개념은 제거됐다.** 디자인 문서·일부 코드 주석·`easyBug` note에 잔존하니 따라가지 말 것.
- `currentSwordId`에서 레벨을 파싱하지 말 것(`'sword_19'` → 19 금지) — `DataManager.getSwordById()`로 조회한다.
