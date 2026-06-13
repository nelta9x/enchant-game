# DESIGN.md — 시각 디자인 토큰

에이전트·개발자가 UI 작업 시 일관된 디자인을 유지하기 위한 시각 토큰 문서.

> **단일 출처는 `src/index.css`의 `@theme` 블록이다.** 이 문서의 hex 값은 참고용 스냅샷 —
> 값이 어긋나면 CSS가 정답이고, 이 문서를 갱신한다.
> 모션·연출 *타이밍*은 이 문서의 범위 밖이다(맨 아래 [범위 밖](#범위-밖) 참조).

## 철칙

- **컴포넌트에 hex 하드코딩 금지.** 새 색이 필요하면 `@theme`에 `--color-*` 토큰을 먼저 추가하고
  Tailwind 유틸(`bg-panel`, `text-gold`, `border-frame/50` …)이나 `var(--color-*)`로 쓴다.
- motion 색 키프레임처럼 `var()`를 보간하지 못하는 곳은 `lib/cssToken.ts`의 `cssColorToken()`으로
  토큰을 런타임 1회 해석해 쓴다(사용례: `CommissionBar.tsx`의 SessionTimerBar). 캔버스 연출은
  `hitSparks.ts`(망치 불꽃)·`dotParticles.ts`(성공/파괴 도트 버스트)처럼 색을 1회 rgb로 해석·캐시한다
  (후자는 `coreVar`/`edgeVar`의 `var()`도 probe 엘리먼트의 computed color 로 정규화).
- 크기는 **rem**으로 쓴다(아래 [반응형·스케일링](#반응형스케일링) — 루트 font-size가 동적이라 px는 전체 스케일과 어긋난다).

## 아트 디렉션

"**양피지 스테이지 + 어두운 패널 + 금장/골드 강조 + 픽셀아트 스프라이트**" 톤.
화면 가장자리는 어두운 베젤, 메인 무대는 밝은 베이지(양피지), 정보 패널·버튼은 어두운 남색 계열,
가치(골드·강화 수치)는 황금색으로 통일한다. 컴포넌트는 토큰만 참조하므로 토큰 값 교체만으로
다크 톤 전환이 가능하도록 설계되어 있다(`index.css` 주석).

## 색 토큰

### 표면(Surface)

| 토큰             | 값          | 의미 · 대표 사용처                                                                         |
| ---------------- | ----------- | ------------------------------------------------------------------------------------------ |
| `bezel`          | `#16181d`   | 화면 외곽 어두운 프레임 — `GameScreen` 루트 `bg-bezel`                                     |
| `stage`          | `#cdc6b5`   | 양피지 메인 무대 — `GameScreen` 카드 `bg-stage`                                            |
| `stage-edge`     | `#b0a589`   | 양피지 테두리 — `border-stage-edge`                                                        |
| `parchment`      | `#ece6d6`   | 밝은 카드(예비 — 현재 미사용)                                                              |
| `parchment-line` | `#cabf9f`   | 밝은 카드 구분선(예비 — 현재 미사용)                                                       |
| `panel`          | `#2b3340`   | 어두운 패널·버튼 바탕 — 인벤토리/상점/이름 배너 `bg-panel`                                 |
| `panel-soft`     | `#353f4f`   | 패널의 밝은 변형 — 호버·보조 띠 `bg-panel-soft`, 그라데이션 짝(`from-panel-soft to-panel`) |
| `panel-edge`     | `#44506280` | 패널 테두리(반투명) — `border-panel-edge`                                                  |

### 텍스트 — 표면과 짝으로 쓴다

| 토큰           | 값        | 규칙                                                                  |
| -------------- | --------- | --------------------------------------------------------------------- |
| `ink`          | `#2c2a23` | **stage/parchment(밝은 면) 위** 진한 글자 — body 기본색               |
| `ink-soft`     | `#6d6650` | 밝은 면 위 보조 글자 — `RecordGauge` 라벨, 검 코너 결계 룬·수치(`SuccessRateSigil`·`ProtectionWard`·`HammerStation`) |
| `on-dark`      | `#e8e6df` | **panel(어두운 면) 위** 글자                                          |
| `on-dark-soft` | `#9aa2b2` | 어두운 면 위 보조 글자(수량·설명)                                     |

표면을 정하면 텍스트 색이 따라온다: `bg-stage → text-ink(-soft)`, `bg-panel → text-on-dark(-soft)`.
`-soft`는 항상 "보조 정보"라는 뜻이다.

### 강조·재화

| 토큰        | 값        | 의미 · 대표 사용처                                                                                                                              |
| ----------- | --------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `gold`      | `#f1c14b` | 게임의 핵심 강조색. 세 가지 의미로만 쓴다 — ① 가치(판매가 `SwordStage`) ② 강화 수치(`+N`, "강화" 라벨) ③ 재화(보유 골드 `GoldDisplay`, 비용 칩) |
| `gold-glow` | `#ffe79a` | gold의 밝은 변형 — 성공 파티클 코어, 출발 섬광(`LaunchFlare`), 글로우 그림자, 펄스 링                                                           |
| `frame`     | `#9c854f` | 금장 테두리 — 보조 버튼 `border-frame/50`, **중앙 검 마법진** `border-frame/25`, 게이지의 "지난 기록" 칸 `bg-frame`. ⚠️ 코너 결계(Sigil)는 frame 이 아니라 `ink-soft` — 아래 동기화 표 참조 |
| `silver`    | `#c2c7d1` | 은화(예비 — 현재 미사용)                                                                                                                        |

### 액션·결과

| 토큰           | 값        | 의미 · 대표 사용처                                                                            |
| -------------- | --------- | --------------------------------------------------------------------------------------------- |
| `enhance`      | `#2f93c8` | 청색 액션 — 상점 구매 버튼, 세그먼트 토글 선택값 `bg-enhance`                                 |
| `enhance-glow` | `#63d2ff` | 강화 청색 글로우(예비 — 현재 미사용)                                                          |
| `success`      | `#4caf6e` | "지금 가능" 초록 — 의뢰 카드 활성(`border-success` + `ring-success/60` + 글로우), 단축키 힌트 |
| `danger`       | `#d8654f` | 파괴·임박 적색 — 파괴 파티클 가장자리, 세션 타이머 임박색, 상점 부족 안내 `text-danger`       |
| `danger-glow`  | `#ff7a5c` | 파괴 파티클 코어(밝은 적색)                                                                   |

`-glow` 접미사 규칙: **같은 계열의 밝은 변형**으로, 파티클 코어·글로우 그림자·번쩍임에만 쓴다
(성공/파괴 버스트는 `coreVar`=glow, `edgeVar`=본색 짝 — `SuccessEffect`/`DestructionEffect`).

### 연출 전용

| 토큰                                                | 값                                      | 의미                                                                 |
| --------------------------------------------------- | --------------------------------------- | -------------------------------------------------------------------- |
| `floating-text`                                     | `#ffffff`                               | 강화 결과 플로팅 텍스트("아이구!…") 색                               |
| `hit-arc-core`                                      | `#ffffff`                               | 화염 백열 중심색 — 화구·불혀 그라데이션의 가장 뜨거운 속             |
| `hit-flash` → `hit-core` → `hit-edge` → `hit-ember` | `#ffc31f` `#ff7a10` `#f23d0a` `#4d1003` | 불티·잉걸불 "식는" 4-stop 보간 + 임팩트 화구·불혀 그라데이션         |
| `hammer-trail`                                      | `#ffffff`                               | 망치 스윙 모션 블러 스미어(실루엣 자국 색) — `hammerSmear.ts` 캔버스 |

`hit-*`·`hammer-trail`은 캔버스(`hitSparks.ts`/`hammerSmear.ts`) 전용 — 런타임에 1회 해석·캐시한다.

### 성공률 신호등(예비)

`rate-high #1f7a37` / `rate-mid #8a6300` / `rate-low #c0392b`.
베이지 무대 위 대비를 위해 진하게 보정된 값(밝은 gold는 베이지 위에서 안 읽힘 — `index.css` 주석).
**현재 미사용** — `SuccessRateSigil`은 신호등 대신 `ink-soft` 단색을 쓰기로 결정된 상태다.

## 타이포그래피

폰트: `system-ui, 'Segoe UI', Roboto, sans-serif`(웹폰트 없음, `index.css` body).

| 역할                | 관례                                                     | 예                                    |
| ------------------- | -------------------------------------------------------- | ------------------------------------- |
| 주역 라벨·이름 배너 | `text-2xl font-extrabold`                                | 강화 버튼 라벨, 검 이름(`SwordStage`) |
| 강조 수치           | `text-xl font-bold tabular-nums text-gold`               | 판매가, `+레벨`, 보조 버튼 라벨       |
| 패널 제목·본문      | `text-sm font-bold`(제목) / `font-semibold·medium`(본문) | 인벤토리 제목·아이템명                |
| 보조 정보           | `text-xs font-semibold` + `-soft` 색                     | 수량, 토글, 의뢰 카드 본문            |
| 마이크로 뱃지       | `text-[0.65rem]`~`text-[11px]`                           | 단축키 힌트, 결계 충전 수치           |

**수치 슬롯 고정 규칙**: 숫자에는 항상 `tabular-nums`를 쓰고, 자릿수가 변하는 금액·수량은
`min-w-[..] whitespace-nowrap text-center`로 자리를 고정해 UI가 들썩이지 않게 한다
(`GoldDisplay` `min-w-[7.5rem]`, `EnhanceButton` 비용 `min-w-[4.5rem]`, `SwordStage` 판매가 `min-w-[5rem]`).

## 크기·radius·그림자

### radius 단계

| 단계           | 용도                                                |
| -------------- | --------------------------------------------------- |
| `rounded-2xl`  | 주역 표면 — 강화 버튼, 모달 패널, 메인 카드         |
| `rounded-lg`   | 일반 — 패널·보조 버튼·의뢰 카드·골드창              |
| `rounded-md`   | 소형 컨트롤 — 세그먼트 토글, 인벤토리 행, 닫기 버튼 |
| `rounded-full` | 원형 연출·바 — 마법진, 타이머 바, 토스트, 파티클    |

### 그림자

- **글로우 그림자는 항상 토큰 변수로**: `shadow-[0_0_28px_-4px_var(--color-gold)]`(강화 버튼 활성),
  `shadow-[0_0_12px_-2px_var(--color-success)]`(의뢰 카드), `boxShadow: '0 0 22px 3px var(--color-gold-glow)'`(골드창 도달).
- 스프라이트 입체감은 `drop-shadow` 2단계: 일반 `[0_4px_10px_rgba(0,0,0,0.25)]`, 강조(망치) `[0_6px_10px_rgba(0,0,0,0.35)]`.
- 구조 그림자는 Tailwind 기본(`shadow-md`, `shadow-2xl`)을 쓴다.
- `rgba(0,0,0,α)`/`white`는 색이 아니라 **명암**(텍스트 섀도·오버레이 어둠·결계 흰빛) 용도로만 허용된다.

### 동기화가 필요한 고정 크기 (주석의 "바꾸면 같이 고칠 것" 모음)

| 값                                        | 의미                  | 동기화 대상                                                                                           |
| ----------------------------------------- | --------------------- | ----------------------------------------------------------------------------------------------------- |
| `16rem_28rem_16rem` + `gap-4` = **62rem** | 데스크탑 3컬럼 그리드 | `GameScreen`의 그리드·상단(TopControls) 밴드 래퍼 ↔ `CommissionBar` `lg:max-w-[62rem]` — 셋이 한 세트 |
| `h-52 sm:h-60`                            | 검 박스               | 스프라이트 `h-36 sm:h-40`, 잔상(`ShakeBurstEffect`)도 동일 클래스                                     |
| `h-20` · 오프셋 `±25%/-2%` · `opacity-45` · `ink-soft` 룬 | 검 코너 결계 3종 | `ProtectionWard`(좌상)·`HammerStation`(우상)·`SuccessRateSigil`(우하)가 크기·위치·투명도·색을 공유 — 하나만 바꾸면 셋이 어긋난다(망치 서클이 `opacity-50`이라 더 밝아 보였던 게 그 예). 중앙 마법진(frame)과 달리 코너는 `ink-soft`. 키울 땐 안쪽 모서리를 검 캔버스에서 떨어뜨린 채 오프셋을 바깥(코너)으로 민다 — 상한은 위쪽 인벤토리 패널과의 간격 |
| `lg:h-[21rem]`                            | 인벤토리 목록(골드 슬롯 1 + 4.5행) | 우측 액션 패널 `lg:h-[23.375rem]`(목록+헤더+패딩 합산값) — 골드는 별도 띠가 아니라 목록 맨 위 슬롯 행 |
| `h-14`                                    | 인벤토리 행(골드 슬롯 포함) | 목록 높이 계산(행수×56px+gap)의 기초                                                                  |
| clamp 분모 `66/48/72`                     | 루트 스케일 기준      | 콘텐츠 자연 치수(62rem 폭 등)에서 유도 — 레이아웃 치수 변경 시 재검토                                 |

## 반응형·스케일링

이 프로젝트는 미디어쿼리 분기 대신 **루트 font-size를 동적으로 바꿔 rem 기반 UI 전체를 균일
스케일**한다(`index.css :root`):

- 데스크탑: `clamp(16px, min(100vw/66, 100svh/48), 30px)` — 화면이 클수록 UI 전체가 커진다.
- 세로형(`<lg`): `min(16px, 100svh/72)` — 화면 높이에 맞춰 줄여 **페이지 스크롤 0**을 우선한다.
- 따라서 **UI 치수는 rem으로** 쓴다. px를 쓰면 그 요소만 스케일에서 빠져 어긋난다(보더 1px 등 의도적 절대값 제외).
- 미디어쿼리의 rem은 초기 16px 기준이라 **`lg`(1024px) 전환점은 스케일과 무관하게 고정**이다.
- 레이아웃 전환: `<lg` 세로 단일 컬럼 ↔ `lg+` 3컬럼(`16rem_28rem_16rem`). 중간 단계(sm)는 패딩·스프라이트 크기 미세 조정에만 쓴다.

## 픽셀아트 표현

- 모든 스프라이트 `<img>`: `imageRendering: 'pixelated'` + `draggable={false}` + `object-contain`
  (움직이는 연출 코인 등은 `select-none` 추가).
- 스프라이트 URL은 반드시 `lib/sprites.ts`(`swordSpriteUrl`/`itemSpriteUrl`) 경유 — `BASE_URL` 해석
  경계(CLAUDE.md 서버리스 빌드 규약). 파일 위치: `public/sprites/swords/`, `public/sprites/items/`.
- 아이콘 해석은 `ItemIcon` 한 곳: 검 스프라이트 → 아이템 스프라이트 → 토큰 아이콘(방패/보석) 폴백.

## 범위 밖

- **모션·연출 타이밍**: 시퀀스 타이밍("언제")은 데이터 `src/data/sources/animation.json` +
  `components/enhanceTimeline.ts`(타임라인 단일 출처), 모션 "모양" 상수는 각 연출 모듈
  (`coins.ts`·`particles.ts`·`drops.ts`·`shake.ts`·`goldGain.ts`·`floatingText.ts`)이 소유한다.
  경계 규칙은 `src/data/loadAnimation.ts` 머리 주석 참조.
- **사운드**: `lib/sound.ts`의 `SFX_FILES`/`BGM_FILES` 레지스트리(CLAUDE.md 규약).
