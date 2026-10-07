import { useLanguage } from '../state/LanguageContext';
import { useState } from 'react';
import type { FormEvent } from 'react';
import { Check } from 'lucide-react';
import type { NewSkill, Skill } from '../lib/types';
import { useApp } from '../state/AppContext';
import { Modal } from './ui';

const skillColors = ['#4c8a6c', '#9684bd', '#d1a35d', '#6a9eab', '#cf8474', '#6786ba'];

interface SkillEditorProps {
  skill?: Skill;
  onClose: () => void;
}

export function SkillEditor({ skill, onClose }: SkillEditorProps) {
  const { t } = useLanguage();
  const { addSkill, updateSkill, notify } = useApp();
  const [name, setName] = useState(skill?.name ?? '');
  const [category, setCategory] = useState(skill?.category ?? '');
  const [description, setDescription] = useState(skill?.description ?? '');
  const [color, setColor] = useState(skill?.color ?? skillColors[0]);
  const [targetHours, setTargetHours] = useState(skill ? String(skill.targetMinutes / 60) : '40');
  const [baselineHours, setBaselineHours] = useState(
    skill ? String(skill.baselineMinutes / 60) : '0',
  );
  const [weeklyHours, setWeeklyHours] = useState(
    skill ? String(skill.weeklyGoalMinutes / 60) : '3',
  );
  const [error, setError] = useState('');

  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!name.trim()) return setError('shell.skill.nameError');
    const target = Number(targetHours),
      baseline = Number(baselineHours),
      weekly = Number(weeklyHours);
    if (!targetHours || !Number.isFinite(target) || target < 0.25 || target > 10000) {
      return setError('shell.skill.goalError');
    }
    if (!baselineHours || !Number.isFinite(baseline) || baseline < 0 || baseline > 10000) {
      return setError('shell.skill.baselineError');
    }
    if (!weeklyHours || !Number.isFinite(weekly) || weekly < 0.25 || weekly > 168) {
      return setError('shell.skill.weeklyError');
    }
    const input: NewSkill = {
      name: name.trim(),
      category: category.trim() || t('shell.skill.personal'),
      color,
      description: description.trim(),
      targetMinutes: Math.round(target * 60),
      baselineMinutes: Math.round(baseline * 60),
      weeklyGoalMinutes: Math.round(weekly * 60),
    };
    if (skill) {
      updateSkill(skill.id, input);
      notify(t('shell.skill.updated'));
    } else {
      addSkill(input);
    }
    onClose();
  }

  return (
    <Modal title={skill ? t('shell.skill.edit') : t('shell.skill.new')} onClose={onClose}>
      <form onSubmit={save}>
        <div className="form-grid">
          <label className="form-field full-width">
            <span>
              {t('shell.skill.name')} <span aria-hidden="true">*</span>
            </span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('shell.skill.namePlaceholder')}
              required
              maxLength={100}
              autoFocus
            />
          </label>
          <label className="form-field full-width">
            <span>{t('shell.skill.category')}</span>
            <input
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              placeholder={t('shell.skill.categoryPlaceholder')}
              maxLength={60}
              list="skill-categories"
            />
            <datalist id="skill-categories">
              <option value={t('shell.skill.categoryProgramming')} />
              <option value={t('shell.skill.categoryDesign')} />
              <option value={t('shell.skill.categoryLanguages')} />
              <option value={t('shell.skill.categoryGrowth')} />
              <option value={t('shell.skill.categoryWork')} />
              <option value={t('shell.skill.categoryFitness')} />
            </datalist>
          </label>
          <label className="form-field full-width">
            <span>{t('shell.skill.reason')}</span>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              maxLength={2000}
              placeholder={t('shell.skill.reasonPlaceholder')}
            />
          </label>
          <label className="form-field">
            <span>{t('shell.skill.target')}</span>
            <input
              type="number"
              min={0.25}
              max={10000}
              step="any"
              value={targetHours}
              onChange={(e) => setTargetHours(e.target.value)}
              required
            />
          </label>
          <label className="form-field">
            <span>{t('shell.skill.weekly')}</span>
            <input
              type="number"
              min={0.25}
              max={168}
              step="any"
              value={weeklyHours}
              onChange={(e) => setWeeklyHours(e.target.value)}
              required
            />
          </label>
          <label className="form-field full-width">
            <span>{t('shell.skill.baseline')}</span>
            <input
              type="number"
              min={0}
              max={10000}
              step="any"
              value={baselineHours}
              onChange={(e) => setBaselineHours(e.target.value)}
              required
            />
            <small>{t('shell.skill.baselineHint')}</small>
          </label>
          <div className="form-field full-width">
            <span>{t('shell.skill.color')}</span>
            <div className="color-options">
              {skillColors.map((option, index) => (
                <button
                  key={option}
                  type="button"
                  className={`color-swatch ${color === option ? 'selected' : ''}`}
                  style={{ background: option }}
                  onClick={() => setColor(option)}
                  aria-label={t('shell.skill.colorNumber', { number: index + 1 })}
                  aria-pressed={color === option}
                >
                  {color === option && <Check size={17} />}
                </button>
              ))}
              <label className="color-picker">
                <input
                  type="color"
                  value={color}
                  onChange={(e) => setColor(e.target.value)}
                  aria-label={t('shell.skill.customColor')}
                />
                <span>{t('shell.skill.otherColor')}</span>
              </label>
            </div>
          </div>
        </div>
        {error && (
          <p className="form-error" role="alert">
            {t(error)}
          </p>
        )}
        <div className="form-actions">
          <button className="button primary" type="submit">
            <Check size={17} />
            {skill ? t('shell.editor.saveChanges') : t('shell.skill.add')}
          </button>
          <button className="button secondary" type="button" onClick={onClose}>
            {t('shell.editor.cancel')}
          </button>
        </div>
      </form>
    </Modal>
  );
}
