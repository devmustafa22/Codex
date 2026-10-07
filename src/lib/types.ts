import type { TextSize } from './appearance';
import type { Language } from './i18n';

export type PageId =
  'dashboard' | 'tasks' | 'skills' | 'calendar' | 'journal' | 'insights' | 'settings' | 'admin';
export type TaskStatus = 'todo' | 'in-progress' | 'done';
export type Priority = 'low' | 'medium' | 'high';
export type EntryKind = 'learning' | 'work' | 'personal' | 'focus';
export type Mood = 'great' | 'good' | 'okay' | 'tough';
export interface Task {
  id: string;
  title: string;
  description: string;
  dueDate: string;
  status: TaskStatus;
  priority: Priority;
  skillId: string;
  estimatedMinutes: number;
  createdAt: string;
  completedAt?: string;
}
export interface Skill {
  id: string;
  name: string;
  category: string;
  color: string;
  targetMinutes: number;
  baselineMinutes: number;
  weeklyGoalMinutes: number;
  description: string;
}
export interface JournalEntry {
  id: string;
  title: string;
  note: string;
  date: string;
  minutes: number;
  skillId: string;
  kind: EntryKind;
  mood: Mood;
}
export interface CalendarEvent {
  id: string;
  title: string;
  date: string;
  startTime: string;
  durationMinutes: number;
  kind: EntryKind;
  skillId: string;
  note: string;
}
export interface Profile {
  name: string;
  role: string;
  weeklyGoalMinutes: number;
  focusMinutes: number;
  theme: 'light' | 'dark';
  /** Older workspaces and backups default to the original text size. */
  textSize?: TextSize;
  language?: Language;
}
export interface AppData {
  version: 1;
  profile: Profile;
  tasks: Task[];
  skills: Skill[];
  entries: JournalEntry[];
  events: CalendarEvent[];
}
export type NewTask = Omit<Task, 'id' | 'createdAt' | 'completedAt'>;
export type NewSkill = Omit<Skill, 'id'>;
export type NewEntry = Omit<JournalEntry, 'id'>;
export type NewEvent = Omit<CalendarEvent, 'id'>;
