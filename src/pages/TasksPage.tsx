import { useEffect, useMemo, useState } from 'react';
import {
  Check,
  CheckCheck,
  Circle,
  Clock3,
  Columns3,
  List,
  Pencil,
  Plus,
  Search,
  Trash2,
  CalendarDays,
  ArrowUpRight,
  SlidersHorizontal,
} from 'lucide-react';
import type { Skill, Task, TaskStatus } from '../lib/types';
import { addDays, formatDate, formatMinutes, todayKey } from '../lib/dates';
import { useApp } from '../state/AppContext';
import { AddButton, ConfirmDialog, EmptyState, PageHeader } from '../components/ui';
import { TaskEditor } from '../components/TaskEditor';

const statuses: { id: TaskStatus; label: string; className: string }[] = [
  { id: 'todo', label: 'للإنجاز', className: 'todo' },
  { id: 'in-progress', label: 'قيد التنفيذ', className: 'in-progress' },
  { id: 'done', label: 'مكتملة', className: 'done' },
];
const priorityLabels = { high: 'أولوية عالية', medium: 'أولوية متوسطة', low: 'أولوية منخفضة' };
const priorityOrder = { high: 0, medium: 1, low: 2 };

function dueLabel(task: Task, today: string) {
  if (!task.dueDate) return 'بدون موعد';
  if (task.dueDate === today) return 'اليوم';
  if (task.dueDate === addDays(today, 1)) return 'غدًا';
  return formatDate(task.dueDate);
}

interface TaskItemProps {
  task: Task;
  skill?: Skill;
  view: 'board' | 'list';
  onEdit: () => void;
  onDelete: () => void;
}

function TaskItem({ task, skill, view, onEdit, onDelete }: TaskItemProps) {
  const { updateTask, notify } = useApp();
  const today = todayKey();
  const overdue = !!task.dueDate && task.dueDate < today && task.status !== 'done';
  const toggleDone = () => {
    const next = task.status === 'done' ? 'todo' : 'done';
    updateTask(task.id, { status: next });
    notify(next === 'done' ? 'أحسنت! مهمة أقل وخطوة أقرب لهدفك' : 'تمت إعادة المهمة للإنجاز');
  };
  const checkbox = (
    <label className={`task-check ${task.status === 'done' ? 'checked' : ''}`}>
      <input
        type="checkbox"
        checked={task.status === 'done'}
        onChange={toggleDone}
        aria-label={task.status === 'done' ? `إعادة فتح ${task.title}` : `إكمال ${task.title}`}
      />
      <span>
        <Check size={13} />
      </span>
    </label>
  );
  const actions = (
    <div className="task-card-actions">
      <button
        className="icon-button"
        onClick={onEdit}
        aria-label={`تعديل ${task.title}`}
        title="تعديل المهمة"
      >
        <Pencil size={15} />
      </button>
      <button
        className="icon-button subtle-danger"
        onClick={onDelete}
        aria-label={`حذف ${task.title}`}
        title="حذف المهمة"
      >
        <Trash2 size={15} />
      </button>
    </div>
  );
  const statusSelect = (
    <select
      className={`task-status-select ${task.status}`}
      value={task.status}
      onChange={(e) => updateTask(task.id, { status: e.target.value as TaskStatus })}
      aria-label={`حالة ${task.title}`}
    >
      {statuses.map((status) => (
        <option value={status.id} key={status.id}>
          {status.label}
        </option>
      ))}
    </select>
  );
  const skillTag = (
    <span className="task-skill-label">
      {skill && <i className="skill-dot" style={{ background: skill.color }} />}
      {skill?.name ?? 'مهمة عامة'}
    </span>
  );

  if (view === 'list') {
    return (
      <div className={`task-list-row ${task.status === 'done' ? 'task-completed' : ''}`}>
        <div className="task-list-title">
          {checkbox}
          <div>
            <button className="task-title-button" onClick={onEdit}>
              {task.title}
            </button>
            <span className="task-list-description">
              {task.description || formatMinutes(task.estimatedMinutes)}
            </span>
          </div>
        </div>
        <div className="task-list-skill">{skillTag}</div>
        <span className={`badge priority-${task.priority}`}>{priorityLabels[task.priority]}</span>
        <span className={`task-due ${overdue ? 'overdue' : ''}`}>
          <CalendarDays size={14} />
          {dueLabel(task, today)}
        </span>
        {statusSelect}
        <div className="task-list-actions">{actions}</div>
      </div>
    );
  }

  return (
    <article className={`task-card ${task.status === 'done' ? 'task-completed' : ''}`}>
      <div className="task-card-top">
        {checkbox}
        {actions}
      </div>
      <button className="task-title-button" onClick={onEdit}>
        {task.title}
      </button>
      {task.description && <p className="task-card-description">{task.description}</p>}
      <div className="task-card-tags">
        <span className={`badge priority-${task.priority}`}>{priorityLabels[task.priority]}</span>
        {skillTag}
      </div>
      <div className="task-card-footer">
        <span className={`task-due ${overdue ? 'overdue' : ''}`}>
          <CalendarDays size={14} />
          {dueLabel(task, today)}
        </span>
        <span className="task-duration">
          <Clock3 size={14} />
          {formatMinutes(task.estimatedMinutes)}
        </span>
      </div>
      {statusSelect}
    </article>
  );
}

export default function TasksPage() {
  const { data, deleteTask, selectedItem, clearSelectedItem } = useApp();
  const [view, setView] = useState<'board' | 'list'>('board');
  const [search, setSearch] = useState('');
  const [priority, setPriority] = useState('all');
  const [skillId, setSkillId] = useState('all');
  const [editor, setEditor] = useState<Task | 'new' | null>(null);
  const [deleting, setDeleting] = useState<Task | null>(null);
  useEffect(() => {
    if (selectedItem?.page !== 'tasks') return;
    const task = data.tasks.find((item) => item.id === selectedItem.id);
    if (task) setEditor(task);
    clearSelectedItem();
  }, [selectedItem, data.tasks, clearSelectedItem]);
  const counts = statuses.map(
    (status) => data.tasks.filter((task) => task.status === status.id).length,
  );
  const filtered = useMemo(
    () =>
      data.tasks
        .filter((task) => {
          const skill = data.skills.find((item) => item.id === task.skillId);
          const text = `${task.title} ${task.description} ${skill?.name ?? ''}`.toLocaleLowerCase();
          return (
            text.includes(search.trim().toLocaleLowerCase()) &&
            (priority === 'all' || task.priority === priority) &&
            (skillId === 'all' || task.skillId === skillId)
          );
        })
        .sort((a, b) => {
          const dateOrder = (a.dueDate || '9999-12-31').localeCompare(b.dueDate || '9999-12-31');
          return (
            dateOrder ||
            priorityOrder[a.priority] - priorityOrder[b.priority] ||
            b.createdAt.localeCompare(a.createdAt)
          );
        }),
    [data.tasks, data.skills, search, priority, skillId],
  );
  const hasFilters = search !== '' || priority !== 'all' || skillId !== 'all';
  const openNew = () => setEditor('new');

  return (
    <>
      <PageHeader
        eyebrow="خطوة بخطوة، توصل"
        title="مهامي"
        description="رتّب أفكارك، حدّد أولوياتك، وخلّي كل مهمة تقرّبك من هدفك."
        action={<AddButton onClick={openNew}>مهمة جديدة</AddButton>}
      />
      <div className="task-summary-grid">
        <div className="task-summary">
          <span className="task-summary-icon todo">
            <Circle size={21} />
          </span>
          <div>
            <span>بانتظارك</span>
            <strong>{counts[0]}</strong>
          </div>
          <small>خطواتك القادمة</small>
        </div>
        <div className="task-summary">
          <span className="task-summary-icon in-progress">
            <ArrowUpRight size={22} />
          </span>
          <div>
            <span>قيد التنفيذ</span>
            <strong>{counts[1]}</strong>
          </div>
          <small>استمر، أنت تتقدّم</small>
        </div>
        <div className="task-summary">
          <span className="task-summary-icon done">
            <CheckCheck size={22} />
          </span>
          <div>
            <span>مكتملة</span>
            <strong>{counts[2]}</strong>
          </div>
          <small>
            {data.tasks.length
              ? `${Math.round((counts[2] / data.tasks.length) * 100)}% من مجموع مهامك`
              : 'كل إنجاز يبدأ بخطوة'}
          </small>
        </div>
      </div>
      <div className="filter-bar task-toolbar">
        <label className="search-field task-search">
          <Search size={17} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="ابحث عن مهمة…"
            aria-label="البحث عن مهمة"
          />
        </label>
        <div className="task-filter-controls">
          <SlidersHorizontal size={16} aria-hidden="true" />
          <select
            value={priority}
            onChange={(e) => setPriority(e.target.value)}
            aria-label="تصفية حسب الأولوية"
          >
            <option value="all">كل الأولويات</option>
            <option value="high">أولوية عالية</option>
            <option value="medium">أولوية متوسطة</option>
            <option value="low">أولوية منخفضة</option>
          </select>
          <select
            value={skillId}
            onChange={(e) => setSkillId(e.target.value)}
            aria-label="تصفية حسب المهارة"
          >
            <option value="all">كل المهارات</option>
            <option value="">مهام عامة</option>
            {data.skills.map((skill) => (
              <option key={skill.id} value={skill.id}>
                {skill.name}
              </option>
            ))}
          </select>
        </div>
        <div className="segmented-control task-view-toggle" aria-label="طريقة عرض المهام">
          <button
            className={view === 'board' ? 'active' : ''}
            onClick={() => setView('board')}
            aria-pressed={view === 'board'}
          >
            <Columns3 size={16} />
            لوحة
          </button>
          <button
            className={view === 'list' ? 'active' : ''}
            onClick={() => setView('list')}
            aria-pressed={view === 'list'}
          >
            <List size={17} />
            قائمة
          </button>
        </div>
      </div>
      {hasFilters && (
        <div className="filter-results">
          <span>{filtered.length} مهمة تطابق بحثك</span>
          <button
            className="text-link"
            onClick={() => {
              setSearch('');
              setPriority('all');
              setSkillId('all');
            }}
          >
            مسح الفلاتر
          </button>
        </div>
      )}
      {data.tasks.length === 0 || filtered.length === 0 ? (
        <div className="card">
          <EmptyState
            title={hasFilters ? 'ما لقينا مهام بهذا البحث' : 'مساحة جديدة لإنجازاتك'}
            description={
              hasFilters
                ? 'جرّب كلمة ثانية أو غيّر الفلاتر.'
                : 'أضف أول مهمة، وحدّد لها موعدًا ومهارة. الخطوة الصغيرة تصنع فرقًا.'
            }
            action={
              hasFilters ? (
                <button
                  className="button secondary"
                  onClick={() => {
                    setSearch('');
                    setPriority('all');
                    setSkillId('all');
                  }}
                >
                  إظهار كل المهام
                </button>
              ) : (
                <AddButton onClick={openNew}>أضف أول مهمة</AddButton>
              )
            }
          />
        </div>
      ) : view === 'board' ? (
        <div className="task-board">
          {statuses.map((status) => {
            const tasks = filtered.filter((task) => task.status === status.id);
            return (
              <section className={`task-column ${status.className}`} key={status.id}>
                <div className="task-column-heading">
                  <h2>
                    <i className="status-dot" />
                    {status.label}
                    <span className="task-column-count">{tasks.length}</span>
                  </h2>
                  <button className="icon-button" onClick={openNew} aria-label="إضافة مهمة جديدة">
                    <Plus size={17} />
                  </button>
                </div>
                <div className="task-column-body">
                  {tasks.map((task) => (
                    <TaskItem
                      key={task.id}
                      task={task}
                      skill={data.skills.find((skill) => skill.id === task.skillId)}
                      view="board"
                      onEdit={() => setEditor(task)}
                      onDelete={() => setDeleting(task)}
                    />
                  ))}
                  {tasks.length === 0 && (
                    <div className="task-column-empty">
                      {status.id === 'done'
                        ? 'إنجازاتك القادمة تظهر هنا'
                        : status.id === 'in-progress'
                          ? 'اختر مهمة وابدأ بيها'
                          : 'ماكو مهام بانتظارك'}
                    </div>
                  )}
                </div>
              </section>
            );
          })}
        </div>
      ) : (
        <section className="card task-list" aria-label="قائمة المهام">
          <div className="task-list-head">
            <span>المهمة</span>
            <span>المهارة</span>
            <span>الأولوية</span>
            <span>الموعد</span>
            <span>الحالة</span>
            <span aria-label="الإجراءات" />
          </div>
          {filtered.map((task) => (
            <TaskItem
              key={task.id}
              task={task}
              skill={data.skills.find((skill) => skill.id === task.skillId)}
              view="list"
              onEdit={() => setEditor(task)}
              onDelete={() => setDeleting(task)}
            />
          ))}
        </section>
      )}
      {editor && (
        <TaskEditor task={editor === 'new' ? undefined : editor} onClose={() => setEditor(null)} />
      )}
      {deleting && (
        <ConfirmDialog
          title="حذف المهمة؟"
          description={`راح تنحذف مهمة «${deleting.title}». هذا الإجراء ما يمكن التراجع عنه.`}
          onConfirm={() => deleteTask(deleting.id)}
          onClose={() => setDeleting(null)}
        />
      )}
    </>
  );
}
