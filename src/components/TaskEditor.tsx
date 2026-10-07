import { useState } from 'react';
import type { FormEvent } from 'react';
import { Check, CalendarDays } from 'lucide-react';
import type { NewTask, Task } from '../lib/types';
import { todayKey } from '../lib/dates';
import { useApp } from '../state/AppContext';
import { Modal } from './ui';

interface TaskEditorProps {
  task?: Task;
  onClose: () => void;
}

export function TaskEditor({ task, onClose }: TaskEditorProps) {
  const { data, addTask, updateTask, notify } = useApp();
  const [draft, setDraft] = useState<NewTask>({
    title: task?.title ?? '',
    description: task?.description ?? '',
    dueDate: task?.dueDate ?? todayKey(),
    status: task?.status ?? 'todo',
    priority: task?.priority ?? 'medium',
    skillId: task?.skillId ?? '',
    estimatedMinutes: task?.estimatedMinutes ?? 60,
  });
  const [error, setError] = useState('');

  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const title = draft.title.trim();
    if (!title) return setError('اكتب اسم المهمة حتى تقدر تحفظها.');
    if (!draft.dueDate) return setError('حدّد موعدًا للمهمة قبل الحفظ.');
    if (
      !Number.isInteger(draft.estimatedMinutes) ||
      draft.estimatedMinutes < 1 ||
      draft.estimatedMinutes > 10080
    ) {
      return setError('الوقت المتوقع لازم يكون بين 1 و 10080 دقيقة.');
    }
    const next = { ...draft, title, description: draft.description.trim() };
    if (task) {
      updateTask(task.id, next);
      notify('تم حفظ تعديلات المهمة');
    } else {
      addTask(next);
    }
    onClose();
  }

  return (
    <Modal title={task ? 'تعديل المهمة' : 'مهمة جديدة'} onClose={onClose}>
      <form onSubmit={save}>
        <div className="form-grid">
          <label className="form-field full-width">
            <span>
              اسم المهمة <span aria-hidden="true">*</span>
            </span>
            <input
              value={draft.title}
              onChange={(e) => setDraft({ ...draft, title: e.target.value })}
              placeholder="شنو الخطوة الجاية؟"
              maxLength={160}
              required
              autoFocus
            />
          </label>
          <label className="form-field full-width">
            <span>تفاصيل وملاحظات</span>
            <textarea
              value={draft.description}
              onChange={(e) => setDraft({ ...draft, description: e.target.value })}
              placeholder="اكتب التفاصيل اللي تساعدك تبدأ بسهولة…"
              rows={3}
              maxLength={4000}
            />
          </label>
          <label className="form-field">
            <span>
              <CalendarDays size={14} /> الموعد النهائي *
            </span>
            <input
              type="date"
              value={draft.dueDate}
              onChange={(e) => setDraft({ ...draft, dueDate: e.target.value })}
              min="0001-01-01"
              max="9999-12-31"
              required
            />
          </label>
          <label className="form-field">
            <span>الوقت المتوقع بالدقائق</span>
            <input
              type="number"
              min={1}
              max={10080}
              step={1}
              required
              value={draft.estimatedMinutes || ''}
              onChange={(e) => setDraft({ ...draft, estimatedMinutes: Number(e.target.value) })}
            />
          </label>
          <label className="form-field">
            <span>الأولوية</span>
            <select
              value={draft.priority}
              onChange={(e) =>
                setDraft({ ...draft, priority: e.target.value as NewTask['priority'] })
              }
            >
              <option value="high">عالية — تحتاج اهتمامك</option>
              <option value="medium">متوسطة</option>
              <option value="low">منخفضة</option>
            </select>
          </label>
          <label className="form-field">
            <span>الحالة</span>
            <select
              value={draft.status}
              onChange={(e) => setDraft({ ...draft, status: e.target.value as NewTask['status'] })}
            >
              <option value="todo">للإنجاز</option>
              <option value="in-progress">قيد التنفيذ</option>
              <option value="done">مكتملة</option>
            </select>
          </label>
          <label className="form-field full-width">
            <span>المهارة المرتبطة</span>
            <select
              value={draft.skillId}
              onChange={(e) => setDraft({ ...draft, skillId: e.target.value })}
            >
              <option value="">مهمة عامة</option>
              {data.skills.map((skill) => (
                <option key={skill.id} value={skill.id}>
                  {skill.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <div className="form-actions">
          <button className="button primary" type="submit">
            <Check size={17} />
            {task ? 'حفظ التعديلات' : 'إضافة المهمة'}
          </button>
          <button className="button secondary" type="button" onClick={onClose}>
            إلغاء
          </button>
        </div>
      </form>
    </Modal>
  );
}
