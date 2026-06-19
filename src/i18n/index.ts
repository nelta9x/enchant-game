import { useMemo } from 'react'
import { create } from 'zustand'
import { ko, type TranslationKey } from './locales/ko'
import { en } from './locales/en'

export type Lang = 'ko' | 'en'

// 지원 언어 목록 (언어 토글 UI 등에서 사용).
export const LANGS: Lang[] = ['ko', 'en']

// 언어별 리소스 테이블. 각 로케일은 동일한 TranslationKey 집합을 갖는다.
const resources: Record<Lang, Record<TranslationKey, string>> = { ko, en }

type I18nState = {
  lang: Lang
  setLang: (lang: Lang) => void
}

// 현재 언어 상태 store.
export const useI18nStore = create<I18nState>((set) => ({
  lang: 'ko',
  setLang: (lang) => set({ lang }),
}))

// 현재 언어 기준 번역 함수 t(key)를 반환하는 훅.
// resources 가 모든 키를 보유하도록 타입 강제되므로 항상 string을 반환한다.
export function useT() {
  const lang = useI18nStore((s) => s.lang)
  // lang 이 바뀔 때만 새 함수를 만든다 — t 식별자를 안정화해 t 를 prop/deps 로 받는 자식(React.memo)이
  // 매 렌더 깨지지 않게 한다(값은 동일 — 같은 키엔 같은 문자열).
  return useMemo(() => (key: TranslationKey) => resources[lang][key], [lang])
}

export { resources }
export type { TranslationKey }
