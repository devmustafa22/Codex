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
import { useLanguage } from '../state/LanguageContext';
import { AddButton, ConfirmDialog, EmptyState, PageHeader } from '../components/ui';
import { TaskEditor } from '../components/TaskEditor';

const statuses: { id: TaskStatus; label: string; className: string }[] = [
  { id: 'todo', label: 'activity.tasks.status.todo', className: 'todo' },
  { id: 'in-progress', label: 'activity.tasks.status.progress', className: 'in-progress' },
  { id: 'done', label: 'activity.tasks.status.done', className: 'done' },
];
const priorityLabels = {
  high: 'activity.tasks.priority.high',
  medium: 'activity.tasks.priority.medium',
  low: 'activity.tasks.priority.low',
};
const priorityOrder = { high: 0, medium: 1, low: 2 };

function dueLabel(task: Task, today: string, t: ReturnType<typeof useLanguage>['t']) {
  if (!task.dueDate) return t('activity.tasks.noDue');
  if (task.dueDate === today) return t('activity.tasks.today');
  if (task.dueDate === addDays(today, 1)) return t('activity.tasks.tomorrow');
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
  const { t } = useLanguage();
  const today = todayKey();
  const overdue = !!task.dueDate && task.dueDate < today && task.status !== 'done';
  const toggleDone = () => {
    const next = task.status === 'done' ? 'todo' : 'done';
    updateTask(task.id, { status: next });
    notify(
      next === 'done' ? t('activity.tasks.completedNotice') : t('activity.tasks.reopenedNotice'),
    );
  };
  const checkbox = (
    <label className={`task-check ${task.status === 'done' ? 'checked' : ''}`}>
      <input
        type="checkbox"
        checked={task.status === 'done'}
        onChange={toggleDone}
        aria-label={
          task.status === 'done'
            ? t('activity.tasks.reopenAria', { title: task.title })
            : t('activity.tasks.completeAria', { title: task.title })
        }
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
        aria-label={t('activity.tasks.editAria', { title: task.title })}
        title={t('activity.tasks.edit')}
      >
        <Pencil size={15} />
      </button>
      <button
        className="icon-button subtle-danger"
        onClick={onDelete}
        aria-label={t('activity.tasks.deleteAria', { title: task.title })}
        title={t('activity.tasks.delete')}
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
      aria-label={t('activity.tasks.statusAria', { title: task.title })}
    >
      {statuses.map((status) => (
        <option value={status.id} key={status.id}>
          {t(status.label)}
        </option>
      ))}
    </select>
  );
  const skillTag = (
    <span className="task-skill-label">
      {skill && <i className="skill-dot" style={{ background: skill.color }} />}
      {skill?.name ?? t('activity.tasks.general')}
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
        <span className={`badge priority-${task.priority}`}>
          {t(priorityLabels[task.priority])}
        </span>
        <span className={`task-due ${overdue ? 'overdue' : ''}`}>
          <CalendarDays size={14} />
          {dueLabel(task, today, t)}
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
        <span className={`badge priority-${task.priority}`}>
          {t(priorityLabels[task.priority])}
        </span>
        {skillTag}
      </div>
      <div className="task-card-footer">
        <span className={`task-due ${overdue ? 'overdue' : ''}`}>
          <CalendarDays size={14} />
          {dueLabel(task, today, t)}
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
  const { t } = useLanguage();
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
        eyebrow={t('activity.tasks.eyebrow')}
        title={t('activity.tasks.title')}
        description={t('activity.tasks.description')}
        action={<AddButton onClick={openNew}>{t('activity.tasks.new')}</AddButton>}
      />
      <div className="task-summary-grid">
        <div className="task-summary">
          <span className="task-summary-icon todo">
            <Circle size={21} />
          </span>
          <div>
            <span>{t('activity.tasks.waiting')}</span>
            <strong>{counts[0]}</strong>
          </div>
          <small>{t('activity.tasks.nextSteps')}</small>
        </div>
        <div className="task-summary">
          <span className="task-summary-icon in-progress">
            <ArrowUpRight size={22} />
          </span>
          <div>
            <span>{t('activity.tasks.status.progress')}</span>
            <strong>{counts[1]}</strong>
          </div>
          <small>{t('activity.tasks.keepGoing')}</small>
        </div>
        <div className="task-summary">
          <span className="task-summary-icon done">
            <CheckCheck size={22} />
          </span>
          <div>
            <span>{t('activity.tasks.status.done')}</span>
            <strong>{counts[2]}</strong>
          </div>
          <small>
            {data.tasks.length
              ? t('activity.tasks.completedPercent', {
                  percent: Math.round((counts[2] / data.tasks.length) * 100),
                })
              : t('activity.tasks.firstStep')}
          </small>
        </div>
      </div>
      <div className="filter-bar task-toolbar">
        <label className="search-field task-search">
          <Search size={17} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('activity.tasks.searchPlaceholder')}
            aria-label={t('activity.tasks.search')}
          />
        </label>
        <div className="task-filter-controls">
          <SlidersHorizontal size={16} aria-hidden="true" />
          <select
            value={priority}
            onChange={(e) => setPriority(e.target.value)}
            aria-label={t('activity.tasks.filterPriority')}
          >
            <option value="all">{t('activity.tasks.allPriorities')}</option>
            <option value="high">{t('activity.tasks.priority.high')}</option>
            <option value="medium">{t('activity.tasks.priority.medium')}</option>
            <option value="low">{t('activity.tasks.priority.low')}</option>
          </select>
          <select
            value={skillId}
            onChange={(e) => setSkillId(e.target.value)}
            aria-label={t('activity.tasks.filterSkill')}
          >
            <option value="all">{t('activity.tasks.allSkills')}</option>
            <option value="">{t('activity.tasks.generalTasks')}</option>
            {data.skills.map((skill) => (
              <option key={skill.id} value={skill.id}>
                {skill.name}
              </option>
            ))}
          </select>
        </div>
        <div className="segmented-control task-view-toggle" aria-label={t('activity.tasks.view')}>
          <button
            className={view === 'board' ? 'active' : ''}
            onClick={() => setView('board')}
            aria-pressed={view === 'board'}
          >
            <Columns3 size={16} />
            {t('activity.tasks.board')}
          </button>
          <button
            className={view === 'list' ? 'active' : ''}
            onClick={() => setView('list')}
            aria-pressed={view === 'list'}
          >
            <List size={17} />
            {t('activity.tasks.list')}
          </button>
        </div>
      </div>
      {hasFilters && (
        <div className="filter-results">
          <span>{t('activity.tasks.matches', { count: filtered.length })}</span>
          <button
            className="text-link"
            onClick={() => {
              setSearch('');
              setPriority('all');
              setSkillId('all');
            }}
          >
            {t('activity.tasks.clearFilters')}
          </button>
        </div>
      )}
      {data.tasks.length === 0 || filtered.length === 0 ? (
        <div className="card">
          <EmptyState
            title={hasFilters ? t('activity.tasks.noResults') : t('activity.tasks.emptyTitle')}
            description={
              hasFilters
                ? t('activity.tasks.noResultsDescription')
                : t('activity.tasks.emptyDescription')
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
                  {t('activity.tasks.showAll')}
                </button>
              ) : (
                <AddButton onClick={openNew}>{t('activity.tasks.addFirst')}</AddButton>
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
                    {t(status.label)}
                    <span className="task-column-count">{tasks.length}</span>
                  </h2>
                  <button
                    className="icon-button"
                    onClick={openNew}
                    aria-label={t('activity.tasks.addAria')}
                  >
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
                        ? t('activity.tasks.columnDoneEmpty')
                        : status.id === 'in-progress'
                          ? t('activity.tasks.columnProgressEmpty')
                          : t('activity.tasks.columnTodoEmpty')}
                    </div>
                  )}
                </div>
              </section>
            );
          })}
        </div>
      ) : (
        <section className="card task-list" aria-label={t('activity.tasks.listAria')}>
          <div className="task-list-head">
            <span>{t('activity.tasks.columnTask')}</span>
            <span>{t('activity.tasks.columnSkill')}</span>
            <span>{t('activity.tasks.columnPriority')}</span>
            <span>{t('activity.tasks.columnDue')}</span>
            <span>{t('activity.tasks.columnStatus')}</span>
            <span aria-label={t('activity.tasks.columnActions')} />
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
          title={t('activity.tasks.deleteTitle')}
          description={t('activity.tasks.deleteDescription', { title: deleting.title })}
          onConfirm={() => deleteTask(deleting.id)}
          onClose={() => setDeleting(null)}
        />
      )}
    </>
  );
}
