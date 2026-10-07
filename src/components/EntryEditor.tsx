import { useLanguage } from '../state/LanguageContext';
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
  const { t } = useLanguage();
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
      setError('shell.entry.titleError');
      return;
    }
    if (!date || date > todayKey() || !Number.isInteger(minutes) || minutes < 0 || minutes > 1440) {
      setError('shell.entry.detailsError');
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
      notify(t('shell.entry.updated'));
    } else addEntry(input);
    onClose();
  };
  return (
    <Modal title={entry ? t('shell.entry.edit') : t('shell.entry.new')} onClose={onClose}>
      <p className="form-description">{t('shell.entry.description')}</p>
      <form onSubmit={submit}>
        <div className="form-grid">
          <label className="form-field full">
            {t('shell.entry.title')}
            <input
              required
              maxLength={160}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t('shell.entry.titlePlaceholder')}
              autoFocus
            />
          </label>
          <label className="form-field">
            {t('shell.editor.date')}
            <input
              required
              type="date"
              max={todayKey()}
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </label>
          <label className="form-field">
            {t('shell.entry.duration')}
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
            {t('shell.entry.kind')}
            <select value={kind} onChange={(e) => setKind(e.target.value as EntryKind)}>
              {Object.entries(kindLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {t(label)}
                </option>
              ))}
            </select>
          </label>
          <label className="form-field">
            {t('shell.editor.skill')}
            <select value={skill} onChange={(e) => setSkill(e.target.value)}>
              <option value="">{t('shell.entry.general')}</option>
              {data.skills.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          <label className="form-field full">
            {t('shell.entry.notes')}
            <textarea
              rows={3}
              maxLength={5000}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={t('shell.entry.notesPlaceholder')}
            />
          </label>
          <fieldset className="mood-field full">
            <legend>{t('shell.entry.mood')}</legend>
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
                  {t(label)}
                </button>
              ))}
            </div>
          </fieldset>
        </div>
        {error && (
          <p className="form-error" role="alert">
            {t(error)}
          </p>
        )}
        <div className="form-actions">
          <button className="button primary" type="submit">
            {entry ? t('shell.editor.saveChanges') : t('shell.entry.save')}
          </button>
          <button className="button secondary" type="button" onClick={onClose}>
            {t('shell.editor.cancel')}
          </button>
        </div>
      </form>
    </Modal>
  );
}
