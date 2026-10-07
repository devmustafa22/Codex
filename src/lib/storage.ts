import { t } from './i18n';
import type { AppData } from './types';
import { createDemoData } from './seed';
import { TEXT_SIZE_OPTIONS } from './appearance';

export const STORAGE_KEY = 'madar:data:v1';

const MAX_BACKUP_BYTES = 5 * 1024 * 1024;
const MAX_ACTIVITIES = 50_000;
const MAX_SKILLS = 10_000;
const MAX_MINUTES = 10_000_000;
const storageWarningMessage = () => t('auth.storageUnreadable');

type RecordValue = Record<string, unknown>;

function invalid(message: string): never {
  throw new Error(t('auth.backupInvalid', { message }));
}

function record(value: unknown, label: string): RecordValue {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    invalid(t('auth.backupIncomplete', { label }));
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
    invalid(t('auth.backupCheck', { label }));
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
      t('auth.backupMinutes', {
        label,
        limit: positive ? t('auth.backupPositive') : t('auth.backupNonnegative'),
      }),
    );
  }
}

function choice(value: unknown, values: readonly string[], label: string): void {
  if (typeof value !== 'string' || !values.includes(value))
    invalid(t('auth.backupUnknownChoice', { label }));
}

function date(value: unknown, label: string): void {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value))
    invalid(t('auth.backupDateFormat', { label }));
  const [year, month, day] = value.split('-').map(Number);
  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysInMonth = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (year < 1 || month < 1 || month > 12 || day < 1 || day > daysInMonth[month - 1]) {
    invalid(t('auth.backupDateInvalid', { label }));
  }
}

function collection(value: unknown, label: string, limit = MAX_ACTIVITIES): RecordValue[] {
  if (!Array.isArray(value) || value.length > limit)
    invalid(t('auth.backupCollectionInvalid', { label }));
  const ids = new Set<string>();
  return value.map((item) => {
    const row = record(item, label);
    string(row.id, t('auth.backupIdentifier', { label }), 200, true);
    if (ids.has(row.id)) invalid(t('auth.backupDuplicateId', { label }));
    ids.add(row.id);
    return row;
  });
}

function skillReference(value: unknown, skillIds: Set<string>): void {
  string(value, t('auth.backupLabel.linkedSkill'), 200);
  if (value !== '' && !skillIds.has(value)) invalid(t('auth.backupSkillMissing'));
}

/** Validate untrusted JSON before it can replace the user's current data. */
export function parseBackup(text: string): AppData {
  if (
    text.length > MAX_BACKUP_BYTES ||
    new TextEncoder().encode(text).byteLength > MAX_BACKUP_BYTES
  ) {
    invalid(t('auth.backupTooLarge'));
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    invalid(t('auth.backupJsonInvalid'));
  }

  const data = record(parsed, t('auth.backupLabel.project'));
  if (data.version !== 1) invalid(t('auth.backupVersionUnsupported'));

  const profile = record(data.profile, t('auth.backupLabel.profile'));
  string(profile.name, t('auth.backupLabel.name'), 160, true);
  string(profile.role, t('auth.backupLabel.description'), 500);
  minutes(profile.weeklyGoalMinutes, t('auth.backupLabel.weeklyGoal'), true);
  minutes(profile.focusMinutes, t('auth.backupLabel.focusDuration'), true);
  choice(profile.theme, ['light', 'dark'], t('auth.backupLabel.theme'));
  if (profile.textSize !== undefined) {
    choice(
      profile.textSize,
      TEXT_SIZE_OPTIONS.map((option) => option.value),
      t('auth.backupLabel.textSize'),
    );
  }

  if (profile.language !== undefined) {
    choice(profile.language, ['en', 'ar'], t('auth.backupLabel.language'));
  }

  const skills = collection(data.skills, t('auth.backupLabel.skills'), MAX_SKILLS);
  for (const skill of skills) {
    string(skill.name, t('auth.backupLabel.skillName'), 160, true);
    string(skill.category, t('auth.backupLabel.skillCategory'), 120);
    string(skill.description, t('auth.backupLabel.skillDescription'), 20_000);
    if (typeof skill.color !== 'string' || !/^#[\da-f]{6}$/i.test(skill.color))
      invalid(t('auth.backupColorInvalid'));
    minutes(skill.targetMinutes, t('auth.backupLabel.skillGoal'), true);
    minutes(skill.baselineMinutes, t('auth.backupLabel.skillBaseline'));
    minutes(skill.weeklyGoalMinutes, t('auth.backupLabel.skillWeeklyGoal'));
  }
  const skillIds = new Set(skills.map((skill) => skill.id as string));

  const tasks = collection(data.tasks, t('auth.backupLabel.tasks'));
  for (const task of tasks) {
    string(task.title, t('auth.backupLabel.taskTitle'), 500, true);
    string(task.description, t('auth.backupLabel.taskDescription'), 20_000);
    date(task.dueDate, t('auth.backupLabel.taskDueDate'));
    date(task.createdAt, t('auth.backupLabel.taskCreated'));
    if (task.completedAt !== undefined) date(task.completedAt, t('auth.backupLabel.taskCompleted'));
    if (task.status === 'done' && task.completedAt === undefined) {
      invalid(t('auth.backupCompletionDateRequired'));
    }
    choice(task.status, ['todo', 'in-progress', 'done'], t('auth.backupLabel.taskStatus'));
    choice(task.priority, ['low', 'medium', 'high'], t('auth.backupLabel.taskPriority'));
    minutes(task.estimatedMinutes, t('auth.backupLabel.taskMinutes'));
    skillReference(task.skillId, skillIds);
  }

  const entries = collection(data.entries, t('auth.backupLabel.entries'));
  for (const entry of entries) {
    string(entry.title, t('auth.backupLabel.entryTitle'), 500, true);
    string(entry.note, t('auth.backupLabel.entryNote'), 20_000);
    date(entry.date, t('auth.backupLabel.entryDate'));
    minutes(entry.minutes, t('auth.backupLabel.entryMinutes'));
    choice(entry.kind, ['learning', 'work', 'personal', 'focus'], t('auth.backupLabel.entryKind'));
    choice(entry.mood, ['great', 'good', 'okay', 'tough'], t('auth.backupLabel.mood'));
    skillReference(entry.skillId, skillIds);
  }

  const events = collection(data.events, t('auth.backupLabel.events'));
  for (const event of events) {
    string(event.title, t('auth.backupLabel.eventTitle'), 500, true);
    string(event.note, t('auth.backupLabel.eventNote'), 20_000);
    date(event.date, t('auth.backupLabel.eventDate'));
    if (typeof event.startTime !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(event.startTime)) {
      invalid(t('auth.backupEventTimeInvalid'));
    }
    minutes(event.durationMinutes, t('auth.backupLabel.eventDuration'));
    choice(event.kind, ['learning', 'work', 'personal', 'focus'], t('auth.backupLabel.eventKind'));
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
    return { data: createDemoData(), error: storageWarningMessage() };
  }
}
