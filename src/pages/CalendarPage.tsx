import { useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Pencil,
  Plus,
  Trash2,
} from 'lucide-react';
import {
  AddButton,
  Card,
  ConfirmDialog,
  EmptyState,
  Modal,
  PageHeader,
  TextLink,
} from '../components/ui';
import {
  addDays,
  dateKey,
  formatDate,
  formatMinutes,
  kindLabels,
  monthLabel,
  parseDate,
  shortDays,
  todayKey,
} from '../lib/dates';
import type { CalendarEvent, EntryKind, NewEvent } from '../lib/types';
import { useApp } from '../state/AppContext';

type CalendarView = 'month' | 'week' | 'year';
const calendarWeekdays = [...shortDays.slice(1), shortDays[0]];

/** Dates are stored as local YYYY-MM-DD keys; calendar navigation never relies on UTC conversion. */
function monthDays(year: number, month: number): Array<string | null> {
  const first = new Date(year, month, 1, 12);
  const count = new Date(year, month + 1, 0, 12).getDate();
  return [
    ...Array<string | null>((first.getDay() + 6) % 7).fill(null),
    ...Array.from({ length: count }, (_, index) => dateKey(new Date(year, month, index + 1, 12))),
  ];
}

function EventEditor({
  event,
  initialDate,
  onClose,
}: {
  event: CalendarEvent | null;
  initialDate: string;
  onClose: () => void;
}) {
  const { data, addEvent, updateEvent, notify } = useApp();
  const [values, setValues] = useState<NewEvent>(() =>
    event
      ? {
          title: event.title,
          date: event.date,
          startTime: event.startTime,
          durationMinutes: event.durationMinutes,
          kind: event.kind,
          skillId: event.skillId,
          note: event.note,
        }
      : {
          title: '',
          date: initialDate,
          startTime: '09:00',
          durationMinutes: 60,
          kind: 'learning',
          skillId: '',
          note: '',
        },
  );
  const [error, setError] = useState('');
  const setField = <K extends keyof NewEvent>(field: K, value: NewEvent[K]) =>
    setValues((previous) => ({ ...previous, [field]: value }));
  function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!values.title.trim()) {
      setError('اكتب عنوانًا واضحًا للموعد.');
      return;
    }
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(values.date) ||
      !Number.isFinite(parseDate(values.date).getTime()) ||
      dateKey(parseDate(values.date)) !== values.date
    ) {
      setError('اختر تاريخًا صحيحًا للموعد.');
      return;
    }
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(values.startTime)) {
      setError('اختر وقتًا صحيحًا للموعد.');
      return;
    }
    if (
      !Number.isInteger(values.durationMinutes) ||
      values.durationMinutes < 1 ||
      values.durationMinutes > 1440
    ) {
      setError('مدة الموعد يجب أن تكون بين دقيقة و1440 دقيقة.');
      return;
    }
    const clean = { ...values, title: values.title.trim(), note: values.note.trim() };
    if (event) {
      updateEvent(event.id, clean);
      notify('تم تحديث الموعد');
    } else addEvent(clean);
    onClose();
  }
  return (
    <Modal title={event ? 'تعديل الموعد' : 'موعد جديد'} onClose={onClose}>
      <form onSubmit={save} className="event-form">
        <div className="form-grid">
          <label className="form-field full-width">
            <span>عنوان الموعد</span>
            <input
              required
              maxLength={160}
              value={values.title}
              onChange={(e) => setField('title', e.target.value)}
              placeholder="مثل: جلسة تعلّم أو موعد شخصي"
            />
          </label>
          <label className="form-field">
            <span>التاريخ</span>
            <input
              required
              type="date"
              value={values.date}
              onChange={(e) => setField('date', e.target.value)}
            />
          </label>
          <label className="form-field">
            <span>وقت البداية</span>
            <input
              required
              type="time"
              value={values.startTime}
              onChange={(e) => setField('startTime', e.target.value)}
            />
          </label>
          <label className="form-field">
            <span>المدة بالدقائق</span>
            <input
              required
              type="number"
              min="1"
              max="1440"
              step="1"
              value={values.durationMinutes}
              onChange={(e) => setField('durationMinutes', Number(e.target.value))}
            />
          </label>
          <label className="form-field">
            <span>نوع الموعد</span>
            <select
              value={values.kind}
              onChange={(e) => setField('kind', e.target.value as EntryKind)}
            >
              {Object.entries(kindLabels).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label className="form-field full-width">
            <span>المهارة المرتبطة</span>
            <select value={values.skillId} onChange={(e) => setField('skillId', e.target.value)}>
              <option value="">بدون مهارة</option>
              {data.skills.map((skill) => (
                <option key={skill.id} value={skill.id}>
                  {skill.name}
                </option>
              ))}
            </select>
          </label>
          <label className="form-field full-width">
            <span>
              ملاحظات <small>اختياري</small>
            </span>
            <textarea
              rows={3}
              maxLength={3000}
              value={values.note}
              onChange={(e) => setField('note', e.target.value)}
              placeholder="الهدف من الموعد أو التفاصيل التي تحتاجها"
            />
          </label>
        </div>
        <p className="form-hint">الموعد ينظّم وقتك. سجّل الوقت الفعلي في اليوميات بعد إنجازه.</p>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <div className="form-actions">
          <button type="submit" className="button primary">
            {event ? 'حفظ التعديلات' : 'إضافة الموعد'}
          </button>
          <button type="button" className="button secondary" onClick={onClose}>
            إلغاء
          </button>
        </div>
      </form>
    </Modal>
  );
}

export default function CalendarPage() {
  const { data, setPage, updateTask, notify, deleteEvent, selectedItem, clearSelectedItem } =
    useApp();
  const today = todayKey();
  const [view, setView] = useState<CalendarView>('month');
  const [anchor, setAnchor] = useState(today);
  const [selectedDate, setSelectedDate] = useState(today);
  const [editor, setEditor] = useState<{ event: CalendarEvent | null } | null>(null);
  const [deleting, setDeleting] = useState<CalendarEvent | null>(null);
  useEffect(() => {
    if (selectedItem?.page !== 'calendar') return;
    const event = data.events.find((item) => item.id === selectedItem.id);
    if (event) {
      setAnchor(event.date);
      setSelectedDate(event.date);
      setView('month');
    }
    clearSelectedItem();
  }, [selectedItem, data.events, clearSelectedItem]);
  const current = parseDate(anchor);
  const year = current.getFullYear();
  const month = current.getMonth();
  const weekStart = addDays(anchor, -((current.getDay() + 6) % 7));
  const dateItems = useMemo(() => {
    const map = new Map<
      string,
      { tasks: typeof data.tasks; events: typeof data.events; entries: typeof data.entries }
    >();
    const get = (key: string) => {
      if (!map.has(key)) map.set(key, { tasks: [], events: [], entries: [] });
      return map.get(key)!;
    };
    data.tasks.forEach((task) => {
      if (task.dueDate) get(task.dueDate).tasks.push(task);
    });
    data.events.forEach((event) => get(event.date).events.push(event));
    data.entries.forEach((entry) => get(entry.date).entries.push(entry));
    map.forEach((items) => items.events.sort((a, b) => a.startTime.localeCompare(b.startTime)));
    return map;
  }, [data.tasks, data.events, data.entries]);
  const selectedItems = dateItems.get(selectedDate) ?? { tasks: [], events: [], entries: [] };
  const rangeStart =
    view === 'year'
      ? `${year}-01-01`
      : view === 'month'
        ? dateKey(new Date(year, month, 1, 12))
        : weekStart;
  const rangeEnd =
    view === 'year'
      ? `${year}-12-31`
      : view === 'month'
        ? dateKey(new Date(year, month + 1, 0, 12))
        : addDays(weekStart, 6);
  const scheduledTasks = data.tasks.filter(
    (task) => task.dueDate >= rangeStart && task.dueDate <= rangeEnd,
  ).length;
  const scheduledEvents = data.events.filter(
    (event) => event.date >= rangeStart && event.date <= rangeEnd,
  ).length;
  const visibleDays =
    view === 'week'
      ? Array.from({ length: 7 }, (_, index) => addDays(weekStart, index))
      : (() => {
          const first = dateKey(new Date(year, month, 1, 12));
          const weekday = (parseDate(first).getDay() + 6) % 7;
          const monthLength = new Date(year, month + 1, 0, 12).getDate();
          const total = Math.ceil((weekday + monthLength) / 7) * 7;
          return Array.from({ length: total }, (_, index) => addDays(first, index - weekday));
        })();
  function navigate(direction: number) {
    const next =
      view === 'year'
        ? dateKey(new Date(year + direction, month, 1, 12))
        : view === 'month'
          ? dateKey(new Date(year, month + direction, 1, 12))
          : addDays(anchor, direction * 7);
    setAnchor(next);
    setSelectedDate(next);
  }
  function selectDay(key: string, openMonth = false) {
    setSelectedDate(key);
    if (openMonth || (view === 'month' && key.slice(0, 7) !== anchor.slice(0, 7))) {
      setAnchor(key);
      setView('month');
    }
  }
  const periodLabel =
    view === 'year'
      ? String(year)
      : view === 'week'
        ? `${formatDate(weekStart)} – ${formatDate(addDays(weekStart, 6), { day: 'numeric', month: 'long', year: 'numeric' })}`
        : monthLabel(current);
  const ariaDay = (key: string) => {
    const items = dateItems.get(key);
    return `${formatDate(key, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}، ${items?.tasks.length ?? 0} مهام، ${items?.events.length ?? 0} مواعيد، ${items?.entries.length ?? 0} أنشطة مسجلة`;
  };
  return (
    <>
      <PageHeader
        eyebrow="وقتك، بصورة أوضح"
        title="التقويم"
        description="رتّب أيامك وشاهد مهامك ومواعيدك، من اليوم إلى السنة كاملة."
        action={<AddButton onClick={() => setEditor({ event: null })}>موعد جديد</AddButton>}
      />
      <div className="calendar-layout">
        <Card className="calendar-card">
          <div className="calendar-toolbar">
            <div className="calendar-navigation">
              <button
                className="icon-button"
                aria-label="الفترة السابقة"
                onClick={() => navigate(-1)}
              >
                <ChevronRight size={19} />
              </button>
              <h2>{periodLabel}</h2>
              <button
                className="icon-button"
                aria-label="الفترة التالية"
                onClick={() => navigate(1)}
              >
                <ChevronLeft size={19} />
              </button>
              <button
                className="button secondary small"
                onClick={() => {
                  setAnchor(today);
                  setSelectedDate(today);
                }}
              >
                اليوم
              </button>
            </div>
            <div className="segmented-control" aria-label="طريقة عرض التقويم">
              {(
                [
                  ['month', 'شهر'],
                  ['week', 'أسبوع'],
                  ['year', 'سنة'],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  aria-pressed={view === value}
                  className={view === value ? 'active' : ''}
                  onClick={() => setView(value)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div className="calendar-summary">
            <span>
              <span className="calendar-key task" />
              {scheduledTasks} مهمة
            </span>
            <span>
              <span className="calendar-key event" />
              {scheduledEvents} موعد
            </span>
            <span>
              <span className="calendar-key entry" />
              نشاط مسجّل
            </span>
          </div>
          {view === 'year' ? (
            <div className="year-grid">
              {Array.from({ length: 12 }, (_, monthIndex) => {
                const days = monthDays(year, monthIndex);
                const prefix = `${year}-${String(monthIndex + 1).padStart(2, '0')}`;
                const taskCount = data.tasks.filter((task) =>
                  task.dueDate.startsWith(prefix),
                ).length;
                const eventCount = data.events.filter((event) =>
                  event.date.startsWith(prefix),
                ).length;
                return (
                  <div className="mini-month" key={monthIndex}>
                    <button
                      className="mini-month-heading"
                      onClick={() => {
                        setAnchor(`${prefix}-01`);
                        setSelectedDate(`${prefix}-01`);
                        setView('month');
                      }}
                    >
                      <strong>
                        {new Date(year, monthIndex, 1).toLocaleDateString('ar-IQ', {
                          month: 'long',
                        })}
                      </strong>
                      <ChevronLeft size={14} />
                    </button>
                    <div className="mini-calendar">
                      {calendarWeekdays.map((day) => (
                        <span className="mini-day-label" key={day} aria-hidden="true">
                          {day.slice(0, 1)}
                        </span>
                      ))}
                      {days.map((key, index) =>
                        key ? (
                          <button
                            key={key}
                            className={`mini-day ${dateItems.has(key) ? 'active' : ''} ${key === today ? 'today' : ''} ${key === selectedDate ? 'selected' : ''}`}
                            aria-label={ariaDay(key)}
                            aria-pressed={key === selectedDate}
                            onClick={() => selectDay(key, true)}
                          >
                            {parseDate(key).getDate()}
                            {dateItems.has(key) && <span className="mini-day-dot" />}
                          </button>
                        ) : (
                          <span className="mini-day blank" key={`blank-${index}`} />
                        ),
                      )}
                    </div>
                    <p className="mini-month-count">
                      {taskCount} مهمة <span>·</span> {eventCount} موعد
                    </p>
                  </div>
                );
              })}
            </div>
          ) : (
            <>
              <div className="calendar-weekdays">
                {calendarWeekdays.map((day) => (
                  <span key={day}>{day}</span>
                ))}
              </div>
              <div className={`calendar-grid ${view === 'week' ? 'week-view' : ''}`}>
                {visibleDays.map((key) => {
                  const items = dateItems.get(key) ?? { tasks: [], events: [], entries: [] };
                  const count = items.tasks.length + items.events.length;
                  const previews = [
                    ...items.events.map((event) => ({
                      id: event.id,
                      label: event.title,
                      kind: 'event',
                      time: event.startTime,
                    })),
                    ...items.tasks.map((task) => ({
                      id: task.id,
                      label: task.title,
                      kind: `task ${task.status === 'done' ? 'completed' : ''}`,
                      time: '',
                    })),
                  ];
                  const previewLimit = view === 'week' ? 4 : 2;
                  return (
                    <button
                      key={key}
                      className={`calendar-day ${key === today ? 'today' : ''} ${key === selectedDate ? 'selected' : ''} ${view === 'month' && key.slice(0, 7) !== anchor.slice(0, 7) ? 'outside' : ''}`}
                      aria-label={ariaDay(key)}
                      aria-pressed={key === selectedDate}
                      onClick={() => selectDay(key)}
                    >
                      <span className="day-number">
                        {parseDate(key).getDate()} {key === today && <small>اليوم</small>}
                      </span>
                      <span className="calendar-day-items">
                        {previews.slice(0, previewLimit).map((item) => (
                          <span key={item.id} className={`calendar-item ${item.kind}`}>
                            {view === 'week' && item.time && (
                              <span className="calendar-item-time">{item.time}</span>
                            )}
                            <span>{item.label}</span>
                          </span>
                        ))}
                        {count > previewLimit && (
                          <span className="calendar-more">+{count - previewLimit} أخرى</span>
                        )}
                      </span>
                      {items.entries.length > 0 && (
                        <span className="day-markers">
                          <span className="calendar-key entry" />
                          {formatMinutes(
                            items.entries.reduce((sum, entry) => sum + entry.minutes, 0),
                          )}{' '}
                          مسجّلة
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </Card>
        <Card
          className="calendar-day-detail"
          title={formatDate(selectedDate, { weekday: 'long', day: 'numeric', month: 'long' })}
          action={
            <span className="badge neutral">
              {selectedDate === today ? 'اليوم' : formatDate(selectedDate, { year: 'numeric' })}
            </span>
          }
        >
          <p className="day-detail-summary">
            {selectedItems.tasks.length} مهمة <span>·</span> {selectedItems.events.length} موعد{' '}
            <span>·</span>{' '}
            {formatMinutes(selectedItems.entries.reduce((sum, entry) => sum + entry.minutes, 0))}{' '}
            نشاط
          </p>
          {selectedItems.tasks.length +
            selectedItems.events.length +
            selectedItems.entries.length ===
          0 ? (
            <EmptyState
              title="مساحة ليوم جديد"
              description="ما عندك مهام أو مواعيد في هذا اليوم. خصّص وقتًا لشيء مهم."
              action={
                <button className="button primary small" onClick={() => setEditor({ event: null })}>
                  <Plus size={16} />
                  إضافة موعد
                </button>
              }
            />
          ) : (
            <div className="day-agenda">
              {selectedItems.events.length > 0 && (
                <div className="agenda-section">
                  <h3>
                    <CalendarDays size={16} />
                    المواعيد <span>{selectedItems.events.length}</span>
                  </h3>
                  {selectedItems.events.map((event) => {
                    const skill = data.skills.find((item) => item.id === event.skillId);
                    return (
                      <div className="agenda-item" key={event.id}>
                        <span className="agenda-event-dot" style={{ background: skill?.color }} />
                        <div className="agenda-item-body">
                          <strong>{event.title}</strong>
                          <p>
                            <Clock3 size={12} />
                            <span dir="ltr">{event.startTime}</span> <span>·</span>{' '}
                            {formatMinutes(event.durationMinutes)}
                          </p>
                          <span className="badge neutral">
                            {skill?.name ?? kindLabels[event.kind]}
                          </span>
                          {event.note && <p className="agenda-note">{event.note}</p>}
                        </div>
                        <div className="agenda-actions">
                          <button
                            className="icon-button"
                            aria-label={`تعديل ${event.title}`}
                            onClick={() => setEditor({ event })}
                          >
                            <Pencil size={15} />
                          </button>
                          <button
                            className="icon-button danger-icon"
                            aria-label={`حذف ${event.title}`}
                            onClick={() => setDeleting(event)}
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
              {selectedItems.tasks.length > 0 && (
                <div className="agenda-section">
                  <h3>
                    المهام <span>{selectedItems.tasks.length}</span>
                  </h3>
                  {selectedItems.tasks.map((task) => (
                    <label
                      className={`agenda-item agenda-task ${task.status === 'done' ? 'completed' : ''}`}
                      key={task.id}
                    >
                      <input
                        type="checkbox"
                        checked={task.status === 'done'}
                        aria-label={`إنجاز ${task.title}`}
                        onChange={(e) => {
                          updateTask(task.id, { status: e.target.checked ? 'done' : 'todo' });
                          notify(
                            e.target.checked
                              ? 'خطوة ممتازة، تم إنجاز المهمة'
                              : 'تمت إعادة المهمة إلى قائمة العمل',
                          );
                        }}
                      />
                      <span className="agenda-item-body">
                        <strong>{task.title}</strong>
                        <span className="agenda-task-meta">
                          {task.status === 'done'
                            ? 'مكتملة'
                            : task.status === 'in-progress'
                              ? 'قيد التنفيذ'
                              : 'لم تبدأ'}
                          {task.estimatedMinutes > 0 &&
                            ` · ${formatMinutes(task.estimatedMinutes)}`}
                        </span>
                      </span>
                    </label>
                  ))}
                </div>
              )}
              {selectedItems.entries.length > 0 && (
                <div className="agenda-section">
                  <h3>
                    النشاط المسجّل <span>{selectedItems.entries.length}</span>
                  </h3>
                  {selectedItems.entries.map((entry) => (
                    <div className="agenda-item" key={entry.id}>
                      <span className="agenda-entry-dot" />
                      <div className="agenda-item-body">
                        <strong>{entry.title}</strong>
                        <p>
                          {kindLabels[entry.kind]} <span>·</span> {formatMinutes(entry.minutes)}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
          <div className="day-detail-links">
            <TextLink onClick={() => setPage('tasks')}>إدارة المهام</TextLink>
            <TextLink onClick={() => setPage('journal')}>تسجيل نشاط</TextLink>
          </div>
        </Card>
      </div>
      {editor && (
        <EventEditor
          event={editor.event}
          initialDate={selectedDate}
          onClose={() => setEditor(null)}
        />
      )}
      {deleting && (
        <ConfirmDialog
          title="حذف الموعد؟"
          description={`سيتم حذف «${deleting.title}» من تقويمك. يمكنك إنشاء موعد جديد لاحقًا.`}
          onConfirm={() => deleteEvent(deleting.id)}
          onClose={() => setDeleting(null)}
        />
      )}
    </>
  );
}
