# 검 강화하기 (enchant-game)

**▶ 바로 플레이: https://nelta9x.github.io/enchant-game/** (GitHub Pages — 설치 없이 브라우저에서 실행)

NBS 〈검 강화하기〉를 웹으로 클론한 확률 강화 게임.
**검 강화 → 판매 → 더 비싼 검 도전**의 핵심 루프를, 서버 없이 브라우저에서 로컬로 즐긴다.

## 스택

- **React 19** + **TypeScript** + **Vite 8**
- **Tailwind CSS v4** (`@tailwindcss/vite`, CSS-first 테마)
- **Zustand** — 상태 관리
- **Web Animations API** — 강화 연출(`lib/fx.ts`, 컴포지터 구동) / **Motion** — 게임 클리어 모달·망치 스윙에만 (`motion/react`)
- **경량 i18n** — 타입드 리소스 + `useT` 훅 (ko / en)
- **Vitest** — 로직 테스트
- **LocalStorage** — 로컬 세이브 (서버 없음, 로컬 전용)

## 개발

```bash
npm install        # 의존성 설치
npm run dev        # 개발 서버 (HMR)
npm run build      # 프로덕션 빌드 (tsc + vite)
npm run preview    # 빌드 결과 미리보기
npm run lint       # ESLint
npm run format     # Prettier 포맷 적용
npm test           # vitest 테스트
```

## 배포 (서버 없이 실행)

`npm run build` 산출물(`dist/`)은 **백엔드·HTTP 서버 없이** 동작한다.

- **로컬 더블클릭** — `dist/index.html` 을 브라우저로 곧바로 열면(`file://`) 실행된다.
  자산을 상대 경로(`base: './'`)로 참조하고, JS/CSS 를 `index.html` 에 인라인(`vite-plugin-singlefile`)해
  `file://` 에서 외부 ES 모듈이 CORS 로 막히는 문제를 피한다. 이미지는 `dist/sprites/` 에 상대 경로로 함께
  둔다(같은 폴더 구조 유지 필요). 효과음은 게임 데이터 JSON 처럼 빌드 시 data URL 로 `index.html` 에 인라인해
  Web Audio 로 디코드한다(`file://` 에서 `fetch` 가 막히므로) — `dist/audio/` 사본은 무해한 부산물이다.
- **GitHub Pages** — `main` 에 push 하면 `.github/workflows/deploy.yml` 이 빌드 후 자동 배포한다.
  최초 1회만 리포지토리 **Settings → Pages → Source** 를 **"GitHub Actions"** 로 설정한다.

## 설계 한눈에

세 가지 원칙으로 짜여 있다 — 코드 작성 규약의 상세는 [CLAUDE.md](CLAUDE.md) 참조.

- **데이터는 코드와 분리** — 검·상점·의뢰 등 게임 데이터는 `public/data/*.json` 에 두어 디자이너가 직접 편집하고, 로더가 시작 시 `import`로 읽어(번들 인라인 — `file://` 보존) 검증한 뒤 `DataManager`(단일 출처)에 적재한다.
- **문자열은 i18n** — UI 텍스트·표시명은 코드에 박지 않고 번역 키로 관리한다(`src/i18n`, ko/en).
- **뷰와 로직 분리** — 강화 확률 엔진 등 로직은 순수 함수로 떼어 테스트하고, 컴포넌트는 렌더에 집중한다.

## 디렉토리

```
src/
  data/        # 게임 데이터 레이어 — 검증 로더 + DataManager (단일 출처). 데이터 JSON 본체는 public/data/
  game/        # 강화 도메인 로직 (순수 엔진, 테스트 대상)
  store/       # zustand 상태 + 순수 코어(enhancer·queue) 셸
  components/  # 뷰(프레젠테이셔널) + 연출 효과
  hooks/       # 핫키·미디어쿼리 등 커스텀 훅
  lib/         # 자산 URL·포맷·사운드 등 경계 유틸
  i18n/        # 다국어 (ko = 키의 단일 출처, en)
public/
  data/             # 게임 데이터 JSON (디자이너 편집 대상, import로 번들)
  sprites/swords/   # 검 스프라이트 PNG (단계별, 파일명 = 영문명 slug)
  sprites/items/    # 아이템 스프라이트 PNG
  audio/            # 효과음 WAV (lib/audioAssets.ts 글롭이 빌드에 인라인)
```

## 진행 상황

핵심 강화 루프와 그 위의 경제·연출이 동작하는 단계다.

- **완료** — 강화 확률 엔진과 강화 루프(비용 차감 → 판정 → 성공/파괴/방지권 보존), 검 판매, 검 30종·단계별 스프라이트, 강화 연출(망치 타격·플로팅 텍스트·성공률 마법진·꾹 눌러 연속 강화), 최고 기록 게이지, 거래 제안(세션 단위로 3개 중 1개 선택), 상점 업그레이드(골드/아이템을 내고 상점 레벨을 올려 거래 풀을 바꿈).
- **남음** — 밸런스·경제 시뮬레이션 확정, 파산 처리·새 게임 리셋, 추가 콘텐츠(잡템·조합소·워프권), 마무리 폴리시.

> 메인 화면은 레퍼런스 목업 레이아웃을 따르되 표시값은 전부 실제 검 데이터·플레이어 상태에 바인딩한다.
> 기획·데이터는 별도 디자인 문서(프로젝트 디자인 / 검 데이터 시트 / 로드맵)에서 관리한다.

## 라이선스

개인 학습용 클론 프로젝트.
