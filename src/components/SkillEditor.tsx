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
    if (!name.trim()) return setError('اكتب اسم المهارة قبل الحفظ.');
    const target = Number(targetHours),
      baseline = Number(baselineHours),
      weekly = Number(weeklyHours);
    if (!targetHours || !Number.isFinite(target) || target < 0.25 || target > 10000) {
      return setError('حدد هدفًا بين 0.25 و 10000 ساعة.');
    }
    if (!baselineHours || !Number.isFinite(baseline) || baseline < 0 || baseline > 10000) {
      return setError('الوقت السابق لازم يكون بين 0 و 10000 ساعة.');
    }
    if (!weeklyHours || !Number.isFinite(weekly) || weekly < 0.25 || weekly > 168) {
      return setError('الهدف الأسبوعي لازم يكون بين 0.25 و 168 ساعة.');
    }
    const input: NewSkill = {
      name: name.trim(),
      category: category.trim() || 'مهارة شخصية',
      color,
      description: description.trim(),
      targetMinutes: Math.round(target * 60),
      baselineMinutes: Math.round(baseline * 60),
      weeklyGoalMinutes: Math.round(weekly * 60),
    };
    if (skill) {
      updateSkill(skill.id, input);
      notify('تم حفظ تعديلات المهارة');
    } else {
      addSkill(input);
    }
    onClose();
  }

  return (
    <Modal title={skill ? 'تعديل المهارة' : 'ابدأ مهارة جديدة'} onClose={onClose}>
      <form onSubmit={save}>
        <div className="form-grid">
          <label className="form-field full-width">
            <span>
              اسم المهارة <span aria-hidden="true">*</span>
            </span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="مثلاً: تطوير الويب، التصوير، الإنجليزية"
              required
              maxLength={100}
              autoFocus
            />
          </label>
          <label className="form-field full-width">
            <span>المجال</span>
            <input
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              placeholder="برمجة، تصميم، لغات، تطوير ذاتي…"
              maxLength={60}
              list="skill-categories"
            />
            <datalist id="skill-categories">
              <option value="برمجة" />
              <option value="تصميم" />
              <option value="لغات" />
              <option value="تطوير ذاتي" />
              <option value="عمل" />
              <option value="صحة ولياقة" />
            </datalist>
          </label>
          <label className="form-field full-width">
            <span>ليش تريد تتعلّمها؟</span>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              maxLength={2000}
              placeholder="خلي هدفك واضح حتى ترجع له كل ما تحتاج دفعة."
            />
          </label>
          <label className="form-field">
            <span>هدف التعلّم الكلي (ساعات)</span>
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
            <span>الهدف الأسبوعي (ساعات)</span>
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
            <span>وقت تعلّم سابق (ساعات)</span>
            <input
              type="number"
              min={0}
              max={10000}
              step="any"
              value={baselineHours}
              onChange={(e) => setBaselineHours(e.target.value)}
              required
            />
            <small>اختياري: وقتك قبل استخدام مدار. سجلاتك الجديدة تنضاف له تلقائيًا.</small>
          </label>
          <div className="form-field full-width">
            <span>لون المهارة</span>
            <div className="color-options">
              {skillColors.map((option, index) => (
                <button
                  key={option}
                  type="button"
                  className={`color-swatch ${color === option ? 'selected' : ''}`}
                  style={{ background: option }}
                  onClick={() => setColor(option)}
                  aria-label={`لون المهارة ${index + 1}`}
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
                  aria-label="اختر لونًا مخصصًا"
                />
                <span>لون آخر</span>
              </label>
            </div>
          </div>
        </div>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <div className="form-actions">
          <button className="button primary" type="submit">
            <Check size={17} />
            {skill ? 'حفظ التعديلات' : 'إضافة المهارة'}
          </button>
          <button className="button secondary" type="button" onClick={onClose}>
            إلغاء
          </button>
        </div>
      </form>
    </Modal>
  );
}
