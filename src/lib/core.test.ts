import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppData } from './types';
import { addDays, todayKey, weekKeys } from './dates';
import { dailyMinutes, skillMinutes, skillProgress, streakDays, weeklyMinutes } from './metrics';
import { createDemoData } from './seed';
import { loadData, parseBackup, STORAGE_KEY } from './storage';

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-06T10:00:00Z'));
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function backupAfter(change: (data: AppData) => void): string {
  const data = createDemoData();
  change(data);
  return JSON.stringify(data);
}

function mockStorage(saved: string | null = null) {
  const storage = {
    getItem: vi.fn((_key: string) => saved),
    setItem: vi.fn(),
    removeItem: vi.fn(),
    clear: vi.fn(),
    key: vi.fn(),
    length: saved === null ? 0 : 1,
  };
  vi.stubGlobal('localStorage', storage);
  return storage;
}

describe('backup validation', () => {
  it('round-trips every demo field without changing text', () => {
    const data = createDemoData();
    data.tasks[0].title = '  عنوان مقصود بمسافات  ';
    expect(parseBackup(JSON.stringify(data))).toEqual(data);
  });

  it('accepts an empty personal workspace and unlinked activities', () => {
    const data = createDemoData();
    data.skills = [];
    for (const rows of [data.tasks, data.entries, data.events]) {
      for (const row of rows) row.skillId = '';
    }
    expect(parseBackup(JSON.stringify(data))).toEqual(data);
    data.tasks = [];
    data.entries = [];
    data.events = [];
    expect(parseBackup(JSON.stringify(data))).toEqual(data);
  });

  it.each(['{broken', 'null', '[]', '"data"', '{}'])(
    'rejects malformed or incomplete top-level data: %s',
    (text) => {
      expect(() => parseBackup(text)).toThrow('النسخة الاحتياطية غير صالحة');
    },
  );

  it('rejects an unsupported version', () => {
    expect(() => parseBackup(JSON.stringify({ ...createDemoData(), version: 2 }))).toThrow('إصدار');
  });

  it.each([
    ['task status', (data: AppData) => Object.assign(data.tasks[0], { status: 'blocked' })],
    ['task priority', (data: AppData) => Object.assign(data.tasks[0], { priority: 'urgent' })],
    ['entry kind', (data: AppData) => Object.assign(data.entries[0], { kind: 'unknown' })],
    ['entry mood', (data: AppData) => Object.assign(data.entries[0], { mood: 'unknown' })],
    ['event kind', (data: AppData) => Object.assign(data.events[0], { kind: 'unknown' })],
    ['theme', (data: AppData) => Object.assign(data.profile, { theme: 'system' })],
  ])('rejects an unknown %s', (_label, change) => {
    expect(() => parseBackup(backupAfter(change))).toThrow();
  });

  it.each([
    '2026-02-29',
    '2026-04-31',
    '2026-13-01',
    '2026-00-01',
    '2026-01-00',
    '0000-01-01',
    '26-10-06',
    '2026-10-06T12:00:00Z',
  ])('rejects a non-calendar date: %s', (invalidDate) => {
    expect(() =>
      parseBackup(
        backupAfter((data) => {
          data.tasks[0].dueDate = invalidDate;
        }),
      ),
    ).toThrow();
  });

  it('accepts leap days and rejects an impossible century leap day', () => {
    expect(() =>
      parseBackup(
        backupAfter((data) => {
          data.entries[0].date = '2000-02-29';
        }),
      ),
    ).not.toThrow();
    expect(() =>
      parseBackup(
        backupAfter((data) => {
          data.entries[0].date = '1900-02-29';
        }),
      ),
    ).toThrow();
  });

  it('checks creation, completion, activity, and event dates', () => {
    const changes = [
      (data: AppData) => {
        data.tasks[0].createdAt = '2026-02-30';
      },
      (data: AppData) => {
        data.tasks[0].completedAt = '2026-02-30';
      },
      (data: AppData) => {
        data.entries[0].date = '2026-02-30';
      },
      (data: AppData) => {
        data.events[0].date = '2026-02-30';
      },
    ];
    for (const change of changes) expect(() => parseBackup(backupAfter(change))).toThrow();
  });

  it('requires a completion date for completed tasks so analytics retain the completion', () => {
    expect(() =>
      parseBackup(
        backupAfter((data) => {
          data.tasks[0].status = 'done';
          delete data.tasks[0].completedAt;
        }),
      ),
    ).toThrow('تاريخ إنجاز');
    expect(() =>
      parseBackup(
        backupAfter((data) => {
          data.tasks[0].status = 'done';
          data.tasks[0].completedAt = '2026-10-06';
        }),
      ),
    ).not.toThrow();
  });

  it.each(['24:00', '12:60', '9:00', '', '12:00:00'])(
    'rejects invalid event time: %s',
    (startTime) => {
      expect(() =>
        parseBackup(
          backupAfter((data) => {
            data.events[0].startTime = startTime;
          }),
        ),
      ).toThrow();
    },
  );

  it('rejects duplicate identifiers within every collection', () => {
    for (const field of ['tasks', 'skills', 'entries', 'events'] as const) {
      expect(() =>
        parseBackup(
          backupAfter((data) => {
            data[field][1].id = data[field][0].id;
          }),
        ),
      ).toThrow('مكررة');
    }
  });

  it('allows the same identifier in separate collections', () => {
    expect(() =>
      parseBackup(
        backupAfter((data) => {
          data.tasks[0].id = data.entries[0].id;
        }),
      ),
    ).not.toThrow();
  });

  it.each([-1, 1.5, 10_000_001, Number.MAX_SAFE_INTEGER])(
    'rejects invalid activity minutes: %s',
    (minutes) => {
      expect(() =>
        parseBackup(
          backupAfter((data) => {
            data.entries[0].minutes = minutes;
          }),
        ),
      ).toThrow();
    },
  );

  it('requires positive skill targets and profile goals, and validates every minute field', () => {
    const changes = [
      (data: AppData) => {
        data.skills[0].targetMinutes = 0;
      },
      (data: AppData) => {
        data.skills[0].baselineMinutes = -1;
      },
      (data: AppData) => {
        data.skills[0].weeklyGoalMinutes = -1;
      },
      (data: AppData) => {
        data.profile.weeklyGoalMinutes = 0;
      },
      (data: AppData) => {
        data.profile.focusMinutes = 0;
      },
      (data: AppData) => {
        data.tasks[0].estimatedMinutes = -1;
      },
      (data: AppData) => {
        data.events[0].durationMinutes = -1;
      },
    ];
    for (const change of changes) expect(() => parseBackup(backupAfter(change))).toThrow();
  });

  it('rejects missing skills referenced by tasks, entries, or events', () => {
    for (const field of ['tasks', 'entries', 'events'] as const) {
      expect(() =>
        parseBackup(
          backupAfter((data) => {
            data[field][0].skillId = 'missing-skill';
          }),
        ),
      ).toThrow('مهارة غير موجودة');
    }
  });

  it('rejects missing and wrongly typed text fields and invalid colors', () => {
    const changes = [
      (data: AppData) => Object.assign(data.tasks[0], { title: '   ' }),
      (data: AppData) => Object.assign(data.tasks[0], { description: null }),
      (data: AppData) => Object.assign(data.skills[0], { name: 100 }),
      (data: AppData) => Object.assign(data.skills[0], { category: null }),
      (data: AppData) => Object.assign(data.skills[0], { description: false }),
      (data: AppData) => Object.assign(data.skills[0], { color: 'url(unsafe)' }),
      (data: AppData) => Object.assign(data.entries[0], { note: 99 }),
      (data: AppData) => Object.assign(data.events[0], { note: null }),
      (data: AppData) => Object.assign(data.profile, { role: null }),
      (data: AppData) => Object.assign(data.tasks[0], { id: '' }),
    ];
    for (const change of changes) expect(() => parseBackup(backupAfter(change))).toThrow();
    const data = createDemoData();
    delete (data.entries[0] as Partial<(typeof data.entries)[number]>).note;
    expect(() => parseBackup(JSON.stringify(data))).toThrow();
  });

  it('rejects a backup over five megabytes, measuring UTF-8 bytes', () => {
    expect(() => parseBackup(' '.repeat(5 * 1024 * 1024 + 1))).toThrow('5 ميغابايت');
    expect(() => parseBackup('م'.repeat(3 * 1024 * 1024))).toThrow('5 ميغابايت');
  });

  it('accepts a realistic activity history while bounding collection size', () => {
    const data = createDemoData();
    data.entries = Array.from({ length: 1_000 }, (_, index) => ({
      ...data.entries[0],
      id: `history-${index}`,
    }));
    expect(parseBackup(JSON.stringify(data)).entries).toHaveLength(1_000);
    const smallData = { ...data, entries: Array(50_001).fill({ id: 'e' }) };
    expect(() => parseBackup(JSON.stringify(smallData))).toThrow('الحد المسموح');
  });
});

describe('local persistence', () => {
  it('loads the demo without writing when no saved data exists', () => {
    const storage = mockStorage();
    expect(loadData()).toEqual({ data: createDemoData(), error: '' });
    expect(storage.getItem).toHaveBeenCalledWith(STORAGE_KEY);
    expect(storage.setItem).not.toHaveBeenCalled();
  });

  it('restores a valid personal backup', () => {
    const data = createDemoData();
    data.profile.name = 'اسم شخصي';
    mockStorage(JSON.stringify(data));
    expect(loadData()).toEqual({ data, error: '' });
  });

  it('preserves a corrupt original and returns an Arabic warning', () => {
    const raw = '{broken original';
    const storage = mockStorage(raw);
    const result = loadData();
    expect(result.data).toEqual(createDemoData());
    expect(result.error).toContain('البيانات الأصلية دون استبدالها');
    expect(result.error).not.toContain(raw);
    expect(storage.setItem).not.toHaveBeenCalled();
    expect(storage.removeItem).not.toHaveBeenCalled();
    expect(storage.clear).not.toHaveBeenCalled();
    expect(storage.getItem(STORAGE_KEY)).toBe(raw);
  });

  it('handles browsers that block local storage without exposing exception text', () => {
    const storage = mockStorage();
    storage.getItem.mockImplementation(() => {
      throw new Error('private storage error');
    });
    const result = loadData();
    expect(result.data).toEqual(createDemoData());
    expect(result.error).toContain('تعذّر');
    expect(result.error).not.toContain('private storage error');
    expect(storage.setItem).not.toHaveBeenCalled();
  });
});

describe('date arithmetic', () => {
  it('starts calendar weeks on Monday, including month boundaries', () => {
    expect(weekKeys('2026-03-01')).toEqual([
      '2026-02-23',
      '2026-02-24',
      '2026-02-25',
      '2026-02-26',
      '2026-02-27',
      '2026-02-28',
      '2026-03-01',
    ]);
    expect(weekKeys('2026-10-06')[0]).toBe('2026-10-05');
  });

  it('moves correctly across month, leap-day, and year boundaries', () => {
    expect(addDays('2026-01-31', 1)).toBe('2026-02-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(addDays('2024-03-01', -1)).toBe('2024-02-29');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
  });

  it('uses the Baghdad date near midnight UTC', () => {
    vi.setSystemTime(new Date('2026-10-05T22:00:00Z'));
    expect(todayKey()).toBe('2026-10-06');
  });
});

describe('progress metrics', () => {
  it('counts recorded activity, never a task estimate or completion, toward skills', () => {
    const data = createDemoData();
    const skill = data.skills[0];
    data.entries = [];
    expect(skillMinutes(data, skill)).toBe(skill.baselineMinutes);
    data.tasks[0].status = 'done';
    data.tasks[0].completedAt = todayKey();
    data.tasks[0].estimatedMinutes = 300;
    expect(skillMinutes(data, skill)).toBe(skill.baselineMinutes);
    data.entries.push({
      id: 'actual-work',
      title: 'تطبيق عملي',
      note: '',
      date: todayKey(),
      minutes: 45,
      skillId: skill.id,
      kind: 'learning',
      mood: 'good',
    });
    data.entries.push({
      ...data.entries[0],
      id: 'other-skill',
      skillId: data.skills[1].id,
      minutes: 200,
    });
    expect(skillMinutes(data, skill)).toBe(skill.baselineMinutes + 45);
  });

  it('caps displayed skill progress at 100 percent', () => {
    const data = createDemoData();
    data.skills[0].baselineMinutes = data.skills[0].targetMinutes + 100;
    expect(skillProgress(data, data.skills[0])).toBe(100);
  });

  it('does not display completion until the skill target is actually reached', () => {
    const data = createDemoData();
    const skill = data.skills[0];
    data.entries = [];
    skill.targetMinutes = 1000;
    skill.baselineMinutes = 999;
    expect(skillProgress(data, skill)).toBe(99);
    skill.baselineMinutes = 1000;
    expect(skillProgress(data, skill)).toBe(100);
  });

  it('counts only entries in the current Monday-to-Sunday week', () => {
    const data = createDemoData();
    const entry = data.entries[0];
    data.entries = [
      { ...entry, id: 'monday', date: '2026-10-05', minutes: 30 },
      { ...entry, id: 'sunday', date: '2026-10-11', minutes: 40 },
      { ...entry, id: 'previous', date: '2026-10-04', minutes: 500 },
      { ...entry, id: 'next', date: '2026-10-12', minutes: 600 },
    ];
    expect(weeklyMinutes(data, '2026-10-06')).toBe(70);
    expect(dailyMinutes(data, '2026-10-05')).toBe(30);
    expect(dailyMinutes(data, '2026-10-06')).toBe(0);
  });

  it('counts consecutive active days once and keeps yesterday’s streak before today’s entry', () => {
    const data = createDemoData();
    const entry = data.entries[0];
    data.entries = ['2026-10-05', '2026-10-05', '2026-10-04', '2026-10-03', '2026-10-01'].map(
      (date, i) => ({ ...entry, date, id: `streak-${i}` }),
    );
    expect(streakDays(data, '2026-10-06')).toBe(3);
    data.entries.push({ ...entry, id: 'today', date: '2026-10-06' });
    expect(streakDays(data, '2026-10-06')).toBe(4);
    expect(streakDays({ ...data, entries: [] }, '2026-10-06')).toBe(0);
  });
});
