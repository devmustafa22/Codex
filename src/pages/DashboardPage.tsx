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
  shortDays,
  todayKey,
  weekKeys,
} from '../lib/dates';
import { dailyMinutes, skillProgress, streakDays, weeklyMinutes } from '../lib/metrics';
import type { Task } from '../lib/types';

export default function DashboardPage() {
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
    hour >= 5 && hour < 12 ? 'صباح الخير' : hour >= 12 && hour < 18 ? 'أهلاً بعودتك' : 'مساء الخير';
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
        eyebrow="مساحتك، على وتيرتك"
        title={`${greeting}، ${data.profile.name} ☀️`}
        description="يوم جديد، فرصة جديدة. خلّينا نخطو خطوة أقرب لأهدافك."
        action={
          <>
            <button className="button secondary" onClick={() => setEntryOpen(true)}>
              <BookOpen size={16} />
              تسجيل نشاط
            </button>
            <button className="button primary" onClick={() => setEditor('new')}>
              <Plus size={17} />
              مهمة جديدة
            </button>
          </>
        }
      />
      <div className="dashboard-stats">
        <div className="stat-card stat-featured">
          <div className="stat-top">
            <span>إنجاز اليوم</span>
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
                ? `${todayTasks.length - doneToday} مهام بانتظار خطوتك التالية`
                : 'يومك صفحة جديدة'}
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
            <span>وقت التعلّم هذا الأسبوع</span>
            <span className="stat-icon lavender">
              <Clock3 size={18} />
            </span>
          </div>
          <div className="stat-value">
            {Number((weekTime / 60).toFixed(1))}
            <span>ساعة</span>
          </div>
          <div className="stat-foot">
            <span className="tiny-dot lavender-dot" />
            <span>من أصل {Number((goal / 60).toFixed(1))} ساعات مستهدفة</span>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-top">
            <span>مهارات تنمو معك</span>
            <span className="stat-icon mint">
              <Sprout size={18} />
            </span>
          </div>
          <div className="stat-value">
            {data.skills.length}
            <span>مهارات</span>
          </div>
          <div className="stat-foot">
            <span className="tiny-dot" />
            <span>
              {data.skills.filter((s) => skillProgress(data, s) >= 100).length} أهداف مكتملة،
              والبقية في طريقها
            </span>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-top">
            <span>سلسلة الاستمرارية</span>
            <span className="stat-icon peach">
              <Flame size={18} />
            </span>
          </div>
          <div className="stat-value">
            {streakDays(data)}
            <span>أيام</span>
          </div>
          <div className="stat-foot">
            <span className="tiny-dot peach-dot" />
            <span>القليل كل يوم يصنع الكثير</span>
          </div>
        </div>
      </div>
      <div className="dashboard-main-grid">
        <Card className="activity-card">
          <div className="card-heading">
            <div>
              <h2>إيقاع نشاطك</h2>
              <p className="card-subtitle">وقتك المستثمر في التعلّم والإنجاز</p>
            </div>
            <select
              className="compact-select"
              aria-label="فترة رسم النشاط"
              value={chartPeriod}
              onChange={(e) => setChartPeriod(e.target.value)}
            >
              <option value="last7">آخر 7 أيام</option>
              <option value="week">الأسبوع الحالي</option>
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
                    aria-label={`${formatDate(date)}، ${minutes} دقيقة نشاط`}
                    aria-pressed={selectedDay === date}
                  >
                    <span className="activity-bar-value">{minutes ? `${minutes} د` : '—'}</span>
                    <span
                      className={`activity-bar ${minutes === 0 ? 'bar-empty' : ''}`}
                      style={{
                        height: `${Math.max(minutes ? 18 : 12, (minutes / maxMinutes) * 136)}px`,
                      }}
                    />
                    <span className="activity-day">{shortDays[parseDate(date).getDay()]}</span>
                    {date === today && <i className="today-dot" />}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="activity-chart-footer">
            <span>
              <i />
              {formatDate(selectedDay)} · {formatMinutes(dailyMinutes(data, selectedDay))} من النشاط
            </span>
            <button onClick={() => setPage('insights')}>
              استكشف تحليلاتك
              <ArrowUpLeft size={13} />
            </button>
          </div>
        </Card>
        <Card className="weekly-goal-card">
          <div className="card-heading">
            <h2>هدفك الأسبوعي</h2>
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
              <span>من هدف الأسبوع</span>
            </div>
          </div>
          <p className="goal-caption">
            {goalPercent === 100
              ? 'أنت وصلت للهدف. احتفل بخطوتك! ✦'
              : 'كل دقيقة تستثمرها اليوم، تقرّبك أكثر.'}
          </p>
          <button className="goal-link" onClick={() => setPage('settings')}>
            {formatMinutes(weekTime)} من {formatMinutes(goal)}
            <ArrowUpLeft size={13} />
          </button>
        </Card>
        <FocusTimer />
        <Card
          className="today-tasks-card"
          title="خطتك لليوم"
          action={<TextLink onClick={() => setPage('tasks')}>كل المهام</TextLink>}
        >
          <div className="today-task-intro">
            <span>{formatDate(today, { weekday: 'long', day: 'numeric', month: 'long' })}</span>
            <span className="badge">
              {doneToday} / {todayTasks.length} مكتملة
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
                    aria-label={`${task.status === 'done' ? 'إعادة فتح' : 'إكمال'} ${task.title}`}
                    onClick={() => {
                      updateTask(task.id, { status: task.status === 'done' ? 'todo' : 'done' });
                      notify(
                        task.status === 'done' ? 'أعدنا المهمة إلى خطتك' : 'إنجاز جديد! أحسنت',
                      );
                    }}
                  >
                    {task.status === 'done' && <Check size={12} />}
                  </button>
                  <button className="today-task-title" onClick={() => setEditor(task)}>
                    <strong>{task.title}</strong>
                    <span>
                      {skill?.name ?? 'تطوير شخصي'}
                      <i />
                      {formatMinutes(task.estimatedMinutes)}
                    </span>
                  </button>
                  <span className={`priority-label priority-${task.priority}`}>
                    {task.priority === 'high'
                      ? 'عالية'
                      : task.priority === 'medium'
                        ? 'متوسطة'
                        : 'منخفضة'}
                  </span>
                </div>
              );
            })}
            {todayList.length === 0 && (
              <div className="mini-empty">ما عندك مهام لليوم. اترك مساحة لخطوة جديدة.</div>
            )}
          </div>
          <button className="add-inline" onClick={() => setEditor('new')}>
            <Plus size={15} />
            أضف مهمة إلى يومك
          </button>
        </Card>
        <Card
          className="growing-skills-card"
          title="مهاراتك في تطوّر"
          action={
            <button
              className="icon-button"
              aria-label="عرض كل المهارات"
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
            {skills.length === 0 && <div className="mini-empty">أضف مهارة وابدأ مسار تعلّمك.</div>}
          </div>
          <TextLink onClick={() => setPage('skills')}>لكل مهارة، رحلة تستحق</TextLink>
        </Card>
      </div>
      <div className="dashboard-bottom-grid">
        <Card
          className="recent-activity-card"
          title="آخر خطواتك"
          action={<TextLink onClick={() => setPage('journal')}>سجلّ الرحلة</TextLink>}
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
            {recent.length === 0 && <div className="mini-empty">وثّق نشاطك الأول اليوم.</div>}
          </div>
        </Card>
        <div className="next-event-card">
          <div className="next-event-icon">
            <CalendarDays size={22} />
          </div>
          <span className="eyebrow">في مدار أيامك</span>
          <h2>{nextEvent?.title ?? 'مساحة لشيء جميل'}</h2>
          <p>
            {nextEvent
              ? `${formatDate(nextEvent.date)} · ${nextEvent.startTime}`
              : 'خطّط لوقتك القادم من التقويم.'}
          </p>
          <button onClick={() => setPage('calendar')}>
            شوف تقويمك
            <ArrowLeft size={16} />
          </button>
          <div className="event-orbit" aria-hidden="true" />
        </div>
      </div>
      <div className="dashboard-footer">
        <span>
          <span className="tiny-dot" />
          تقدّم حقيقي، خطوة بخطوة.
        </span>
        <button onClick={() => setPage('tasks')}>
          {active.length} مهام في مدارك
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
