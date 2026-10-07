import { useLanguage } from '../state/LanguageContext';
import { useState } from 'react';
import {
  ArrowUpLeft,
  Check,
  CheckCheck,
  Clock3,
  Flame,
  Sprout,
  CalendarDays,
  ChevronLeft,
  Plus,
  BookOpen,
  ArrowLeft,
  Sparkles,
} from 'lucide-react';
import { useApp } from '../state/AppContext';
import { PageHeader, Card, TextLink, ProgressBar } from '../components/ui';
import { TaskEditor } from '../components/TaskEditor';
import { EntryEditor } from '../components/EntryEditor';
import { FocusTimer } from '../components/FocusTimer';
import {
  addDays,
  formatDate,
  formatMinutes,
  parseDate,
  getShortDays,
  todayKey,
  weekKeys,
} from '../lib/dates';
import { dailyMinutes, skillProgress, streakDays, weeklyMinutes } from '../lib/metrics';
import type { Task } from '../lib/types';

export default function DashboardPage() {
  const { t } = useLanguage();
  const { data, setPage, updateTask, notify } = useApp();
  const [editor, setEditor] = useState<Task | 'new' | null>(null);
  const [entryOpen, setEntryOpen] = useState(false);
  const [chartPeriod, setChartPeriod] = useState('last7');
  const [selectedDay, setSelectedDay] = useState(todayKey());
  const today = todayKey();
  const hour = Number(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Baghdad',
      hour: 'numeric',
      hour12: false,
    }).format(new Date()),
  );
  const greeting =
    hour >= 5 && hour < 12
      ? t('shell.dashboard.morning')
      : hour >= 12 && hour < 18
        ? t('shell.dashboard.welcome')
        : t('shell.dashboard.evening');
  const todayTasks = data.tasks.filter((t) => t.dueDate === today);
  const doneToday = todayTasks.filter((t) => t.status === 'done').length;
  const active = data.tasks.filter((t) => t.status !== 'done');
  const weekTime = weeklyMinutes(data);
  const goal = data.profile.weeklyGoalMinutes;
  const goalPercent = Math.min(100, Math.floor((weekTime / goal) * 100));
  const chartDays =
    chartPeriod === 'week'
      ? weekKeys()
      : Array.from({ length: 7 }, (_, i) => addDays(today, i - 6));
  const maxMinutes = Math.max(120, ...chartDays.map((d) => dailyMinutes(data, d)));
  const todayList = [...todayTasks].sort(
    (a, b) => Number(a.status === 'done') - Number(b.status === 'done'),
  );
  const skills = data.skills.slice(0, 3);
  const recent = [...data.entries].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 3);
  const nowTime = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Baghdad',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date());
  const nextEvent = [...data.events]
    .filter((e) => e.date > today || (e.date === today && e.startTime >= nowTime))
    .sort((a, b) => (a.date + a.startTime).localeCompare(b.date + b.startTime))[0];
  return (
    <>
      <PageHeader
        eyebrow={t('shell.dashboard.eyebrow')}
        title={t('shell.dashboard.greeting', { greeting, name: data.profile.name })}
        description={t('shell.dashboard.description')}
        action={
          <>
            <button className="button secondary" onClick={() => setEntryOpen(true)}>
              <BookOpen size={16} />
              {t('shell.dashboard.log')}
            </button>
            <button className="button primary" onClick={() => setEditor('new')}>
              <Plus size={17} />
              {t('shell.task.new')}
            </button>
          </>
        }
      />
      <div className="dashboard-stats">
        <div className="stat-card stat-featured">
          <div className="stat-top">
            <span>{t('shell.dashboard.todayProgress')}</span>
            <span className="stat-icon">
              <CheckCheck size={18} />
            </span>
          </div>
          <div className="stat-value">
            {doneToday}
            <span>/ {todayTasks.length}</span>
          </div>
          <div className="stat-foot">
            <span>
              {todayTasks.length
                ? t('shell.dashboard.tasksWaiting', { count: todayTasks.length - doneToday })
                : t('shell.dashboard.freshDay')}
            </span>
            <ArrowUpLeft size={15} />
          </div>
          <div className="stat-mini-progress">
            <span
              style={{ width: `${todayTasks.length ? (doneToday / todayTasks.length) * 100 : 0}%` }}
            />
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-top">
            <span>{t('shell.dashboard.learningTime')}</span>
            <span className="stat-icon lavender">
              <Clock3 size={18} />
            </span>
          </div>
          <div className="stat-value">
            {Number((weekTime / 60).toFixed(1))}
            <span>{t('shell.dashboard.hour')}</span>
          </div>
          <div className="stat-foot">
            <span className="tiny-dot lavender-dot" />
            <span>
              {t('shell.dashboard.targetHours', { hours: Number((goal / 60).toFixed(1)) })}
            </span>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-top">
            <span>{t('shell.dashboard.growingSkills')}</span>
            <span className="stat-icon mint">
              <Sprout size={18} />
            </span>
          </div>
          <div className="stat-value">
            {data.skills.length}
            <span>{t('shell.dashboard.skills')}</span>
          </div>
          <div className="stat-foot">
            <span className="tiny-dot" />
            <span>
              {t('shell.dashboard.completedGoals', {
                count: data.skills.filter((skill) => skillProgress(data, skill) >= 100).length,
              })}
            </span>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-top">
            <span>{t('shell.dashboard.streak')}</span>
            <span className="stat-icon peach">
              <Flame size={18} />
            </span>
          </div>
          <div className="stat-value">
            {streakDays(data)}
            <span>{t('shell.dashboard.days')}</span>
          </div>
          <div className="stat-foot">
            <span className="tiny-dot peach-dot" />
            <span>{t('shell.dashboard.streakHint')}</span>
          </div>
        </div>
      </div>
      <div className="dashboard-main-grid">
        <Card className="activity-card">
          <div className="card-heading">
            <div>
              <h2>{t('shell.dashboard.activity')}</h2>
              <p className="card-subtitle">{t('shell.dashboard.activityHint')}</p>
            </div>
            <select
              className="compact-select"
              aria-label={t('shell.dashboard.activityPeriod')}
              value={chartPeriod}
              onChange={(e) => setChartPeriod(e.target.value)}
            >
              <option value="last7">{t('shell.dashboard.last7')}</option>
              <option value="week">{t('shell.dashboard.thisWeek')}</option>
            </select>
          </div>
          <div className="activity-chart">
            <div className="chart-scale" aria-hidden="true">
              <span>{formatMinutes(maxMinutes)}</span>
              <span>{formatMinutes(maxMinutes / 2)}</span>
              <span>0</span>
            </div>
            <div className="activity-bars">
              {chartDays.map((date) => {
                const minutes = dailyMinutes(data, date);
                return (
                  <button
                    className={`activity-column ${selectedDay === date ? 'selected' : ''}`}
                    key={date}
                    onClick={() => setSelectedDay(date)}
                    aria-label={t('shell.dashboard.dayActivity', {
                      date: formatDate(date),
                      minutes,
                    })}
                    aria-pressed={selectedDay === date}
                  >
                    <span className="activity-bar-value">
                      {minutes ? t('shell.dashboard.minuteShort', { count: minutes }) : '—'}
                    </span>
                    <span
                      className={`activity-bar ${minutes === 0 ? 'bar-empty' : ''}`}
                      style={{
                        height: `${Math.max(minutes ? 18 : 12, (minutes / maxMinutes) * 136)}px`,
                      }}
                    />
                    <span className="activity-day">{getShortDays()[parseDate(date).getDay()]}</span>
                    {date === today && <i className="today-dot" />}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="activity-chart-footer">
            <span>
              <i />
              {t('shell.dashboard.daySummary', {
                date: formatDate(selectedDay),
                duration: formatMinutes(dailyMinutes(data, selectedDay)),
              })}
            </span>
            <button onClick={() => setPage('insights')}>
              {t('shell.dashboard.explore')}
              <ArrowUpLeft size={13} />
            </button>
          </div>
        </Card>
        <Card className="weekly-goal-card">
          <div className="card-heading">
            <h2>{t('shell.dashboard.weeklyGoal')}</h2>
            <Sparkles size={17} />
          </div>
          <div className="goal-ring">
            <svg viewBox="0 0 160 160" aria-hidden="true">
              <circle cx="80" cy="80" r="64" className="ring-track" />
              <circle
                cx="80"
                cy="80"
                r="64"
                className="ring-progress"
                strokeDasharray={`${goalPercent * 4.021} 402.1`}
                transform="rotate(-90 80 80)"
              />
            </svg>
            <div>
              <strong>
                {goalPercent}
                <small>%</small>
              </strong>
              <span>{t('shell.dashboard.weeklyGoalLabel')}</span>
            </div>
          </div>
          <p className="goal-caption">
            {goalPercent === 100
              ? t('shell.dashboard.goalComplete')
              : t('shell.dashboard.goalHint')}
          </p>
          <button className="goal-link" onClick={() => setPage('settings')}>
            {t('shell.dashboard.goalSummary', {
              current: formatMinutes(weekTime),
              goal: formatMinutes(goal),
            })}
            <ArrowUpLeft size={13} />
          </button>
        </Card>
        <FocusTimer />
        <Card
          className="today-tasks-card"
          title={t('shell.dashboard.todayPlan')}
          action={
            <TextLink onClick={() => setPage('tasks')}>{t('shell.dashboard.allTasks')}</TextLink>
          }
        >
          <div className="today-task-intro">
            <span>{formatDate(today, { weekday: 'long', day: 'numeric', month: 'long' })}</span>
            <span className="badge">
              {t('shell.dashboard.tasksCompleted', { done: doneToday, total: todayTasks.length })}
            </span>
          </div>
          <div className="today-task-list">
            {todayList.slice(0, 4).map((task) => {
              const skill = data.skills.find((s) => s.id === task.skillId);
              return (
                <div
                  className={`today-task ${task.status === 'done' ? 'is-done' : ''}`}
                  key={task.id}
                >
                  <button
                    className={`task-checkbox ${task.status === 'done' ? 'checked' : ''}`}
                    aria-label={t(
                      task.status === 'done'
                        ? 'shell.dashboard.reopenTask'
                        : 'shell.dashboard.completeTask',
                      { title: task.title },
                    )}
                    onClick={() => {
                      updateTask(task.id, { status: task.status === 'done' ? 'todo' : 'done' });
                      notify(
                        task.status === 'done'
                          ? t('shell.dashboard.taskReopened')
                          : t('shell.dashboard.taskComplete'),
                      );
                    }}
                  >
                    {task.status === 'done' && <Check size={12} />}
                  </button>
                  <button className="today-task-title" onClick={() => setEditor(task)}>
                    <strong>{task.title}</strong>
                    <span>
                      {skill?.name ?? t('shell.dashboard.personalGrowth')}
                      <i />
                      {formatMinutes(task.estimatedMinutes)}
                    </span>
                  </button>
                  <span className={`priority-label priority-${task.priority}`}>
                    {task.priority === 'high'
                      ? t('shell.priority.high')
                      : task.priority === 'medium'
                        ? t('shell.priority.medium')
                        : t('shell.priority.low')}
                  </span>
                </div>
              );
            })}
            {todayList.length === 0 && (
              <div className="mini-empty">{t('shell.dashboard.noTasks')}</div>
            )}
          </div>
          <button className="add-inline" onClick={() => setEditor('new')}>
            <Plus size={15} />
            {t('shell.dashboard.addToday')}
          </button>
        </Card>
        <Card
          className="growing-skills-card"
          title={t('shell.dashboard.skillsGrowing')}
          action={
            <button
              className="icon-button"
              aria-label={t('shell.dashboard.allSkills')}
              onClick={() => setPage('skills')}
            >
              <ArrowUpLeft size={17} />
            </button>
          }
        >
          <div className="dashboard-skills">
            {skills.map((skill, index) => (
              <button className="dashboard-skill" key={skill.id} onClick={() => setPage('skills')}>
                <div className="dashboard-skill-heading">
                  <span
                    className="dashboard-skill-icon"
                    style={{ background: `${skill.color}16`, color: skill.color }}
                  >
                    {index === 0 ? '✦' : index === 1 ? '</>' : 'Aa'}
                  </span>
                  <div>
                    <strong>{skill.name}</strong>
                    <span>{skill.category}</span>
                  </div>
                  <span className="skill-percentage">
                    {skillProgress(data, skill)}
                    <small>%</small>
                  </span>
                </div>
                <ProgressBar value={skillProgress(data, skill)} color={skill.color} />
              </button>
            ))}
            {skills.length === 0 && (
              <div className="mini-empty">{t('shell.dashboard.noSkills')}</div>
            )}
          </div>
          <TextLink onClick={() => setPage('skills')}>
            {t('shell.dashboard.skillsJourney')}
          </TextLink>
        </Card>
      </div>
      <div className="dashboard-bottom-grid">
        <Card
          className="recent-activity-card"
          title={t('shell.dashboard.recent')}
          action={<TextLink onClick={() => setPage('journal')}>{t('shell.nav.journal')}</TextLink>}
        >
          <div className="recent-activities">
            {recent.map((entry) => (
              <div className="recent-activity" key={entry.id}>
                <span className="recent-icon">
                  <BookOpen size={15} />
                </span>
                <div>
                  <strong>{entry.title}</strong>
                  <span>
                    {formatDate(entry.date)} · {formatMinutes(entry.minutes)}
                  </span>
                </div>
                <span className="recent-check">
                  <Check size={13} />
                </span>
              </div>
            ))}
            {recent.length === 0 && (
              <div className="mini-empty">{t('shell.dashboard.noActivities')}</div>
            )}
          </div>
        </Card>
        <div className="next-event-card">
          <div className="next-event-icon">
            <CalendarDays size={22} />
          </div>
          <span className="eyebrow">{t('shell.dashboard.daysEyebrow')}</span>
          <h2>{nextEvent?.title ?? t('shell.dashboard.noEvent')}</h2>
          <p>
            {nextEvent
              ? `${formatDate(nextEvent.date)} · ${nextEvent.startTime}`
              : t('shell.dashboard.planCalendar')}
          </p>
          <button onClick={() => setPage('calendar')}>
            {t('shell.dashboard.openCalendar')}
            <ArrowLeft size={16} />
          </button>
          <div className="event-orbit" aria-hidden="true" />
        </div>
      </div>
      <div className="dashboard-footer">
        <span>
          <span className="tiny-dot" />
          {t('shell.dashboard.footer')}
        </span>
        <button onClick={() => setPage('tasks')}>
          {t('shell.dashboard.activeTasks', { count: active.length })}
          <ChevronLeft size={14} />
        </button>
      </div>
      {editor && (
        <TaskEditor task={editor === 'new' ? undefined : editor} onClose={() => setEditor(null)} />
      )}{' '}
      {entryOpen && <EntryEditor onClose={() => setEntryOpen(false)} />}
    </>
  );
}
