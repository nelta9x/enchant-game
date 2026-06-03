# 검 강화하기 (enchant-game)

NBS 〈검 강화하기〉를 웹으로 클론한 확률 강화 게임.
**검 강화 → 판매 → 더 비싼 검 도전**의 핵심 루프를, 서버 없이 브라우저에서 로컬로 즐긴다.

## 스택

- **React 19** + **TypeScript** + **Vite 8**
- **Tailwind CSS v4** (`@tailwindcss/vite`, CSS-first 테마)
- **Zustand** — 상태 관리
- **Motion** — 애니메이션 (`motion/react`)
- **LocalStorage** — 로컬 세이브 (서버 없음, 로컬 전용)

## 개발

```bash
npm install        # 의존성 설치
npm run dev        # 개발 서버 (HMR)
npm run build      # 프로덕션 빌드 (tsc + vite)
npm run preview    # 빌드 결과 미리보기
npm run lint       # ESLint
npm run format     # Prettier 포맷 적용
```

## 디렉토리

```
src/
  App.tsx              # 레이아웃 조립 (HUD · 강화 무대 · 패널)
  components/
    TopBar.tsx         # HUD — 골드 / 단계 / 방지권 / 난이도
    EnhanceStage.tsx   # 검 표시 + 강화 / 판매 버튼
    PanelTabs.tsx      # 상점 / 조합소 / 인벤토리 탭
  store/
    uiStore.ts         # Zustand UI 상태 (난이도 · 활성 탭)
```

## 진행 상황

**스프린트 1 — 셋업 & 밸런스 표 확정** (진행 중)

- [x] 프로젝트 셋업 (Vite · React · TS · Tailwind v4 · Zustand · Motion · ESLint · Prettier)
- [x] 베이스 레이아웃 골격
- [ ] 데이터 시트 → 코드 상수화
- [ ] 밸런스 미확정 항목 확정 / 경제 시뮬레이션

이후 스프린트(핵심 강화 루프 → 상점 → 방지권·잡템·조합소 → 워프권 → 폴리시·배포)는 기획 문서 기준으로 순차 진행한다.

> 기획·데이터는 별도 디자인 문서(프로젝트 디자인 / 검 데이터 시트 / 프로젝트 로드맵)에서 관리.

## 라이선스

개인 학습용 클론 프로젝트.
