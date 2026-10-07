import { getLocale, t } from './i18n';

export function dateKey(value: Date = new Date()): string {
  const year = String(value.getFullYear()).padStart(4, '0');
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
export function todayKey(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Baghdad',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}
export function parseDate(key: string): Date {
  return new Date(`${key}T12:00:00`);
}
export function addDays(key: string, days: number): string {
  const date = parseDate(key);
  date.setDate(date.getDate() + days);
  return dateKey(date);
}
export function formatDate(key: string, options?: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat(getLocale(), options ?? { day: 'numeric', month: 'long' }).format(
    parseDate(key),
  );
}
export function monthLabel(date: Date): string {
  return date.toLocaleDateString(getLocale(), { month: 'long', year: 'numeric' });
}
export function weekKeys(anchor = todayKey()): string[] {
  const date = parseDate(anchor);
  const sinceMonday = (date.getDay() + 6) % 7;
  return Array.from({ length: 7 }, (_, i) => addDays(anchor, i - sinceMonday));
}
export function formatMinutes(minutes: number): string {
  if (minutes < 60) return t('common.minutesShort', { value: Math.round(minutes) });
  return t('common.hoursShort', { value: Number((minutes / 60).toFixed(1)) });
}
export function getShortDays(): string[] {
  return Array.from({ length: 7 }, (_, index) =>
    new Intl.DateTimeFormat(getLocale(), { weekday: 'short' }).format(
      new Date(2026, 9, 4 + index, 12),
    ),
  );
}
export const kindLabels = {
  learning: 'common.kind.learning',
  work: 'common.kind.work',
  personal: 'common.kind.personal',
  focus: 'common.kind.focus',
};
export const moodLabels = {
  great: 'common.mood.great',
  good: 'common.mood.good',
  okay: 'common.mood.okay',
  tough: 'common.mood.tough',
};
