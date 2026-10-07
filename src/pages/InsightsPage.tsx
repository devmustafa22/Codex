import { useMemo, useState } from 'react';
import type { KeyboardEvent } from 'react';
import {
  ArrowUpLeft,
  CalendarDays,
  CheckCheck,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Flame,
  Target,
  TrendingUp,
} from 'lucide-react';
import { Card, EmptyState, PageHeader, ProgressBar } from '../components/ui';
import {
  addDays,
  dateKey,
  formatDate,
  formatMinutes,
  kindLabels,
  parseDate,
  todayKey,
  weekKeys,
} from '../lib/dates';
import type { JournalEntry, PageId, Task } from '../lib/types';
import { useApp } from '../state/AppContext';
import { useLanguage } from '../state/LanguageContext';
import { getLocale } from '../lib/i18n';

type Period = 'week' | 'month' | 'year';
interface TimeBucket {
  start: string;
  end: string;
  label: string;
  minutes: number;
}
interface ReviewSuggestion {
  title: string;
  description: string;
  page: PageId;
  action: string;
}

const periodLabels: Record<Period, string> = {
  week: 'planning.insights.period.week',
  month: 'planning.insights.period.month',
  year: 'planning.insights.period.year',
};
const completedDate = (task: Task) => task.completedAt?.slice(0, 10) ?? '';
const totalMinutes = (entries: JournalEntry[]) =>
  entries.reduce((sum, entry) => sum + entry.minutes, 0);

function periodBounds(period: Period, today: string): { start: string; end: string } {
  const anchor = parseDate(today);
  if (period === 'week') {
    const days = weekKeys(today);
    return { start: days[0], end: days[6] };
  }
  if (period === 'month')
    return {
      start: dateKey(new Date(anchor.getFullYear(), anchor.getMonth(), 1)),
      end: dateKey(new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0)),
    };
  return { start: `${anchor.getFullYear()}-01-01`, end: `${anchor.getFullYear()}-12-31` };
}

function chartBuckets(
  period: Period,
  start: string,
  end: string,
  entries: JournalEntry[],
): TimeBucket[] {
  const ranges: Omit<TimeBucket, 'minutes'>[] = [];
  const number = new Intl.NumberFormat(getLocale());
  if (period === 'week') {
    for (let day = start; day <= end; day = addDays(day, 1))
      ranges.push({ start: day, end: day, label: formatDate(day, { weekday: 'short' }) });
  } else if (period === 'month') {
    for (let week = weekKeys(start)[0]; week <= end; week = addDays(week, 7)) {
      const first = week < start ? start : week;
      const last = addDays(week, 6) > end ? end : addDays(week, 6);
      ranges.push({
        start: first,
        end: last,
        label: `${number.format(parseDate(first).getDate())}–${number.format(parseDate(last).getDate())}`,
      });
    }
  } else {
    const year = parseDate(start).getFullYear();
    for (let month = 0; month < 12; month++) {
      const first = dateKey(new Date(year, month, 1));
      ranges.push({
        start: first,
        end: dateKey(new Date(year, month + 1, 0)),
        label: formatDate(first, { month: 'short' }),
      });
    }
  }
  return ranges.map((range) => ({
    ...range,
    minutes: totalMinutes(
      entries.filter((entry) => entry.date >= range.start && entry.date <= range.end),
    ),
  }));
}

export default function InsightsPage() {
  const { data, setPage } = useApp();
  const { language, t } = useLanguage();
  const number = new Intl.NumberFormat(getLocale());
  const yearNumber = new Intl.NumberFormat(getLocale(), { useGrouping: false });
  const today = todayKey();
  const [period, setPeriod] = useState<Period>('week');
  const [heatmapYear, setHeatmapYear] = useState(() => parseDate(today).getFullYear());
  const [selectedDay, setSelectedDay] = useState(today);
  const { start, end } = periodBounds(period, today);
  // Future plans belong to the calendar. Recorded progress is measured up to today.
  const cutoff = end < today ? end : today;
  const entries = data.entries.filter((entry) => entry.date >= start && entry.date <= cutoff);
  const completed = data.tasks.filter(
    (task) =>
      task.status === 'done' && completedDate(task) >= start && completedDate(task) <= cutoff,
  );
  const minutes = totalMinutes(entries);
  const activeDates = new Set([
    ...entries.map((entry) => entry.date),
    ...completed.map(completedDate),
  ]);
  const buckets = chartBuckets(period, start, end, entries);
  const maxBucket = Math.max(0, ...buckets.map((bucket) => bucket.minutes));
  const distributions = [
    ...data.skills.map((skill) => ({
      id: skill.id,
      name: skill.name,
      color: skill.color,
      minutes: totalMinutes(entries.filter((entry) => entry.skillId === skill.id)),
    })),
    {
      id: 'unassigned',
      name: t('planning.insights.general'),
      color: '#99a59e',
      minutes: totalMinutes(
        entries.filter((entry) => !data.skills.some((skill) => skill.id === entry.skillId)),
      ),
    },
  ]
    .filter((skill) => skill.minutes > 0)
    .sort((a, b) => b.minutes - a.minutes);

  const days = useMemo(() => {
    const first = `${heatmapYear}-01-01`;
    const last = `${heatmapYear}-12-31`;
    const padding = (parseDate(first).getDay() + 6) % 7;
    const result: (string | null)[] = Array.from({ length: padding }, () => null);
    for (let day = first; day <= last; day = addDays(day, 1)) result.push(day);
    while (result.length % 7 !== 0) result.push(null);
    return result;
  }, [heatmapYear]);
  const dayRecords = useMemo(() => {
    const records = new Map<string, { minutes: number; entries: number; tasks: number }>();
    data.entries.forEach((entry) => {
      const previous = records.get(entry.date) ?? { minutes: 0, entries: 0, tasks: 0 };
      records.set(entry.date, {
        ...previous,
        minutes: previous.minutes + entry.minutes,
        entries: previous.entries + 1,
      });
    });
    data.tasks
      .filter((task) => task.status === 'done' && task.completedAt)
      .forEach((task) => {
        const date = completedDate(task);
        const previous = records.get(date) ?? { minutes: 0, entries: 0, tasks: 0 };
        records.set(date, { ...previous, tasks: previous.tasks + 1 });
      });
    return records;
  }, [data.entries, data.tasks]);
  const yearDates = days.filter((day): day is string => !!day && day <= today);
  const yearActive = yearDates.filter((day) => dayRecords.has(day)).length;
  const yearMinutes = yearDates.reduce((sum, day) => sum + (dayRecords.get(day)?.minutes ?? 0), 0);
  const selectedEntries = data.entries.filter((entry) => entry.date === selectedDay);
  const selectedTasks = data.tasks.filter(
    (task) => task.status === 'done' && completedDate(task) === selectedDay,
  );
  const columnCount = days.length / 7;

  const week = weekKeys(today);
  const weeklyEntries = data.entries.filter(
    (entry) => week.includes(entry.date) && entry.date <= today,
  );
  const weeklyTime = totalMinutes(weeklyEntries);
  const weeklyGoal = data.profile.weeklyGoalMinutes;
  const weeklyActive = new Set(weeklyEntries.map((entry) => entry.date)).size;
  const elapsedDays = week.filter((day) => day <= today).length;
  const weeklyDone = data.tasks.filter(
    (task) =>
      task.status === 'done' && week.includes(completedDate(task)) && completedDate(task) <= today,
  ).length;
  const overdue = data.tasks.filter(
    (task) => task.status !== 'done' && task.dueDate && task.dueDate < today,
  ).length;
  const suggestions: ReviewSuggestion[] = [];
  if (weeklyGoal <= 0) {
    suggestions.push({
      title: t('planning.insights.review.goal.title'),
      description: t('planning.insights.review.goal.description'),
      page: 'settings',
      action: t('planning.insights.review.goal.action'),
    });
  } else if (weeklyTime >= weeklyGoal) {
    suggestions.push({
      title: t('planning.insights.review.reached.title'),
      description: t('planning.insights.review.reached.description', {
        time: formatMinutes(weeklyTime),
        goal: formatMinutes(weeklyGoal),
      }),
      page: 'journal',
      action: t('planning.insights.review.reached.action'),
    });
  } else {
    const remaining = weeklyGoal - weeklyTime;
    const daysLeft = week.filter((day) => day >= today).length;
    suggestions.push({
      title: t('planning.insights.review.remaining.title'),
      description: t('planning.insights.review.remaining.description', {
        remaining: formatMinutes(remaining),
        daily: formatMinutes(Math.ceil(remaining / daysLeft)),
      }),
      page: 'calendar',
      action: t('planning.insights.review.remaining.action'),
    });
  }
  if (overdue > 0) {
    suggestions.push({
      title: t('planning.insights.review.overdue.title'),
      description: t(
        overdue === 1
          ? 'planning.insights.review.overdue.one'
          : 'planning.insights.review.overdue.many',
        { count: number.format(overdue) },
      ),
      page: 'tasks',
      action: t('planning.insights.review.overdue.action'),
    });
  } else {
    suggestions.push({
      title: weeklyDone
        ? t('planning.insights.review.completed.title')
        : t('planning.insights.review.noTasks.title'),
      description: weeklyDone
        ? t(
            weeklyDone === 1
              ? 'planning.insights.review.completed.one'
              : 'planning.insights.review.completed.many',
            { count: number.format(weeklyDone) },
          )
        : t('planning.insights.review.noTasks.description'),
      page: 'tasks',
      action: t('planning.insights.review.tasks.action'),
    });
  }
  const leastPracticed = data.skills
    .map((skill) => ({
      skill,
      minutes: totalMinutes(weeklyEntries.filter((entry) => entry.skillId === skill.id)),
    }))
    .sort((a, b) => a.minutes - b.minutes)[0];
  if (leastPracticed) {
    suggestions.push({
      title: t('planning.insights.review.skills.title'),
      description:
        leastPracticed.minutes === 0
          ? t('planning.insights.review.skills.noTime', { skill: leastPracticed.skill.name })
          : t('planning.insights.review.skills.least', {
              skill: leastPracticed.skill.name,
              time: formatMinutes(leastPracticed.minutes),
            }),
      page: 'skills',
      action: t('planning.insights.review.skills.action'),
    });
  } else {
    suggestions.push({
      title: t('planning.insights.review.firstSkill.title'),
      description: t('planning.insights.review.firstSkill.description'),
      page: 'skills',
      action: t('planning.insights.review.firstSkill.action'),
    });
  }

  function changeYear(delta: number) {
    const next = heatmapYear + delta;
    setHeatmapYear(next);
    setSelectedDay(next === parseDate(today).getFullYear() ? today : `${next}-01-01`);
  }

  function moveHeatmapFocus(event: KeyboardEvent<HTMLButtonElement>, day: string) {
    let next: string;
    if (event.key === 'ArrowRight') next = addDays(day, 7);
    else if (event.key === 'ArrowLeft') next = addDays(day, -7);
    else if (event.key === 'ArrowDown') next = addDays(day, 1);
    else if (event.key === 'ArrowUp') next = addDays(day, -1);
    else if (event.key === 'Home') next = weekKeys(day)[0];
    else if (event.key === 'End') next = weekKeys(day)[6];
    else return;
    event.preventDefault();
    next =
      next < `${heatmapYear}-01-01`
        ? `${heatmapYear}-01-01`
        : next > `${heatmapYear}-12-31`
          ? `${heatmapYear}-12-31`
          : next;
    setSelectedDay(next);
    requestAnimationFrame(() => document.getElementById(`insights-day-${next}`)?.focus());
  }

  return (
    <>
      <PageHeader
        eyebrow={t('planning.insights.eyebrow')}
        title={t('planning.insights.title')}
        description={t('planning.insights.description')}
        action={
          <button className="button secondary" onClick={() => setPage('journal')}>
            <ArrowUpLeft size={16} />
            {t('planning.insights.logActivity')}
          </button>
        }
      />

      <div className="filter-bar insights-toolbar">
        <div className="segmented-control" aria-label={t('planning.insights.period.label')}>
          {(['week', 'month', 'year'] as Period[]).map((value) => (
            <button
              key={value}
              className={period === value ? 'active' : ''}
              aria-pressed={period === value}
              onClick={() => setPeriod(value)}
            >
              {t(periodLabels[value])}
            </button>
          ))}
        </div>
        <p className="insights-period-description">
          <CalendarDays size={15} />
          {formatDate(start)} —{' '}
          {formatDate(cutoff, { day: 'numeric', month: 'long', year: 'numeric' })}
        </p>
      </div>

      <div className="insights-metrics">
        <Card className="insight-metric">
          <span className="insight-metric-icon">
            <Clock3 size={20} />
          </span>
          <span className="insight-metric-label">{t('planning.insights.metric.time')}</span>
          <strong className="insight-metric-value">{formatMinutes(minutes)}</strong>
          <small>
            {t(
              entries.length === 1
                ? 'planning.insights.metric.entry.one'
                : 'planning.insights.metric.entry.many',
              { count: number.format(entries.length) },
            )}
          </small>
        </Card>
        <Card className="insight-metric">
          <span className="insight-metric-icon">
            <CheckCheck size={20} />
          </span>
          <span className="insight-metric-label">{t('planning.insights.metric.tasks')}</span>
          <strong className="insight-metric-value">{number.format(completed.length)}</strong>
          <small>{t('planning.insights.metric.completionDate')}</small>
        </Card>
        <Card className="insight-metric">
          <span className="insight-metric-icon">
            <Flame size={20} />
          </span>
          <span className="insight-metric-label">{t('planning.insights.metric.activeDays')}</span>
          <strong className="insight-metric-value">{number.format(activeDates.size)}</strong>
          <small>{t('planning.insights.metric.activeHint')}</small>
        </Card>
        <Card className="insight-metric">
          <span className="insight-metric-icon">
            <TrendingUp size={20} />
          </span>
          <span className="insight-metric-label">{t('planning.insights.metric.average')}</span>
          <strong className="insight-metric-value">
            {formatMinutes(activeDates.size ? minutes / activeDates.size : 0)}
          </strong>
          <small>{t('planning.insights.metric.period')}</small>
        </Card>
      </div>

      <div className="insights-main-grid">
        <Card
          className="insights-chart-card"
          title={t('planning.insights.chart.title')}
          action={<span className="badge">{t(periodLabels[period])}</span>}
        >
          <div className="insights-chart-summary">
            <div>
              <strong className="insights-chart-total">{formatMinutes(minutes)}</strong>
              <p>{t('planning.insights.chart.tagline')}</p>
            </div>
            <span className="insights-skill-dot" style={{ background: '#1e7854' }} />{' '}
            <span>{t('planning.insights.chart.loggedTime')}</span>
          </div>
          {entries.length ? (
            <div
              className="insights-chart"
              aria-label={t('planning.insights.chart.aria', { period: t(periodLabels[period]) })}
            >
              <div className="insights-chart-columns">
                {buckets.map((bucket) => (
                  <div
                    className="insights-chart-column"
                    key={bucket.start}
                    title={t(
                      bucket.start !== bucket.end
                        ? 'planning.insights.chart.rangeTitle'
                        : 'planning.insights.chart.dayTitle',
                      {
                        start: formatDate(bucket.start),
                        end: formatDate(bucket.end),
                        time: formatMinutes(bucket.minutes),
                      },
                    )}
                  >
                    <span className="insights-chart-value">
                      {bucket.minutes ? formatMinutes(bucket.minutes) : '—'}
                    </span>
                    <div className="insights-chart-bar-track">
                      <div
                        className={`insights-chart-bar${today >= bucket.start && today <= bucket.end ? ' is-current' : ''}`}
                        style={{ height: `${maxBucket ? (bucket.minutes / maxBucket) * 100 : 0}%` }}
                        aria-label={`${bucket.label}: ${formatMinutes(bucket.minutes)}`}
                      />
                    </div>
                    <span className="insights-chart-label">{bucket.label}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <EmptyState
              title={t('planning.insights.chart.empty.title')}
              description={t('planning.insights.chart.empty.description')}
              action={
                <button className="button secondary" onClick={() => setPage('journal')}>
                  {t('planning.insights.logActivity')}
                </button>
              }
            />
          )}
          <p className="insights-chart-footnote">
            {period === 'month'
              ? t('planning.insights.chart.monthFootnote')
              : period === 'year'
                ? t('planning.insights.chart.yearFootnote')
                : t('planning.insights.chart.weekFootnote')}{' '}
            {t('planning.insights.chart.cutoff')}
          </p>
        </Card>
        <Card title={t('planning.insights.distribution.title')} action={<Target size={18} />}>
          {distributions.length ? (
            <div className="insights-distribution">
              {distributions.map((skill) => (
                <div className="insights-distribution-row" key={skill.id}>
                  <div className="insights-distribution-heading">
                    <span>
                      <i className="insights-skill-dot" style={{ background: skill.color }} />
                      {skill.name}
                    </span>
                    <strong>{formatMinutes(skill.minutes)}</strong>
                  </div>
                  <ProgressBar
                    value={minutes ? (skill.minutes / minutes) * 100 : 0}
                    color={skill.color}
                  />
                  <span className="insights-distribution-meta">
                    {t('planning.insights.distribution.percent', {
                      percent: number.format(Math.round((skill.minutes / minutes) * 100)),
                    })}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState
              title={t('planning.insights.distribution.empty.title')}
              description={t('planning.insights.distribution.empty.description')}
            />
          )}
          <p className="insights-chart-footnote">{t('planning.insights.distribution.note')}</p>
        </Card>
      </div>

      <Card
        className="insights-year-card"
        title={t('planning.insights.year.title')}
        action={
          <div className="insights-year-controls">
            <button
              className="icon-button"
              aria-label={t('planning.insights.year.previous')}
              onClick={() => changeYear(-1)}
              disabled={heatmapYear <= 1900}
            >
              {language === 'ar' ? <ChevronRight size={17} /> : <ChevronLeft size={17} />}
            </button>
            <strong>{yearNumber.format(heatmapYear)}</strong>
            <button
              className="icon-button"
              aria-label={t('planning.insights.year.next')}
              onClick={() => changeYear(1)}
              disabled={heatmapYear >= 2100}
            >
              {language === 'ar' ? <ChevronLeft size={17} /> : <ChevronRight size={17} />}
            </button>
          </div>
        }
      >
        <div className="insights-heatmap-toolbar">
          <p className="insights-heatmap-summary">
            <strong>
              {t('planning.insights.heatmap.activeDays', { count: number.format(yearActive) })}
            </strong>
            <span>•</span>
            {t('planning.insights.heatmap.recordedYear', {
              time: formatMinutes(yearMinutes),
              year: yearNumber.format(heatmapYear),
            })}
          </p>
          <p id="insights-heatmap-help">{t('planning.insights.heatmap.help')}</p>
        </div>
        <div className="insights-heatmap-scroll">
          <div className="insights-heatmap" dir="ltr">
            <div
              className="insights-heatmap-months"
              style={{ gridTemplateColumns: `repeat(${columnCount}, minmax(10px, 1fr))` }}
            >
              {Array.from({ length: 12 }, (_, month) => {
                const first = dateKey(new Date(heatmapYear, month, 1));
                return (
                  <span
                    className="insights-heatmap-month"
                    style={{ gridColumn: Math.floor(days.indexOf(first) / 7) + 1 }}
                    key={month}
                  >
                    {formatDate(first, { month: 'short' })}
                  </span>
                );
              })}
            </div>
            <div className="insights-heatmap-body">
              <div className="insights-heatmap-weekdays" aria-hidden="true">
                <span>{t('planning.insights.weekday.monday')}</span>
                <span />
                <span>{t('planning.insights.weekday.wednesday')}</span>
                <span />
                <span>{t('planning.insights.weekday.friday')}</span>
                <span />
                <span>{t('planning.insights.weekday.sunday')}</span>
              </div>
              <div
                className="insights-heatmap-grid"
                style={{ gridTemplateColumns: `repeat(${columnCount}, minmax(10px, 1fr))` }}
                role="group"
                aria-label={t('planning.insights.heatmap.aria', {
                  year: yearNumber.format(heatmapYear),
                })}
                aria-describedby="insights-heatmap-help"
              >
                {days.map((day, index) => {
                  if (!day)
                    return (
                      <span
                        className="insights-heatmap-cell is-padding"
                        key={`padding-${index}`}
                        aria-hidden="true"
                      />
                    );
                  const record = dayRecords.get(day) ?? { minutes: 0, entries: 0, tasks: 0 };
                  const future = day > today;
                  const intensity =
                    record.minutes >= 120
                      ? 4
                      : record.minutes >= 60
                        ? 3
                        : record.minutes >= 30
                          ? 2
                          : record.entries || record.tasks
                            ? 1
                            : 0;
                  const label = t(
                    future
                      ? 'planning.insights.heatmap.futureDayAria'
                      : 'planning.insights.heatmap.dayAria',
                    {
                      date: formatDate(day, {
                        weekday: 'long',
                        day: 'numeric',
                        month: 'long',
                        year: 'numeric',
                      }),
                      activities: number.format(record.entries),
                      time: formatMinutes(record.minutes),
                      tasks: number.format(record.tasks),
                    },
                  );
                  return (
                    <button
                      id={`insights-day-${day}`}
                      type="button"
                      key={day}
                      className={`insights-heatmap-cell${future ? ' is-future' : ''}${selectedDay === day ? ' is-selected' : ''}`}
                      data-intensity={intensity}
                      aria-label={label}
                      title={label}
                      aria-pressed={selectedDay === day}
                      tabIndex={selectedDay === day ? 0 : -1}
                      onClick={() => setSelectedDay(day)}
                      onKeyDown={(event) => moveHeatmapFocus(event, day)}
                    />
                  );
                })}
              </div>
            </div>
          </div>
        </div>
        <div className="insights-heatmap-legend">
          <span>{t('planning.insights.heatmap.less')}</span>
          <div className="insights-legend-cells" aria-hidden="true">
            {[0, 1, 2, 3, 4].map((level) => (
              <span className="insights-heatmap-cell" data-intensity={level} key={level} />
            ))}
          </div>
          <span>{t('planning.insights.heatmap.more')}</span>
          <i className="insights-heatmap-cell is-future" aria-hidden="true" />
          <span>{t('planning.insights.heatmap.future')}</span>
        </div>
        <div className="insights-day-detail">
          <div className="insights-day-heading">
            <h3>
              {formatDate(selectedDay, {
                weekday: 'long',
                day: 'numeric',
                month: 'long',
                year: 'numeric',
              })}
            </h3>
            <div className="insights-day-stats">
              <span className="badge">{formatMinutes(totalMinutes(selectedEntries))}</span>
              {selectedDay > today && (
                <span className="badge">{t('planning.insights.day.future')}</span>
              )}
            </div>
          </div>
          {selectedEntries.length || selectedTasks.length ? (
            <div className="insights-day-grid">
              <div>
                <h4>
                  {t('planning.insights.day.activities')}{' '}
                  <span>({number.format(selectedEntries.length)})</span>
                </h4>
                {selectedEntries.length ? (
                  <div className="insights-day-list">
                    {selectedEntries.map((entry) => (
                      <div className="insights-day-item" key={entry.id}>
                        <span className="insights-day-icon">
                          <Clock3 size={16} />
                        </span>
                        <div className="insights-day-content">
                          <strong>{entry.title}</strong>
                          <small>
                            {t(kindLabels[entry.kind])}
                            {entry.skillId &&
                            data.skills.find((skill) => skill.id === entry.skillId)
                              ? ` · ${data.skills.find((skill) => skill.id === entry.skillId)?.name}`
                              : ''}
                          </small>
                        </div>
                        <span className="badge">{formatMinutes(entry.minutes)}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="insights-chart-footnote">{t('planning.insights.day.noEntries')}</p>
                )}
              </div>
              <div>
                <h4>
                  {t('planning.insights.day.tasks')}{' '}
                  <span>({number.format(selectedTasks.length)})</span>{' '}
                </h4>
                {selectedTasks.length ? (
                  <div className="insights-day-list">
                    {selectedTasks.map((task) => (
                      <div className="insights-day-item" key={task.id}>
                        <span className="insights-day-icon">
                          <CheckCheck size={16} />
                        </span>
                        <div className="insights-day-content">
                          <strong>{task.title}</strong>
                          <small>{t('planning.insights.day.completedToday')}</small>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="insights-chart-footnote">{t('planning.insights.day.noTasks')}</p>
                )}
              </div>
            </div>
          ) : (
            <EmptyState
              title={
                selectedDay > today
                  ? t('planning.insights.day.future.title')
                  : t('planning.insights.day.empty.title')
              }
              description={
                selectedDay > today
                  ? t('planning.insights.day.future.description')
                  : t('planning.insights.day.empty.description')
              }
              action={
                <button
                  className="button secondary"
                  onClick={() => setPage(selectedDay > today ? 'calendar' : 'journal')}
                >
                  {selectedDay > today
                    ? t('planning.insights.day.future.action')
                    : t('planning.insights.day.empty.action')}
                </button>
              }
            />
          )}
        </div>
      </Card>

      <Card
        title={t('planning.insights.review.title')}
        action={
          <span className="badge">
            {t('planning.insights.review.range', { start: formatDate(week[0]) })}
          </span>
        }
      >
        <div className="insights-review-grid">
          <div className="insights-review-summary">
            <div className="insights-review-icon">
              <Target size={25} />
            </div>
            <h3>{t('planning.insights.review.tagline')}</h3>
            <p>
              {t('planning.insights.review.daysBefore')}{' '}
              <strong>
                {t('planning.insights.review.daysCount', {
                  active: number.format(weeklyActive),
                  elapsed: number.format(elapsedDays),
                })}
              </strong>{' '}
              {t('planning.insights.review.daysAfter')}
            </p>
            <div className="insights-goal-header">
              <span>{t('planning.insights.review.weeklyGoal')}</span>
              <strong>
                {formatMinutes(weeklyTime)} / {formatMinutes(weeklyGoal)}
              </strong>
            </div>
            <ProgressBar value={weeklyGoal > 0 ? (weeklyTime / weeklyGoal) * 100 : 0} />
            <small>
              {weeklyGoal > 0
                ? t('planning.insights.review.goalPercent', {
                    percent: number.format(Math.round((weeklyTime / weeklyGoal) * 100)),
                  })
                : t('planning.insights.review.setGoal')}
            </small>
          </div>
          <div className="insights-review-list">
            {suggestions.map((suggestion, index) => (
              <div className="insights-review-item" key={suggestion.title}>
                <span className="insights-review-number">
                  {new Intl.NumberFormat(getLocale(), { minimumIntegerDigits: 2 }).format(
                    index + 1,
                  )}
                </span>
                <div className="insights-review-copy">
                  <h3>{suggestion.title}</h3>
                  <p>{suggestion.description}</p>
                  <button className="text-link" onClick={() => setPage(suggestion.page)}>
                    {suggestion.action}
                    <ArrowUpLeft size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </Card>
    </>
  );
}
