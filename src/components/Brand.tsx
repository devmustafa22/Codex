import { useLanguage } from '../state/LanguageContext';
export function Brand({ compact = false }: { compact?: boolean }) {
  const { t } = useLanguage();
  return (
    <div className="brand">
      <span className="brand-symbol">
        <svg viewBox="0 0 42 42" aria-hidden="true">
          <ellipse cx="21" cy="21" rx="17" ry="8" transform="rotate(-43 21 21)" />
          <circle cx="21" cy="21" r="6" />
          <circle className="orbit-point" cx="34" cy="10" r="3.2" />
        </svg>
      </span>
      {!compact && (
        <div>
          <strong>
            {t('shell.brand.name')}
            <span>.</span>
          </strong>
          <span>{t('shell.brand.tagline')}</span>
        </div>
      )}
    </div>
  );
}
