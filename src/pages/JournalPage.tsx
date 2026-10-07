import { useEffect, useMemo, useState } from 'react';
import { BookOpen, Clock3, Pencil, Search, Trash2, Sparkles, Plus } from 'lucide-react';
import { useApp } from '../state/AppContext';
import { PageHeader, AddButton, Card, EmptyState, ConfirmDialog } from '../components/ui';
import { EntryEditor } from '../components/EntryEditor';
import {
  formatDate,
  formatMinutes,
  kindLabels,
  moodLabels,
  todayKey,
  weekKeys,
} from '../lib/dates';
import type { JournalEntry } from '../lib/types';

export default function JournalPage() {
  const { data, deleteEntry, selectedItem, clearSelectedItem } = useApp();
  const [editing, setEditing] = useState<JournalEntry | 'new' | null>(null);
  const [deleting, setDeleting] = useState<JournalEntry | null>(null);
  const [search, setSearch] = useState('');
  const [period, setPeriod] = useState('all');
  const [skill, setSkill] = useState('all');
  useEffect(() => {
    if (selectedItem?.page !== 'journal') return;
    const entry = data.entries.find((item) => item.id === selectedItem.id);
    if (entry) setEditing(entry);
    clearSelectedItem();
  }, [selectedItem, data.entries, clearSelectedItem]);
  const filtered = useMemo(
    () =>
      data.entries
        .filter(
          (e) =>
            (e.title + e.note).toLowerCase().includes(search.toLowerCase()) &&
            (skill === 'all' || e.skillId === skill) &&
            (period === 'all' ||
              (period === 'today' ? e.date === todayKey() : weekKeys().includes(e.date))),
        )
        .sort((a, b) => b.date.localeCompare(a.date)),
    [data.entries, search, period, skill],
  );
  const groups = [...new Set(filtered.map((e) => e.date))];
  const total = data.entries.reduce((sum, e) => sum + e.minutes, 0);
  return (
    <>
      <PageHeader
        eyebrow="الأثر الذي تتركه كل يوم"
        title="سجلّ رحلتك"
        description="لأن الإنجازات الصغيرة تستحق أن تُحفظ. دوّن، تعلّم، وتذكّر كيف وصلت."
        action={<AddButton onClick={() => setEditing('new')}>تسجيل نشاط</AddButton>}
      />
      <div className="journal-intro">
        <div className="journal-quote">
          <Sparkles size={23} />
          <div>
            <h2>لا تحتاج إلى يوم مثالي، فقط خطوة صغيرة.</h2>
            <p>هذا سجلّك الشخصي؛ مساحة للأفكار، الإنجازات، وحتى الأيام الصعبة.</p>
          </div>
          <span className="quote-orbit" aria-hidden="true" />
        </div>
        <div className="journal-stat">
          <BookOpen size={21} />
          <strong>{data.entries.length}</strong>
          <span>نشاط موثّق</span>
        </div>
        <div className="journal-stat">
          <Clock3 size={21} />
          <strong>{formatMinutes(total)}</strong>
          <span>وقت استثمرته بنفسك</span>
        </div>
      </div>
      <div className="filter-bar">
        <label className="search-field">
          <Search size={17} />
          <input
            aria-label="البحث في السجل"
            placeholder="ابحث في ذكرياتك وإنجازاتك..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
        <select aria-label="فترة السجل" value={period} onChange={(e) => setPeriod(e.target.value)}>
          <option value="all">كل الأوقات</option>
          <option value="today">اليوم</option>
          <option value="week">هذا الأسبوع</option>
        </select>
        <select aria-label="مهارة السجل" value={skill} onChange={(e) => setSkill(e.target.value)}>
          <option value="all">كل المهارات</option>
          {data.skills.map((s) => (
            <option value={s.id} key={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        <span className="filter-count">{filtered.length} نشاط</span>
      </div>
      {groups.length === 0 ? (
        <Card>
          <EmptyState
            title="صفحة جديدة تنتظر قصتك"
            description="سجّل أول نشاط، أو غيّر الفلاتر لعرض سجلاتك."
            action={<AddButton onClick={() => setEditing('new')}>أضف نشاطاً</AddButton>}
          />
        </Card>
      ) : (
        <div className="journal-timeline">
          {groups.map((date) => (
            <section className="journal-day" key={date}>
              <div className="journal-date">
                <span className="timeline-dot" />
                <h2>{date === todayKey() ? 'اليوم' : formatDate(date, { weekday: 'long' })}</h2>
                <span>{formatDate(date)}</span>
                <span className="badge">
                  {formatMinutes(
                    filtered.filter((e) => e.date === date).reduce((sum, e) => sum + e.minutes, 0),
                  )}
                </span>
              </div>
              <div className="journal-entries">
                {filtered
                  .filter((e) => e.date === date)
                  .map((entry) => {
                    const s = data.skills.find((s) => s.id === entry.skillId);
                    return (
                      <article className="card journal-entry" key={entry.id}>
                        <div
                          className="journal-entry-symbol"
                          style={{ background: s ? `${s.color}18` : undefined, color: s?.color }}
                        >
                          <BookOpen size={20} />
                        </div>
                        <div className="journal-entry-content">
                          <div className="journal-entry-top">
                            <span className="entry-kind">{kindLabels[entry.kind]}</span>
                            <div className="journal-entry-actions">
                              <button
                                className="icon-button"
                                title="تعديل النشاط"
                                aria-label={`تعديل ${entry.title}`}
                                onClick={() => setEditing(entry)}
                              >
                                <Pencil size={15} />
                              </button>
                              <button
                                className="icon-button"
                                title="حذف النشاط"
                                aria-label={`حذف ${entry.title}`}
                                onClick={() => setDeleting(entry)}
                              >
                                <Trash2 size={15} />
                              </button>
                            </div>
                          </div>
                          <h3>{entry.title}</h3>
                          {entry.note && <p>{entry.note}</p>}
                          <div className="journal-entry-meta">
                            <span>
                              <Clock3 size={13} />
                              {formatMinutes(entry.minutes)}
                            </span>
                            {s && (
                              <span>
                                <i style={{ background: s.color }} />
                                {s.name}
                              </span>
                            )}
                            <span>{moodLabels[entry.mood]}</span>
                          </div>
                        </div>
                      </article>
                    );
                  })}
              </div>
            </section>
          ))}
        </div>
      )}
      <button
        className="floating-add"
        title="تسجيل نشاط"
        aria-label="تسجيل نشاط"
        onClick={() => setEditing('new')}
      >
        <Plus size={23} />
      </button>
      {editing && (
        <EntryEditor
          entry={editing === 'new' ? undefined : editing}
          onClose={() => setEditing(null)}
        />
      )}{' '}
      {deleting && (
        <ConfirmDialog
          title="حذف النشاط؟"
          description="سيُحذف هذا النشاط ووقته من إحصائياتك وتقدّم المهارة المرتبطة."
          onConfirm={() => deleteEntry(deleting.id)}
          onClose={() => setDeleting(null)}
        />
      )}
    </>
  );
}
