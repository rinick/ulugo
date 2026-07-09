import deDE from 'antd/locale/de_DE';
import enUS from 'antd/locale/en_US';
import frFR from 'antd/locale/fr_FR';
import jaJP from 'antd/locale/ja_JP';
import koKR from 'antd/locale/ko_KR';
import ruRU from 'antd/locale/ru_RU';
import zhCN from 'antd/locale/zh_CN';
import deFlagUrl from '../assets/flags/de.svg';
import enUsFlagUrl from '../assets/flags/en-us.svg';
import frFlagUrl from '../assets/flags/fr.svg';
import jaFlagUrl from '../assets/flags/ja.svg';
import koFlagUrl from '../assets/flags/ko.svg';
import ruFlagUrl from '../assets/flags/ru.svg';
import zhCnFlagUrl from '../assets/flags/zh-cn.svg';

export const antdLocales = {
  de: deDE,
  en: enUS,
  fr: frFR,
  ja: jaJP,
  ko: koKR,
  ru: ruRU,
  zh: zhCN,
} as const;

export type AppLanguage = keyof typeof antdLocales;

export const languageOptions: {value: AppLanguage; label: string; flagSrc: string}[] = [
  {value: 'en', label: 'English', flagSrc: enUsFlagUrl},
  {value: 'zh', label: '中文', flagSrc: zhCnFlagUrl},
  {value: 'ja', label: '日本語', flagSrc: jaFlagUrl},
  {value: 'ko', label: '한국어', flagSrc: koFlagUrl},
  {value: 'fr', label: 'Français', flagSrc: frFlagUrl},
  {value: 'de', label: 'Deutsch', flagSrc: deFlagUrl},
  {value: 'ru', label: 'Русский', flagSrc: ruFlagUrl},
];

const languageStorageKey = 'ulugo.language';

export function normalizeLanguage(language: string): AppLanguage {
  return matchLanguage(language) ?? 'en';
}

export function resolveInitialLanguage(): AppLanguage {
  const storedLanguage = readStoredLanguage();
  if (storedLanguage != null) return storedLanguage;

  const browserLanguages = typeof navigator === 'undefined' ? [] : [...(navigator.languages ?? []), navigator.language];
  for (const language of browserLanguages) {
    const match = matchLanguage(language);
    if (match != null) return match;
  }

  return 'en';
}

export function saveLanguage(language: AppLanguage): void {
  try {
    localStorage.setItem(languageStorageKey, language);
  } catch {
    // Ignore storage failures; language still changes for this session.
  }
}

function readStoredLanguage(): AppLanguage | null {
  try {
    const language = localStorage.getItem(languageStorageKey);
    return language == null ? null : matchLanguage(language);
  } catch {
    return null;
  }
}

function matchLanguage(language: string): AppLanguage | null {
  const baseLanguage = language.split('-')[0];
  return baseLanguage in antdLocales ? (baseLanguage as AppLanguage) : null;
}
