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

const number = new Intl.NumberFormat('ar-IQ-u-nu-latn');
const periodLabels: Record<Period, string> = {
  week: 'هذا الأسبوع',
  month: 'هذا الشهر',
  year: 'هذه السنة',
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
        label: `${parseDate(first).getDate()}–${parseDate(last).getDate()}`,
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
      name: 'أنشطة عامة',
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
      title: 'ابدأ بهدف يناسب وقتك',
      description:
        'حدّد عدد دقائق التعلّم والتركيز التي تريد تسجيلها كل أسبوع، ثم تابع تقدّمك هنا.',
      page: 'settings',
      action: 'ضبط الهدف',
    });
  } else if (weeklyTime >= weeklyGoal) {
    suggestions.push({
      title: 'وصلت إلى هدفك الأسبوعي',
      description: `سجّلت ${formatMinutes(weeklyTime)} من هدف ${formatMinutes(weeklyGoal)}. دوّن أهم شيء تعلّمته حتى تحتفظ بأثر هذا الأسبوع.`,
      page: 'journal',
      action: 'كتابة نشاط',
    });
  } else {
    const remaining = weeklyGoal - weeklyTime;
    const daysLeft = week.filter((day) => day >= today).length;
    suggestions.push({
      title: 'خطوة صغيرة تقرّبك من هدفك',
      description: `باقي ${formatMinutes(remaining)} لهدف الأسبوع؛ حوالي ${formatMinutes(Math.ceil(remaining / daysLeft))} يومياً خلال الأيام المتبقية، بما فيها اليوم.`,
      page: 'calendar',
      action: 'حجز جلسة',
    });
  }
  if (overdue > 0) {
    suggestions.push({
      title: 'خفّف المهام المتراكمة',
      description: `عندك ${number.format(overdue)} ${overdue === 1 ? 'مهمة تجاوزت موعدها' : 'مهام تجاوزت موعدها'}. راجع المواعيد واختَر مهمة واحدة قابلة للإنجاز اليوم.`,
      page: 'tasks',
      action: 'مراجعة المهام',
    });
  } else {
    suggestions.push({
      title: weeklyDone ? 'ثبّت تقدّمك بالمراجعة' : 'اجعل خطوتك القادمة واضحة',
      description: weeklyDone
        ? `أنجزت ${number.format(weeklyDone)} ${weeklyDone === 1 ? 'مهمة' : 'مهام'} هذا الأسبوع. راجع أولوياتك وحدّد المهمة التالية.`
        : 'لم تُسجّل مهمة مكتملة هذا الأسبوع. اختَر مهمة صغيرة وحدّد لها موعداً مناسباً.',
      page: 'tasks',
      action: 'فتح المهام',
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
      title: 'أعطِ مهاراتك مساحة منتظمة',
      description:
        leastPracticed.minutes === 0
          ? `لم تسجّل وقتاً لمهارة «${leastPracticed.skill.name}» هذا الأسبوع. إذا كانت ضمن أولوياتك، خصّص لها جلسة قصيرة.`
          : `«${leastPracticed.skill.name}» هي الأقل ممارسة هذا الأسبوع بواقع ${formatMinutes(leastPracticed.minutes)}. راجع توازن وقتك بحسب أولوياتك.`,
      page: 'skills',
      action: 'مراجعة المهارات',
    });
  } else {
    suggestions.push({
      title: 'حوّل اهتمامك إلى مهارة واضحة',
      description: 'أضف مهارتك الأولى واربط أنشطتك بها حتى تستطيع معرفة أين يذهب وقتك وكيف تتقدّم.',
      page: 'skills',
      action: 'إضافة مهارة',
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
        eyebrow="كل خطوة إلها أثر"
        title="إحصائياتك، قصة تقدّمك"
        description="اعرف وين يروح وقتك، وراجع إنجازاتك حتى تخطّط للأيام الجاية بوضوح."
        action={
          <button className="button secondary" onClick={() => setPage('journal')}>
            <ArrowUpLeft size={16} />
            سجّل نشاطاً
          </button>
        }
      />

      <div className="filter-bar insights-toolbar">
        <div className="segmented-control" aria-label="الفترة الإحصائية">
          {(['week', 'month', 'year'] as Period[]).map((value) => (
            <button
              key={value}
              className={period === value ? 'active' : ''}
              aria-pressed={period === value}
              onClick={() => setPeriod(value)}
            >
              {periodLabels[value]}
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
          <span className="insight-metric-label">وقت النشاط المسجّل</span>
          <strong className="insight-metric-value">{formatMinutes(minutes)}</strong>
          <small>
            {number.format(entries.length)} {entries.length === 1 ? 'نشاط مسجّل' : 'أنشطة مسجّلة'}
          </small>
        </Card>
        <Card className="insight-metric">
          <span className="insight-metric-icon">
            <CheckCheck size={20} />
          </span>
          <span className="insight-metric-label">مهام أُنجزت</span>
          <strong className="insight-metric-value">{number.format(completed.length)}</strong>
          <small>بحسب تاريخ الإكمال</small>
        </Card>
        <Card className="insight-metric">
          <span className="insight-metric-icon">
            <Flame size={20} />
          </span>
          <span className="insight-metric-label">أيام نشطة</span>
          <strong className="insight-metric-value">{number.format(activeDates.size)}</strong>
          <small>نشاط مسجّل أو مهمة مكتملة</small>
        </Card>
        <Card className="insight-metric">
          <span className="insight-metric-icon">
            <TrendingUp size={20} />
          </span>
          <span className="insight-metric-label">متوسط الوقت باليوم النشط</span>
          <strong className="insight-metric-value">
            {formatMinutes(activeDates.size ? minutes / activeDates.size : 0)}
          </strong>
          <small>خلال الفترة المحدّدة</small>
        </Card>
      </div>

      <div className="insights-main-grid">
        <Card
          className="insights-chart-card"
          title="إيقاع نشاطك"
          action={<span className="badge">{periodLabels[period]}</span>}
        >
          <div className="insights-chart-summary">
            <div>
              <strong className="insights-chart-total">{formatMinutes(minutes)}</strong>
              <p>كل جلسة تضيف شيئاً إلى رحلتك</p>
            </div>
            <span className="insights-skill-dot" style={{ background: '#1e7854' }} />{' '}
            <span>وقت مسجّل</span>
          </div>
          {entries.length ? (
            <div
              className="insights-chart"
              aria-label={`توزيع وقت النشاط خلال ${periodLabels[period]}`}
            >
              <div className="insights-chart-columns">
                {buckets.map((bucket) => (
                  <div
                    className="insights-chart-column"
                    key={bucket.start}
                    title={`${formatDate(bucket.start)}${bucket.start !== bucket.end ? ` إلى ${formatDate(bucket.end)}` : ''}: ${formatMinutes(bucket.minutes)}`}
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
              title="ابدأ أول نقطة في الرسم"
              description="سجّل مدة نشاطك وستظهر هنا صورة واضحة لوقت التعلّم والعمل."
              action={
                <button className="button secondary" onClick={() => setPage('journal')}>
                  سجّل نشاطاً
                </button>
              }
            />
          )}
          <p className="insights-chart-footnote">
            {period === 'month'
              ? 'كل عمود يمثّل أسبوعاً، ويُحتسب الجزء الواقع داخل هذا الشهر.'
              : period === 'year'
                ? 'كل عمود يمثّل شهراً من السنة الحالية.'
                : 'كل عمود يمثّل يوماً من الأسبوع الحالي.'}{' '}
            يُحتسب النشاط المسجّل حتى اليوم.
          </p>
        </Card>
        <Card title="وين استثمرت وقتك؟" action={<Target size={18} />}>
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
                    {Math.round((skill.minutes / minutes) * 100)}% من وقتك المسجّل
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState
              title="وقتك يرسم أولوياتك"
              description="اربط الأنشطة بمهاراتك، أو سجّلها كأنشطة عامة، ليظهر توزيع وقتك."
            />
          )}
          <p className="insights-chart-footnote">
            يعتمد على مدد الأنشطة المحفوظة خلال الفترة المحدّدة.
          </p>
        </Card>
      </div>

      <Card
        className="insights-year-card"
        title="سنة من الخطوات الصغيرة"
        action={
          <div className="insights-year-controls">
            <button
              className="icon-button"
              aria-label="السنة السابقة"
              onClick={() => changeYear(-1)}
              disabled={heatmapYear <= 1900}
            >
              <ChevronRight size={17} />
            </button>
            <strong>{heatmapYear}</strong>
            <button
              className="icon-button"
              aria-label="السنة التالية"
              onClick={() => changeYear(1)}
              disabled={heatmapYear >= 2100}
            >
              <ChevronLeft size={17} />
            </button>
          </div>
        }
      >
        <div className="insights-heatmap-toolbar">
          <p className="insights-heatmap-summary">
            <strong>{number.format(yearActive)} يوم نشاط</strong>
            <span>•</span>
            {formatMinutes(yearMinutes)} مسجّلة خلال {heatmapYear}
          </p>
          <p id="insights-heatmap-help">اختَر يوماً لعرض تفاصيله؛ استخدم الأسهم للتنقّل.</p>
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
                <span>إثنين</span>
                <span />
                <span>أربعاء</span>
                <span />
                <span>جمعة</span>
                <span />
                <span>أحد</span>
              </div>
              <div
                className="insights-heatmap-grid"
                style={{ gridTemplateColumns: `repeat(${columnCount}, minmax(10px, 1fr))` }}
                role="group"
                aria-label={`تقويم النشاط السنوي ${heatmapYear}`}
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
                  const label = `${formatDate(day, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}، ${number.format(record.entries)} نشاط، ${formatMinutes(record.minutes)}، ${number.format(record.tasks)} مهمة مكتملة${future ? '، يوم قادم' : ''}`;
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
          <span>نشاط أقل</span>
          <div className="insights-legend-cells" aria-hidden="true">
            {[0, 1, 2, 3, 4].map((level) => (
              <span className="insights-heatmap-cell" data-intensity={level} key={level} />
            ))}
          </div>
          <span>نشاط أكثر</span>
          <i className="insights-heatmap-cell is-future" aria-hidden="true" />
          <span>أيام قادمة</span>
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
              {selectedDay > today && <span className="badge">يوم قادم</span>}
            </div>
          </div>
          {selectedEntries.length || selectedTasks.length ? (
            <div className="insights-day-grid">
              <div>
                <h4>
                  الأنشطة المسجّلة <span>({selectedEntries.length})</span>
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
                            {kindLabels[entry.kind]}
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
                  <p className="insights-chart-footnote">لا توجد أنشطة مسجّلة في هذا اليوم.</p>
                )}
              </div>
              <div>
                <h4>
                  المهام المكتملة <span>({selectedTasks.length})</span>{' '}
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
                          <small>أُنجزت في هذا اليوم</small>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="insights-chart-footnote">لا توجد مهام مكتملة في هذا اليوم.</p>
                )}
              </div>
            </div>
          ) : (
            <EmptyState
              title={selectedDay > today ? 'هذا اليوم ينتظر خطّتك' : 'يوم بدون نشاط مسجّل'}
              description={
                selectedDay > today
                  ? 'أضف موعداً إلى تقويمك وامنح مهاراتك مساحة في الأيام القادمة.'
                  : 'سجّل ما عملته في يومياتك لتحتفظ بأثر كل خطوة.'
              }
              action={
                <button
                  className="button secondary"
                  onClick={() => setPage(selectedDay > today ? 'calendar' : 'journal')}
                >
                  {selectedDay > today ? 'فتح التقويم' : 'فتح اليوميات'}
                </button>
              }
            />
          )}
        </div>
      </Card>

      <Card
        title="مراجعتك الأسبوعية"
        action={<span className="badge">من {formatDate(week[0])} إلى اليوم</span>}
      >
        <div className="insights-review-grid">
          <div className="insights-review-summary">
            <div className="insights-review-icon">
              <Target size={25} />
            </div>
            <h3>خطوة ثابتة، أثر أكبر</h3>
            <p>
              سجّلت نشاطاً في{' '}
              <strong>
                {weeklyActive} من {elapsedDays}
              </strong>{' '}
              أيام مرّت هذا الأسبوع.
            </p>
            <div className="insights-goal-header">
              <span>هدف الأسبوع</span>
              <strong>
                {formatMinutes(weeklyTime)} / {formatMinutes(weeklyGoal)}
              </strong>
            </div>
            <ProgressBar value={weeklyGoal > 0 ? (weeklyTime / weeklyGoal) * 100 : 0} />
            <small>
              {weeklyGoal > 0
                ? `${Math.round((weeklyTime / weeklyGoal) * 100)}% من هدفك الأسبوعي`
                : 'حدّد هدفك من الإعدادات'}
            </small>
          </div>
          <div className="insights-review-list">
            {suggestions.map((suggestion, index) => (
              <div className="insights-review-item" key={suggestion.title}>
                <span className="insights-review-number">0{index + 1}</span>
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
