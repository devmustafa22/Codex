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
          <p>{skill.description || 'كل جلسة تعلّم تضيف خطوة جديدة لهذه المهارة.'}</p>
        </div>
      </div>
      <div className="skill-detail-stats">
        <div className="skill-detail-stat">
          <Clock3 size={18} />
          <strong>{formatMinutes(minutes)}</strong>
          <span>وقت التعلّم الكلي</span>
        </div>
        <div className="skill-detail-stat">
          <Target size={18} />
          <strong>{progress}%</strong>
          <span>من هدف {formatMinutes(skill.targetMinutes)}</span>
        </div>
        <div className="skill-detail-stat">
          <Flame size={18} />
          <strong>{formatMinutes(weekly)}</strong>
          <span>هذا الأسبوع / {formatMinutes(skill.weeklyGoalMinutes)}</span>
        </div>
      </div>
      <div className="skill-detail-progress">
        <div className="skill-progress-heading">
          <span>تقدّمك نحو الهدف</span>
          <strong>{progress}%</strong>
        </div>
        <ProgressBar value={progress} color={skill.color} />
        <small>
          يتضمن {formatMinutes(skill.baselineMinutes)} من وقت التعلّم السابق، و
          {formatMinutes(minutes - skill.baselineMinutes)} من أنشطتك المسجلة.
        </small>
      </div>
      <div className="skill-detail-section">
        <div className="card-heading">
          <h3>
            آخر جلسات التعلّم <span className="badge">{entries.length}</span>
          </h3>
          <button className="text-link" onClick={openJournal}>
            سجّل نشاط
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
                  {kindLabels[entry.kind]}
                </span>
                {entry.note && <p>{entry.note}</p>}
              </div>
              <span className="badge">{formatMinutes(entry.minutes)}</span>
            </div>
          ))
        ) : (
          <p className="skill-detail-empty">
            ما عندك جلسات مسجلة بعد. سجّل أول نشاط وشوف تقدّمك يكبر.
          </p>
        )}
        {entries.length > 5 && (
          <button className="text-link" onClick={openJournal}>
            عرض سجل الأنشطة بالكامل
            <ArrowUpLeft size={14} />
          </button>
        )}
      </div>
      <div className="skill-detail-section">
        <div className="card-heading">
          <h3>
            المهام المرتبطة <span className="badge">{tasks.length}</span>
          </h3>
          <button
            className="text-link"
            onClick={() => {
              onClose();
              setPage('tasks');
            }}
          >
            إدارة المهام
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
                  {task.dueDate ? formatDate(task.dueDate) : 'بدون موعد'} ·{' '}
                  {formatMinutes(task.estimatedMinutes)}
                </span>
              </div>
              <span className={`badge status-${task.status}`}>
                {task.status === 'done'
                  ? 'مكتملة'
                  : task.status === 'in-progress'
                    ? 'قيد التنفيذ'
                    : 'للإنجاز'}
              </span>
            </div>
          ))
        ) : (
          <p className="skill-detail-empty">
            اربط مهامك بهذه المهارة حتى يتحوّل هدفك إلى خطوات واضحة.
          </p>
        )}
      </div>
      <div className="form-actions skill-detail-actions">
        <button className="button primary" onClick={openJournal}>
          <BookOpen size={17} />
          سجّل نشاط تعلّم
        </button>
        <button className="button secondary" onClick={onEdit}>
          <Pencil size={16} />
          تعديل المهارة
        </button>
        <button
          className="icon-button subtle-danger"
          onClick={onDelete}
          aria-label="حذف المهارة"
          title="حذف المهارة"
        >
          <Trash2 size={18} />
        </button>
      </div>
    </Modal>
  );
}

export default function SkillsPage() {
  const { data, deleteSkill, setPage, selectedItem, clearSelectedItem } = useApp();
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
    a.localeCompare(b, 'ar'),
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
        eyebrow="استثمر بأهم مشروع: نفسك"
        title="رحلة مهاراتي"
        description="كل ساعة تتعلّم بيها تصنع فرق. حدّد أهدافك، وسجّل وقتك، وشوف نموّك."
        action={<AddButton onClick={openNew}>مهارة جديدة</AddButton>}
      />
      <div className="skill-summary card">
        <div>
          <span className="skill-summary-icon">
            <Sparkles size={23} />
          </span>
          <div>
            <strong>{data.skills.length}</strong>
            <span>مهارات في رحلتك</span>
          </div>
        </div>
        <div>
          <span className="skill-summary-icon">
            <Clock3 size={23} />
          </span>
          <div>
            <strong>{formatMinutes(totalMinutes)}</strong>
            <span>وقت تطوير مهاراتك</span>
          </div>
        </div>
        <div>
          <span className="skill-summary-icon">
            <Target size={23} />
          </span>
          <div>
            <strong>{completed}</strong>
            <span>أهداف وصلت لها</span>
          </div>
        </div>
        <p>
          الاستمرارية أهم من السرعة.
          <br />
          <b>خطوة صغيرة اليوم، مهارة أقوى باچر.</b>
        </p>
      </div>
      <div className="filter-bar skill-toolbar">
        <label className="search-field">
          <Search size={17} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="ابحث عن مهارة…"
            aria-label="البحث عن مهارة"
          />
        </label>
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          aria-label="تصفية حسب مجال المهارة"
        >
          <option value="all">كل المجالات</option>
          {categories.map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </select>
        <span className="skill-result-count">{filtered.length} مهارات</span>
      </div>
      {hasFilters && (
        <div className="filter-results">
          <span>نتائج البحث والتصفية</span>
          <button
            className="text-link"
            onClick={() => {
              setSearch('');
              setCategory('all');
            }}
          >
            مسح الفلاتر
          </button>
        </div>
      )}
      {filtered.length === 0 ? (
        <div className="card">
          <EmptyState
            title={hasFilters ? 'ما لقينا مهارات بهذا البحث' : 'شنو تحب تتعلّم؟'}
            description={
              hasFilters
                ? 'غيّر كلمة البحث أو اختار مجال ثاني.'
                : 'أضف مهارتك الأولى، وحدّد هدفًا مناسبًا إلك. نموّك يبدأ من هنا.'
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
                  إظهار كل المهارات
                </button>
              ) : (
                <AddButton onClick={openNew}>أضف أول مهارة</AddButton>
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
                      aria-label={`تعديل مهارة ${skill.name}`}
                      title="تعديل المهارة"
                    >
                      <Pencil size={15} />
                    </button>
                    <button
                      className="icon-button subtle-danger"
                      onClick={() => setDeleting(skill)}
                      aria-label={`حذف مهارة ${skill.name}`}
                      title="حذف المهارة"
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
                  {skill.description || 'خطوات يومية صغيرة نحو هدف كبير.'}
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
                      هدف هذا الأسبوع
                    </span>
                    <b>
                      {formatMinutes(weekly)} / {formatMinutes(skill.weeklyGoalMinutes)}
                    </b>
                  </div>
                  <ProgressBar value={weeklyPercent} color={skill.color} />
                  {weeklyPercent >= 100 && (
                    <small className="skill-goal-reached">
                      <CheckCheck size={13} />
                      أحسنت! وصلت لهدفك الأسبوعي
                    </small>
                  )}
                </div>
                <div className="skill-card-footer">
                  <span>
                    <CheckCheck size={15} />
                    {linkedTasks} مهام مفتوحة
                  </span>
                  <button className="text-link" onClick={() => setDetailId(skill.id)}>
                    تفاصيل المهارة
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
          <p>تعلّمت شي جديد اليوم؟ سجّله حتى تنحسب خطواتك وتكبر مهاراتك.</p>
          <button className="button secondary" onClick={() => setPage('journal')}>
            افتح سجل يومي
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
          title="حذف المهارة؟"
          description={`راح تنحذف مهارة «${deleting.name}» وأهدافها. أنشطتك ومهامك ومواعيدك تبقى محفوظة بدون الارتباط بهذه المهارة.`}
          onConfirm={() => deleteSkill(deleting.id)}
          onClose={() => setDeleting(null)}
        />
      )}
    </>
  );
}
