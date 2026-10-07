import { Languages } from 'lucide-react';
import { useLanguage } from '../state/LanguageContext';
import type { Language } from '../lib/i18n';

export function LanguageSwitcher({ onChange }: { onChange?: (language: Language) => void }) {
  const { language, setLanguage, t } = useLanguage();
  const next = language === 'en' ? 'ar' : 'en';
  const label = t(language === 'en' ? 'common.switchToArabic' : 'common.switchToEnglish');
  return (
    <button
      type="button"
      className="language-switcher"
      aria-label={label}
      title={label}
      onClick={() => {
        setLanguage(next);
        onChange?.(next);
      }}
    >
      <Languages size={18} aria-hidden="true" />
      <span lang={next} dir={next === 'ar' ? 'rtl' : 'ltr'}>
        {next === 'ar' ? 'العربية' : 'English'}
      </span>
    </button>
  );
}
