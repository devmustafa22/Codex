import type { AppData, Skill } from './types';
import { addDays, todayKey, weekKeys } from './dates';
export function skillMinutes(data: AppData, skill: Skill): number {
  return (
    skill.baselineMinutes +
    data.entries.filter((e) => e.skillId === skill.id).reduce((sum, e) => sum + e.minutes, 0)
  );
}
export function skillProgress(data: AppData, skill: Skill): number {
  const minutes = skillMinutes(data, skill);
  if (minutes >= skill.targetMinutes) return 100;
  return Math.min(99, Math.round((minutes / skill.targetMinutes) * 100));
}
export function weeklyMinutes(data: AppData, anchor = todayKey()): number {
  const days = weekKeys(anchor);
  return data.entries.filter((e) => days.includes(e.date)).reduce((sum, e) => sum + e.minutes, 0);
}
export function streakDays(data: AppData, anchor = todayKey()): number {
  const active = new Set(data.entries.map((e) => e.date));
  let day = active.has(anchor) ? anchor : addDays(anchor, -1);
  let streak = 0;
  while (active.has(day) && streak < 3660) {
    streak++;
    day = addDays(day, -1);
  }
  return streak;
}
export function dailyMinutes(data: AppData, date: string): number {
  return data.entries.filter((e) => e.date === date).reduce((sum, e) => sum + e.minutes, 0);
}
