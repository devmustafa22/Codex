import { useEffect, useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import {
  ArrowUpLeft,
  BookOpen,
  CheckCheck,
  Code2,
  Clock3,
  Flame,
  Languages,
  Palette,
  Pencil,
  Search,
  Sparkles,
  Target,
  Trash2,
} from 'lucide-react';
import type { Skill } from '../lib/types';
import { formatDate, formatMinutes, kindLabels, weekKeys } from '../lib/dates';
import { skillMinutes, skillProgress } from '../lib/metrics';
import { useApp } from '../state/AppContext';
import { useLanguage } from '../state/LanguageContext';
import {
  AddButton,
  ConfirmDialog,
  EmptyState,
  Modal,
  PageHeader,
  ProgressBar,
} from '../components/ui';
import { SkillEditor } from '../components/SkillEditor';

function SkillIcon({ skill, size = 23 }: { skill: Skill; size?: number }) {
  const text = `${skill.name} ${skill.category}`;
  if (/برمجة|تطوير الويب|code|programming/i.test(text)) return <Code2 size={size} />;
  if (/تصميم|رسم|design/i.test(text)) return <Palette size={size} />;
  if (/لغات|اللغة|english|language/i.test(text)) return <Languages size={size} />;
  if (/قراءة|كتابة|book|reading/i.test(text)) return <BookOpen size={size} />;
  return <Sparkles size={size} />;
}

function weeklySkillMinutes(
  skillId: string,
  entries: ReturnType<typeof useApp>['data']['entries'],
) {
  const days = weekKeys();
  return entries
    .filter((entry) => entry.skillId === skillId && days.includes(entry.date))
    .reduce((sum, entry) => sum + entry.minutes, 0);
}

function SkillDetail({
  skill,
  onClose,
  onEdit,
  onDelete,
}: {
  skill: Skill;
  onClose: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const { data, setPage } = useApp();
  const { t } = useLanguage();
  const minutes = skillMinutes(data, skill);
  const progress = skillProgress(data, skill);
  const weekly = weeklySkillMinutes(skill.id, data.entries);
  const entries = data.entries
    .filter((entry) => entry.skillId === skill.id)
    .sort((a, b) => b.date.localeCompare(a.date));
  const tasks = data.tasks
    .filter((task) => task.skillId === skill.id)
    .sort(
      (a, b) =>
        Number(a.status === 'done') - Number(b.status === 'done') ||
        (a.dueDate || '9999-12-31').localeCompare(b.dueDate || '9999-12-31'),
    );
  const openJournal = () => {
    onClose();
    setPage('journal');
  };

  return (
    <Modal title={skill.name} onClose={onClose} wide>
      <div className="skill-detail-intro">
        <span
          className="skill-card-icon"
          style={{ color: skill.color, background: `${skill.color}18` }}
        >
          <SkillIcon skill={skill} size={27} />
        </span>
        <div>
          <span className="badge skill-category">{skill.category}</span>
          <p>{skill.description || t('activity.skills.detailFallback')}</p>
        </div>
      </div>
      <div className="skill-detail-stats">
        <div className="skill-detail-stat">
          <Clock3 size={18} />
          <strong>{formatMinutes(minutes)}</strong>
          <span>{t('activity.skills.totalLearning')}</span>
        </div>
        <div className="skill-detail-stat">
          <Target size={18} />
          <strong>{progress}%</strong>
          <span>
            {t('activity.skills.targetTime', { duration: formatMinutes(skill.targetMinutes) })}
          </span>
        </div>
        <div className="skill-detail-stat">
          <Flame size={18} />
          <strong>{formatMinutes(weekly)}</strong>
          <span>
            {t('activity.skills.weeklyTime', { duration: formatMinutes(skill.weeklyGoalMinutes) })}
          </span>
        </div>
      </div>
      <div className="skill-detail-progress">
        <div className="skill-progress-heading">
          <span>{t('activity.skills.progress')}</span>
          <strong>{progress}%</strong>
        </div>
        <ProgressBar value={progress} color={skill.color} />
        <small>
          {t('activity.skills.timeBreakdown', {
            baseline: formatMinutes(skill.baselineMinutes),
            recorded: formatMinutes(minutes - skill.baselineMinutes),
          })}
        </small>
      </div>
      <div className="skill-detail-section">
        <div className="card-heading">
          <h3>
            {t('activity.skills.recentSessions')} <span className="badge">{entries.length}</span>
          </h3>
          <button className="text-link" onClick={openJournal}>
            {t('activity.skills.logActivity')}
            <ArrowUpLeft size={14} />
          </button>
        </div>
        {entries.length ? (
          entries.slice(0, 5).map((entry) => (
            <div className="skill-related-row" key={entry.id}>
              <span className="skill-related-icon" style={{ color: skill.color }}>
                <BookOpen size={17} />
              </span>
              <div>
                <strong>{entry.title}</strong>
                <span className="skill-entry-meta">
                  {formatDate(entry.date, { day: 'numeric', month: 'long', year: 'numeric' })} ·{' '}
                  {t(kindLabels[entry.kind])}
                </span>
                {entry.note && <p>{entry.note}</p>}
              </div>
              <span className="badge">{formatMinutes(entry.minutes)}</span>
            </div>
          ))
        ) : (
          <p className="skill-detail-empty">{t('activity.skills.noSessions')}</p>
        )}
        {entries.length > 5 && (
          <button className="text-link" onClick={openJournal}>
            {t('activity.skills.allActivity')}
            <ArrowUpLeft size={14} />
          </button>
        )}
      </div>
      <div className="skill-detail-section">
        <div className="card-heading">
          <h3>
            {t('activity.skills.linkedTasks')} <span className="badge">{tasks.length}</span>
          </h3>
          <button
            className="text-link"
            onClick={() => {
              onClose();
              setPage('tasks');
            }}
          >
            {t('activity.skills.manageTasks')}
            <ArrowUpLeft size={14} />
          </button>
        </div>
        {tasks.length ? (
          tasks.slice(0, 5).map((task) => (
            <div className="skill-related-row" key={task.id}>
              <span className={`skill-related-icon ${task.status === 'done' ? 'completed' : ''}`}>
                <CheckCheck size={17} />
              </span>
              <div>
                <strong>{task.title}</strong>
                <span className="skill-entry-meta">
                  {task.dueDate ? formatDate(task.dueDate) : t('activity.skills.noDue')} ·{' '}
                  {formatMinutes(task.estimatedMinutes)}
                </span>
              </div>
              <span className={`badge status-${task.status}`}>
                {task.status === 'done'
                  ? t('activity.skills.done')
                  : task.status === 'in-progress'
                    ? t('activity.skills.inProgress')
                    : t('activity.skills.todo')}
              </span>
            </div>
          ))
        ) : (
          <p className="skill-detail-empty">{t('activity.skills.noTasks')}</p>
        )}
      </div>
      <div className="form-actions skill-detail-actions">
        <button className="button primary" onClick={openJournal}>
          <BookOpen size={17} />
          {t('activity.skills.logLearning')}
        </button>
        <button className="button secondary" onClick={onEdit}>
          <Pencil size={16} />
          {t('activity.skills.edit')}
        </button>
        <button
          className="icon-button subtle-danger"
          onClick={onDelete}
          aria-label={t('activity.skills.delete')}
          title={t('activity.skills.delete')}
        >
          <Trash2 size={18} />
        </button>
      </div>
    </Modal>
  );
}

export default function SkillsPage() {
  const { data, deleteSkill, setPage, selectedItem, clearSelectedItem } = useApp();
  const { t, language } = useLanguage();
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('all');
  const [editor, setEditor] = useState<Skill | 'new' | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<Skill | null>(null);
  useEffect(() => {
    if (selectedItem?.page !== 'skills') return;
    const skill = data.skills.find((item) => item.id === selectedItem.id);
    if (skill) setDetailId(skill.id);
    clearSelectedItem();
  }, [selectedItem, data.skills, clearSelectedItem]);
  const categories = [...new Set(data.skills.map((skill) => skill.category))].sort((a, b) =>
    a.localeCompare(b, language),
  );
  const filtered = useMemo(
    () =>
      data.skills.filter(
        (skill) =>
          `${skill.name} ${skill.category} ${skill.description}`
            .toLocaleLowerCase()
            .includes(search.trim().toLocaleLowerCase()) &&
          (category === 'all' || category === skill.category),
      ),
    [data.skills, search, category],
  );
  const totalMinutes = data.skills.reduce((sum, skill) => sum + skillMinutes(data, skill), 0);
  const completed = data.skills.filter((skill) => skillProgress(data, skill) >= 100).length;
  const detail = data.skills.find((skill) => skill.id === detailId);
  const openNew = () => setEditor('new');
  const hasFilters = search !== '' || category !== 'all';

  return (
    <>
      <PageHeader
        eyebrow={t('activity.skills.eyebrow')}
        title={t('activity.skills.title')}
        description={t('activity.skills.description')}
        action={<AddButton onClick={openNew}>{t('activity.skills.new')}</AddButton>}
      />
      <div className="skill-summary card">
        <div>
          <span className="skill-summary-icon">
            <Sparkles size={23} />
          </span>
          <div>
            <strong>{data.skills.length}</strong>
            <span>{t('activity.skills.skillCount')}</span>
          </div>
        </div>
        <div>
          <span className="skill-summary-icon">
            <Clock3 size={23} />
          </span>
          <div>
            <strong>{formatMinutes(totalMinutes)}</strong>
            <span>{t('activity.skills.developmentTime')}</span>
          </div>
        </div>
        <div>
          <span className="skill-summary-icon">
            <Target size={23} />
          </span>
          <div>
            <strong>{completed}</strong>
            <span>{t('activity.skills.goalsReached')}</span>
          </div>
        </div>
        <p>
          {t('activity.skills.consistency')}
          <br />
          <b>{t('activity.skills.quote')}</b>
        </p>
      </div>
      <div className="filter-bar skill-toolbar">
        <label className="search-field">
          <Search size={17} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('activity.skills.searchPlaceholder')}
            aria-label={t('activity.skills.search')}
          />
        </label>
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          aria-label={t('activity.skills.filterCategory')}
        >
          <option value="all">{t('activity.skills.allCategories')}</option>
          {categories.map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </select>
        <span className="skill-result-count">
          {t('activity.skills.matches', { count: filtered.length })}
        </span>
      </div>
      {hasFilters && (
        <div className="filter-results">
          <span>{t('activity.skills.filteredResults')}</span>
          <button
            className="text-link"
            onClick={() => {
              setSearch('');
              setCategory('all');
            }}
          >
            {t('activity.skills.clearFilters')}
          </button>
        </div>
      )}
      {filtered.length === 0 ? (
        <div className="card">
          <EmptyState
            title={hasFilters ? t('activity.skills.noResults') : t('activity.skills.emptyTitle')}
            description={
              hasFilters
                ? t('activity.skills.noResultsDescription')
                : t('activity.skills.emptyDescription')
            }
            action={
              hasFilters ? (
                <button
                  className="button secondary"
                  onClick={() => {
                    setSearch('');
                    setCategory('all');
                  }}
                >
                  {t('activity.skills.showAll')}
                </button>
              ) : (
                <AddButton onClick={openNew}>{t('activity.skills.addFirst')}</AddButton>
              )
            }
          />
        </div>
      ) : (
        <div className="skill-grid">
          {filtered.map((skill) => {
            const minutes = skillMinutes(data, skill);
            const progress = skillProgress(data, skill);
            const weekly = weeklySkillMinutes(skill.id, data.entries);
            const weeklyPercent =
              skill.weeklyGoalMinutes > 0
                ? Math.min(100, Math.floor((weekly / skill.weeklyGoalMinutes) * 100))
                : 0;
            const linkedTasks = data.tasks.filter(
              (task) => task.skillId === skill.id && task.status !== 'done',
            ).length;
            return (
              <article
                className="card skill-card"
                key={skill.id}
                style={{ '--skill-color': skill.color } as CSSProperties}
              >
                <div className="skill-card-top">
                  <span
                    className="skill-card-icon"
                    style={{ color: skill.color, background: `${skill.color}18` }}
                  >
                    <SkillIcon skill={skill} />
                  </span>
                  <div className="skill-card-actions">
                    <button
                      className="icon-button"
                      onClick={() => setEditor(skill)}
                      aria-label={t('activity.skills.editAria', { name: skill.name })}
                      title={t('activity.skills.edit')}
                    >
                      <Pencil size={15} />
                    </button>
                    <button
                      className="icon-button subtle-danger"
                      onClick={() => setDeleting(skill)}
                      aria-label={t('activity.skills.deleteAria', { name: skill.name })}
                      title={t('activity.skills.delete')}
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>
                <span className="skill-category">{skill.category}</span>
                <button className="skill-title-button" onClick={() => setDetailId(skill.id)}>
                  {skill.name}
                </button>
                <p className="skill-card-description">
                  {skill.description || t('activity.skills.cardFallback')}
                </p>
                <div className="skill-progress-heading">
                  <span>
                    {formatMinutes(minutes)} <small>/ {formatMinutes(skill.targetMinutes)}</small>
                  </span>
                  <strong>{progress}%</strong>
                </div>
                <ProgressBar value={progress} color={skill.color} />
                <div className="skill-weekly">
                  <div className="skill-weekly-line">
                    <span>
                      <Flame size={14} />
                      {t('activity.skills.weekGoal')}
                    </span>
                    <b>
                      {formatMinutes(weekly)} / {formatMinutes(skill.weeklyGoalMinutes)}
                    </b>
                  </div>
                  <ProgressBar value={weeklyPercent} color={skill.color} />
                  {weeklyPercent >= 100 && (
                    <small className="skill-goal-reached">
                      <CheckCheck size={13} />
                      {t('activity.skills.weekGoalReached')}
                    </small>
                  )}
                </div>
                <div className="skill-card-footer">
                  <span>
                    <CheckCheck size={15} />
                    {t('activity.skills.openTasks', { count: linkedTasks })}
                  </span>
                  <button className="text-link" onClick={() => setDetailId(skill.id)}>
                    {t('activity.skills.details')}
                    <ArrowUpLeft size={15} />
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}
      {data.skills.length > 0 && (
        <div className="skill-journal-prompt">
          <BookOpen size={19} />
          <p>{t('activity.skills.journalPrompt')}</p>
          <button className="button secondary" onClick={() => setPage('journal')}>
            {t('activity.skills.openJournal')}
            <ArrowUpLeft size={16} />
          </button>
        </div>
      )}
      {editor && (
        <SkillEditor
          skill={editor === 'new' ? undefined : editor}
          onClose={() => setEditor(null)}
        />
      )}
      {detail && (
        <SkillDetail
          skill={detail}
          onClose={() => setDetailId(null)}
          onEdit={() => {
            setDetailId(null);
            setEditor(detail);
          }}
          onDelete={() => {
            setDetailId(null);
            setDeleting(detail);
          }}
        />
      )}
      {deleting && (
        <ConfirmDialog
          title={t('activity.skills.deleteTitle')}
          description={t('activity.skills.deleteDescription', { name: deleting.name })}
          onConfirm={() => deleteSkill(deleting.id)}
          onClose={() => setDeleting(null)}
        />
      )}
    </>
  );
}
