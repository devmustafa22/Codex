import type { AppData } from './types';
import { createDemoData } from './seed';
import { TEXT_SIZE_OPTIONS } from './appearance';

export const STORAGE_KEY = 'madar:data:v1';

const MAX_BACKUP_BYTES = 5 * 1024 * 1024;
const MAX_ACTIVITIES = 50_000;
const MAX_SKILLS = 10_000;
const MAX_MINUTES = 10_000_000;
const STORAGE_WARNING =
  'تعذّر قراءة بياناتك المحفوظة. نعرض بيانات تجريبية مؤقتاً، مع الاحتفاظ بالبيانات الأصلية دون استبدالها. يمكنك استرجاع نسخة احتياطية من الإعدادات.';

type RecordValue = Record<string, unknown>;

function invalid(message: string): never {
  throw new Error(`النسخة الاحتياطية غير صالحة: ${message}`);
}

function record(value: unknown, label: string): RecordValue {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    invalid(`بيانات ${label} غير مكتملة.`);
  }
  return value as RecordValue;
}

function string(
  value: unknown,
  label: string,
  maxLength = 500,
  required = false,
): asserts value is string {
  if (typeof value !== 'string' || value.length > maxLength || (required && !value.trim())) {
    invalid(`تحقّق من ${label}.`);
  }
}

function minutes(value: unknown, label: string, positive = false): void {
  if (
    typeof value !== 'number' ||
    !Number.isSafeInteger(value) ||
    value < (positive ? 1 : 0) ||
    value > MAX_MINUTES
  ) {
    invalid(
      `${label} يجب أن يكون عدداً صحيحاً ${positive ? 'أكبر من صفر' : 'غير سالب'} ضمن الحدود المسموحة.`,
    );
  }
}

function choice(value: unknown, values: readonly string[], label: string): void {
  if (typeof value !== 'string' || !values.includes(value)) invalid(`قيمة ${label} غير معروفة.`);
}

function date(value: unknown, label: string): void {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value))
    invalid(`صيغة ${label} غير صحيحة.`);
  const [year, month, day] = value.split('-').map(Number);
  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysInMonth = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (year < 1 || month < 1 || month > 12 || day < 1 || day > daysInMonth[month - 1]) {
    invalid(`${label} لا يمثّل يوماً صالحاً في التقويم.`);
  }
}

function collection(value: unknown, label: string, limit = MAX_ACTIVITIES): RecordValue[] {
  if (!Array.isArray(value) || value.length > limit)
    invalid(`قائمة ${label} غير صالحة أو تتجاوز الحد المسموح.`);
  const ids = new Set<string>();
  return value.map((item) => {
    const row = record(item, label);
    string(row.id, `معرّف ${label}`, 200, true);
    if (ids.has(row.id)) invalid(`توجد معرّفات مكررة في ${label}.`);
    ids.add(row.id);
    return row;
  });
}

function skillReference(value: unknown, skillIds: Set<string>): void {
  string(value, 'المهارة المرتبطة', 200);
  if (value !== '' && !skillIds.has(value)) invalid('يوجد سجل مرتبط بمهارة غير موجودة.');
}

/** Validate untrusted JSON before it can replace the user's current data. */
export function parseBackup(text: string): AppData {
  if (
    text.length > MAX_BACKUP_BYTES ||
    new TextEncoder().encode(text).byteLength > MAX_BACKUP_BYTES
  ) {
    invalid('حجم الملف يتجاوز 5 ميغابايت.');
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    invalid('تعذّر قراءة ملف JSON.');
  }

  const data = record(parsed, 'المشروع');
  if (data.version !== 1) invalid('إصدار الملف غير مدعوم.');

  const profile = record(data.profile, 'الملف الشخصي');
  string(profile.name, 'الاسم', 160, true);
  string(profile.role, 'الوصف الشخصي', 500);
  minutes(profile.weeklyGoalMinutes, 'هدف الأسبوع', true);
  minutes(profile.focusMinutes, 'مدة التركيز', true);
  choice(profile.theme, ['light', 'dark'], 'المظهر');
  if (profile.textSize !== undefined) {
    choice(
      profile.textSize,
      TEXT_SIZE_OPTIONS.map((option) => option.value),
      'حجم الخط',
    );
  }

  const skills = collection(data.skills, 'المهارات', MAX_SKILLS);
  for (const skill of skills) {
    string(skill.name, 'اسم المهارة', 160, true);
    string(skill.category, 'تصنيف المهارة', 120);
    string(skill.description, 'وصف المهارة', 20_000);
    if (typeof skill.color !== 'string' || !/^#[\da-f]{6}$/i.test(skill.color))
      invalid('لون المهارة غير صالح.');
    minutes(skill.targetMinutes, 'هدف المهارة', true);
    minutes(skill.baselineMinutes, 'رصيد المهارة السابق');
    minutes(skill.weeklyGoalMinutes, 'هدف المهارة الأسبوعي');
  }
  const skillIds = new Set(skills.map((skill) => skill.id as string));

  const tasks = collection(data.tasks, 'المهام');
  for (const task of tasks) {
    string(task.title, 'عنوان المهمة', 500, true);
    string(task.description, 'وصف المهمة', 20_000);
    date(task.dueDate, 'موعد المهمة');
    date(task.createdAt, 'تاريخ إنشاء المهمة');
    if (task.completedAt !== undefined) date(task.completedAt, 'تاريخ إنجاز المهمة');
    if (task.status === 'done' && task.completedAt === undefined) {
      invalid('المهمة المكتملة تحتاج تاريخ إنجاز حتى يظهر تقدّمك في الإحصائيات.');
    }
    choice(task.status, ['todo', 'in-progress', 'done'], 'حالة المهمة');
    choice(task.priority, ['low', 'medium', 'high'], 'أولوية المهمة');
    minutes(task.estimatedMinutes, 'وقت المهمة');
    skillReference(task.skillId, skillIds);
  }

  const entries = collection(data.entries, 'الأنشطة');
  for (const entry of entries) {
    string(entry.title, 'عنوان النشاط', 500, true);
    string(entry.note, 'ملاحظة النشاط', 20_000);
    date(entry.date, 'تاريخ النشاط');
    minutes(entry.minutes, 'وقت النشاط');
    choice(entry.kind, ['learning', 'work', 'personal', 'focus'], 'نوع النشاط');
    choice(entry.mood, ['great', 'good', 'okay', 'tough'], 'المزاج');
    skillReference(entry.skillId, skillIds);
  }

  const events = collection(data.events, 'المواعيد');
  for (const event of events) {
    string(event.title, 'عنوان الموعد', 500, true);
    string(event.note, 'ملاحظة الموعد', 20_000);
    date(event.date, 'تاريخ الموعد');
    if (typeof event.startTime !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(event.startTime)) {
      invalid('وقت الموعد يجب أن يكون بصيغة الساعة والدقيقة.');
    }
    minutes(event.durationMinutes, 'مدة الموعد');
    choice(event.kind, ['learning', 'work', 'personal', 'focus'], 'نوع الموعد');
    skillReference(event.skillId, skillIds);
  }

  // All known fields have been checked; preserve the backup's text without trimming it.
  return data as unknown as AppData;
}

/** Never overwrite unreadable storage: only explicit import/reset may replace it. */
export function loadData(): { data: AppData; error: string } {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return { data: saved === null ? createDemoData() : parseBackup(saved), error: '' };
  } catch {
    return { data: createDemoData(), error: STORAGE_WARNING };
  }
}
