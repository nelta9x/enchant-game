# 검 강화하기 (enchant-game)

NBS 〈검 강화하기〉를 웹으로 클론한 확률 강화 게임.
**검 강화 → 판매 → 더 비싼 검 도전**의 핵심 루프를, 서버 없이 브라우저에서 로컬로 즐긴다.

## 스택

- **React 19** + **TypeScript** + **Vite 8**
- **Tailwind CSS v4** (`@tailwindcss/vite`, CSS-first 테마)
- **Zustand** — 상태 관리
- **Motion** — 애니메이션 (`motion/react`)
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

## 아키텍처 원칙

- **상수 하드코딩 금지 + 다국어** — UI 문자열·게임 텍스트는 i18n 키로 관리 (`src/i18n`)
- **중앙 데이터 관리** — 게임 시작 시 `DataManager`에 데이터 적재, 게임 데이터는 전부 매니저 경유 (`src/data`)
- **뷰/로직 분리** — 로직은 테스트 가능하게 분리, 유의미한 로직만 테스트

## 디렉토리

```
src/
  App.tsx              # 레이아웃 조립 (HUD · 강화 무대 · 패널)
  components/          # 뷰
    TopBar.tsx         #   HUD — 골드 / 단계 / 방지권 / 난이도 / 언어
    EnhanceStage.tsx   #   검 표시 + 강화 / 판매 버튼
    PanelTabs.tsx      #   상점 / 조합소 / 인벤토리 탭
  data/                # 데이터 레이어 (단일 출처)
    DataManager.ts     #   중앙 데이터 관리자 (시작 시 load)
    loadSwords.ts      #   검 데이터 검증 로더 (JSON 파싱·검증, 스프라이트 폴백)
    types.ts           #   언어 중립 데이터 타입 (SwordData · Material 등)
    sources/swords.json#   검 데이터 파일 (+0~+29, 코드가 아닌 데이터로 분리)
  game/                # 도메인 모델 / 로직 (뷰·상태와 분리, 테스트 대상)
    types.ts           #   Sword · PlayerState · EnhanceResult (강화 루프 모델)
  i18n/                # 다국어
    index.ts           #   언어 store + useT 훅
    locales/{ko,en}.ts #   번역 리소스 (ko = 키의 단일 출처)
  lib/
    sprites.ts         # 스프라이트 파일명 → URL (BASE_URL 해석, 뷰 경계)
  store/
    uiStore.ts         # Zustand UI 상태 (난이도 · 활성 탭)

public/
  sprites/swords/      # 검 스프라이트 PNG (+0~+29 전 단계, 파일명 = 영문명 slug)
```

## 진행 상황

**스프린트 1 — 셋업 & 밸런스 표 확정** (진행 중)

- [x] 프로젝트 셋업 (Vite · React · TS · Tailwind v4 · Zustand · Motion · ESLint · Prettier)
- [x] 베이스 레이아웃 골격
- [x] 아키텍처 토대 (i18n · DataManager · 뷰/로직 분리 · vitest)
- [x] 데이터 시트 → 데이터 파일화 (검 +0~+29, `swords.json` + 검증 로더)
- [x] 검 스프라이트 로드 (+0~+29 전 단계 매핑, 미보유 단계는 마지막 스프라이트 폴백)
- [ ] 밸런스 미확정 항목 확정 / 경제 시뮬레이션

이후 스프린트(핵심 강화 루프 → 상점 → 방지권·잡템·조합소 → 워프권 → 폴리시·배포)는 기획 문서 기준으로 순차 진행한다.

> 기획·데이터는 별도 디자인 문서(프로젝트 디자인 / 검 데이터 시트 / 프로젝트 로드맵)에서 관리.

## 라이선스

개인 학습용 클론 프로젝트.
