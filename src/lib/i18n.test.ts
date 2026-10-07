import { describe, expect, it } from 'vitest';
import { messages } from '../locales';
import { getLanguage, getLocale, localizeMessage, setLanguage, t } from './i18n';
import { createDemoData } from './seed';
import { parseBackup } from './storage';
import { formatDate, formatMinutes, todayKey, weekKeys } from './dates';

describe('English and Arabic localization', () => {
  it('keeps every message complete with matching interpolation parameters', () => {
    const placeholders = (value: string) =>
      [...value.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort();
    for (const [key, message] of Object.entries(messages)) {
      expect(message.en.trim(), `${key} needs an English translation`).not.toBe('');
      expect(message.ar.trim(), `${key} needs an Arabic translation`).not.toBe('');
      expect(placeholders(message.en), key).toEqual(placeholders(message.ar));
    }
  });

  it('switches system labels and units while preserving the stored date convention', () => {
    const today = todayKey();
    const week = weekKeys();
    setLanguage('en');
    expect(getLanguage()).toBe('en');
    expect(getLocale()).toBe('en-US');
    expect(formatMinutes(30)).toBe('30 min');
    expect(formatDate('2026-10-07')).toContain('October');
    setLanguage('ar');
    expect(formatMinutes(30)).toBe('30 د');
    expect(todayKey()).toBe(today);
    expect(weekKeys()).toEqual(week);
  });

  it('re-localizes known service errors but preserves unknown content', () => {
    const arabic = t('common.signOutFailed');
    setLanguage('en');
    expect(localizeMessage(arabic)).toBe(t('common.signOutFailed'));
    expect(localizeMessage('ملاحظتي الشخصية حول المشروع')).toBe('ملاحظتي الشخصية حول المشروع');
  });

  it.each(['en', 'ar'] as const)(
    'generates fresh demo content in %s without changing existing records',
    (language) => {
      const existing = createDemoData();
      const serialized = JSON.stringify(existing);
      setLanguage(language);
      const fresh = createDemoData();
      expect(fresh.profile.language).toBe(language);
      expect(fresh.skills[0].name).toBe(language === 'en' ? 'UI design' : 'تصميم واجهات المستخدم');
      expect(JSON.stringify(existing)).toBe(serialized);
    },
  );

  it('accepts an older backup with no language preference', () => {
    const data = createDemoData();
    delete data.profile.language;
    expect(parseBackup(JSON.stringify(data))).toEqual(data);
  });

  it.each(['en', 'ar'] as const)(
    'restores a valid %s preference and keeps user text intact',
    (language) => {
      const data = createDemoData();
      data.profile.language = language;
      data.tasks[0].title = 'My task — مهمتي';
      expect(parseBackup(JSON.stringify(data))).toEqual(data);
    },
  );

  it.each(['fr', null, 123, ''])(
    'rejects an unsupported language value %s in a backup',
    (language) => {
      const data = createDemoData();
      const invalid = { ...data, profile: { ...data.profile, language } };
      expect(() => parseBackup(JSON.stringify(invalid))).toThrow();
    },
  );
});
