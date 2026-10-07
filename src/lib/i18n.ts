import { messages } from '../locales';
import type { Language, TranslationParams } from '../locales/types';

export type { Language } from '../locales/types';
export const LANGUAGE_STORAGE_KEY = 'madar:language';

function savedLanguage(): Language {
  try {
    return localStorage.getItem(LANGUAGE_STORAGE_KEY) === 'ar' ? 'ar' : 'en';
  } catch {
    return 'en';
  }
}

let currentLanguage: Language = savedLanguage();
const listeners = new Set<() => void>();

function applyDocumentLanguage() {
  if (typeof document === 'undefined') return;
  document.documentElement.lang = currentLanguage;
  document.documentElement.dir = currentLanguage === 'ar' ? 'rtl' : 'ltr';
}
applyDocumentLanguage();

export function getLanguage(): Language {
  return currentLanguage;
}

export function getLocale(): string {
  return currentLanguage === 'ar' ? 'ar-IQ-u-nu-latn' : 'en-US';
}

export function setLanguage(language: Language): void {
  if (language !== 'en' && language !== 'ar') return;
  try {
    localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
  } catch {
    // The signed-in workspace can still preserve the preference in the cloud.
  }
  if (currentLanguage === language) return;
  currentLanguage = language;
  applyDocumentLanguage();
  for (const listener of listeners) listener();
}

export function subscribeLanguage(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function t(key: string, params: TranslationParams = {}): string {
  const text = messages[key]?.[currentLanguage] ?? key;
  return text.replace(/\{(\w+)\}/g, (token, name: string) => String(params[name] ?? token));
}

/** Re-localize known service messages when a language changes after an error. */
export function localizeMessage(text: string): string {
  for (const message of Object.values(messages)) {
    if (message.en === text || message.ar === text) return message[currentLanguage];
  }
  return text;
}
