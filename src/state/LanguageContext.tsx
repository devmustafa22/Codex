import { createContext, useContext, useMemo, useSyncExternalStore } from 'react';
import type { ReactNode } from 'react';
import { getLanguage, setLanguage, subscribeLanguage, t } from '../lib/i18n';
import type { Language } from '../lib/i18n';

interface LanguageContextValue {
  language: Language;
  setLanguage: typeof setLanguage;
  t: typeof t;
}
const LanguageContext = createContext<LanguageContextValue | null>(null);

export function LanguageProvider({ children }: { children: ReactNode }) {
  const language = useSyncExternalStore(subscribeLanguage, getLanguage, () => 'en' as const);
  const value = useMemo(() => ({ language, setLanguage, t }), [language]);
  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage(): LanguageContextValue {
  const context = useContext(LanguageContext);
  if (!context) throw new Error('useLanguage requires LanguageProvider');
  return context;
}
