import { useState } from 'react';
import type { FormEvent } from 'react';
import { useApp } from '../state/AppContext';
import { Modal } from './ui';
import type { JournalEntry, Mood, EntryKind } from '../lib/types';
import { todayKey, kindLabels, moodLabels } from '../lib/dates';

export function EntryEditor({
  entry,
  skillId = '',
  onClose,
}: {
  entry?: JournalEntry;
  skillId?: string;
  onClose: () => void;
}) {
  const { data, addEntry, updateEntry, notify } = useApp();
  const [title, setTitle] = useState(entry?.title ?? '');
  const [note, setNote] = useState(entry?.note ?? '');
  const [date, setDate] = useState(entry?.date ?? todayKey());
  const [minutes, setMinutes] = useState(entry?.minutes ?? 30);
  const [skill, setSkill] = useState(entry?.skillId ?? skillId);
  const [kind, setKind] = useState<EntryKind>(entry?.kind ?? 'learning');
  const [mood, setMood] = useState<Mood>(entry?.mood ?? 'good');
  const [error, setError] = useState('');
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!title.trim()) {
      setError('اكتب عنواناً للنشاط قبل الحفظ.');
      return;
    }
    if (!date || date > todayKey() || !Number.isInteger(minutes) || minutes < 0 || minutes > 1440) {
      setError('تحقّق من التاريخ ومدة النشاط.');
      return;
    }
    const input = {
      title: title.trim(),
      note: note.trim(),
      date,
      minutes,
      skillId: skill,
      kind,
      mood,
    };
    if (entry) {
      updateEntry(entry.id, input);
      notify('تم تحديث النشاط');
    } else addEntry(input);
    onClose();
  };
  return (
    <Modal title={entry ? 'تعديل النشاط' : 'سجّل خطوة جديدة'} onClose={onClose}>
      <p className="form-description">كل تعلّم، عمل، أو فكرة تستحق مكاناً في رحلتك.</p>
      <form onSubmit={submit}>
        <div className="form-grid">
          <label className="form-field full">
            عنوان النشاط
            <input
              required
              maxLength={160}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="شنو أنجزت اليوم؟"
              autoFocus
            />
          </label>
          <label className="form-field">
            التاريخ
            <input
              required
              type="date"
              max={todayKey()}
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </label>
          <label className="form-field">
            الوقت بالدقائق
            <input
              type="number"
              required
              min="0"
              max="1440"
              step="1"
              value={minutes}
              onChange={(e) => setMinutes(Number(e.target.value))}
            />
          </label>
          <label className="form-field">
            نوع النشاط
            <select value={kind} onChange={(e) => setKind(e.target.value as EntryKind)}>
              {Object.entries(kindLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label className="form-field">
            المهارة المرتبطة
            <select value={skill} onChange={(e) => setSkill(e.target.value)}>
              <option value="">نشاط عام</option>
              {data.skills.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          <label className="form-field full">
            ملاحظاتك
            <textarea
              rows={3}
              maxLength={5000}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="شنو تعلّمت؟ شنو صار أفضل؟ احتفظ بأفكارك هنا..."
            />
          </label>
          <fieldset className="mood-field full">
            <legend>كيف كان شعورك؟</legend>
            <div className="mood-options">
              {Object.entries(moodLabels).map(([value, label], i) => (
                <button
                  className={`mood-option ${mood === value ? 'selected' : ''}`}
                  type="button"
                  key={value}
                  onClick={() => setMood(value as Mood)}
                  aria-pressed={mood === value}
                >
                  <span>{['☀️', '🌿', '☁️', '🌧️'][i]}</span>
                  {label}
                </button>
              ))}
            </div>
          </fieldset>
        </div>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <div className="form-actions">
          <button className="button primary" type="submit">
            {entry ? 'حفظ التعديلات' : 'حفظ النشاط'}
          </button>
          <button className="button secondary" type="button" onClick={onClose}>
            إلغاء
          </button>
        </div>
      </form>
    </Modal>
  );
}
