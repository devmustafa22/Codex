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
  return new Intl.DateTimeFormat(
    'ar-IQ-u-nu-latn',
    options ?? { day: 'numeric', month: 'long' },
  ).format(parseDate(key));
}
export function monthLabel(date: Date): string {
  return date.toLocaleDateString('ar-IQ-u-nu-latn', { month: 'long', year: 'numeric' });
}
export function weekKeys(anchor = todayKey()): string[] {
  const date = parseDate(anchor);
  const sinceMonday = (date.getDay() + 6) % 7;
  return Array.from({ length: 7 }, (_, i) => addDays(anchor, i - sinceMonday));
}
export function formatMinutes(minutes: number): string {
  if (minutes < 60) return `${Math.round(minutes)} د`;
  return `${Number((minutes / 60).toFixed(1))} س`;
}
export const shortDays = ['أحد', 'إثنين', 'ثلاثاء', 'أربعاء', 'خميس', 'جمعة', 'سبت'];
export const kindLabels = { learning: 'تعلّم', work: 'عمل', personal: 'شخصي', focus: 'تركيز' };
export const moodLabels = { great: 'ممتاز', good: 'جيد', okay: 'عادي', tough: 'متعب' };
