import { useLanguage } from '../state/LanguageContext';
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
  const { t } = useLanguage();
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
    if (!title) return setError('shell.task.nameError');
    if (!draft.dueDate) return setError('shell.task.dateError');
    if (
      !Number.isInteger(draft.estimatedMinutes) ||
      draft.estimatedMinutes < 1 ||
      draft.estimatedMinutes > 10080
    ) {
      return setError('shell.task.durationError');
    }
    const next = { ...draft, title, description: draft.description.trim() };
    if (task) {
      updateTask(task.id, next);
      notify(t('shell.task.updated'));
    } else {
      addTask(next);
    }
    onClose();
  }

  return (
    <Modal title={task ? t('shell.task.edit') : t('shell.task.new')} onClose={onClose}>
      <form onSubmit={save}>
        <div className="form-grid">
          <label className="form-field full-width">
            <span>
              {t('shell.task.name')} <span aria-hidden="true">*</span>
            </span>
            <input
              value={draft.title}
              onChange={(e) => setDraft({ ...draft, title: e.target.value })}
              placeholder={t('shell.task.placeholder')}
              maxLength={160}
              required
              autoFocus
            />
          </label>
          <label className="form-field full-width">
            <span>{t('shell.task.details')}</span>
            <textarea
              value={draft.description}
              onChange={(e) => setDraft({ ...draft, description: e.target.value })}
              placeholder={t('shell.task.detailsPlaceholder')}
              rows={3}
              maxLength={4000}
            />
          </label>
          <label className="form-field">
            <span>
              <CalendarDays size={14} /> {t('shell.task.due')} *
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
            <span>{t('shell.task.duration')}</span>
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
            <span>{t('shell.task.priority')}</span>
            <select
              value={draft.priority}
              onChange={(e) =>
                setDraft({ ...draft, priority: e.target.value as NewTask['priority'] })
              }
            >
              <option value="high">{t('shell.task.high')}</option>
              <option value="medium">{t('shell.priority.medium')}</option>
              <option value="low">{t('shell.priority.low')}</option>
            </select>
          </label>
          <label className="form-field">
            <span>{t('shell.task.status')}</span>
            <select
              value={draft.status}
              onChange={(e) => setDraft({ ...draft, status: e.target.value as NewTask['status'] })}
            >
              <option value="todo">{t('shell.task.todo')}</option>
              <option value="in-progress">{t('shell.task.inProgress')}</option>
              <option value="done">{t('shell.task.done')}</option>
            </select>
          </label>
          <label className="form-field full-width">
            <span>{t('shell.editor.skill')}</span>
            <select
              value={draft.skillId}
              onChange={(e) => setDraft({ ...draft, skillId: e.target.value })}
            >
              <option value="">{t('shell.task.general')}</option>
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
            {t(error)}
          </p>
        )}
        <div className="form-actions">
          <button className="button primary" type="submit">
            <Check size={17} />
            {task ? t('shell.editor.saveChanges') : t('shell.task.add')}
          </button>
          <button className="button secondary" type="button" onClick={onClose}>
            {t('shell.editor.cancel')}
          </button>
        </div>
      </form>
    </Modal>
  );
}
