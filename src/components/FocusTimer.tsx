import { useEffect, useRef, useState } from 'react';
import { Play, Pause, RotateCcw, Target, ArrowUpLeft, Check } from 'lucide-react';
import { useApp } from '../state/AppContext';
import { todayKey } from '../lib/dates';

export function FocusTimer() {
  const { data, addEntry, notify } = useApp();
  const [duration, setDuration] = useState(data.profile.focusMinutes);
  const [remaining, setRemaining] = useState(duration * 60);
  const [running, setRunning] = useState(false);
  const [skill, setSkill] = useState('');
  const [task, setTask] = useState('');
  const deadline = useRef(0);
  const displayed = useRef(remaining);
  const saved = useRef(false);
  const pending = data.tasks.filter((t) => t.status !== 'done' || t.id === task);
  useEffect(() => {
    if (skill && !data.skills.some((s) => s.id === skill)) setSkill('');
    if (task && !data.tasks.some((t) => t.id === task)) setTask('');
  }, [data.skills, data.tasks, skill, task]);
  const previousPreference = useRef(data.profile.focusMinutes);
  useEffect(() => {
    if (previousPreference.current !== data.profile.focusMinutes) {
      previousPreference.current = data.profile.focusMinutes;
      if (!running && remaining === duration * 60) {
        setDuration(data.profile.focusMinutes);
        setRemaining(data.profile.focusMinutes * 60);
        displayed.current = data.profile.focusMinutes * 60;
      }
    }
  }, [data.profile.focusMinutes, running, remaining, duration]);
  const saveSession = (seconds: number) => {
    if (saved.current) return;
    if (seconds < 60) {
      notify('أكمل دقيقة واحدة على الأقل حتى تسجّل جلسة التركيز');
      return;
    }
    const selected = data.tasks.find((t) => t.id === task);
    addEntry({
      title: selected ? `جلسة تركيز: ${selected.title}` : 'جلسة تركيز',
      note: 'تم تسجيل الوقت من مؤقّت التركيز.',
      date: todayKey(),
      minutes: Math.floor(seconds / 60),
      skillId: data.skills.some((s) => s.id === (selected?.skillId || skill))
        ? selected?.skillId || skill
        : '',
      kind: 'focus',
      mood: 'good',
    });
    saved.current = true;
    setRunning(false);
    setRemaining(duration * 60);
    displayed.current = duration * 60;
  };
  const finishRef = useRef(saveSession);
  finishRef.current = saveSession;
  useEffect(() => {
    if (!running) return;
    const tick = () => {
      const value = Math.max(0, Math.ceil((deadline.current - Date.now()) / 1000));
      setRemaining(value);
      displayed.current = value;
      if (value === 0) {
        setRunning(false);
        finishRef.current(duration * 60);
      }
    };
    const timer = setInterval(tick, 300);
    tick();
    return () => clearInterval(timer);
  }, [running, duration]);
  const toggle = () => {
    if (running) {
      const value = Math.max(0, Math.ceil((deadline.current - Date.now()) / 1000));
      setRemaining(value);
      displayed.current = value;
      setRunning(false);
    } else {
      saved.current = false;
      deadline.current = Date.now() + remaining * 1000;
      setRunning(true);
    }
  };
  const reset = () => {
    setRunning(false);
    setRemaining(duration * 60);
    displayed.current = duration * 60;
    saved.current = false;
  };
  const changeDuration = (value: number) => {
    setDuration(value);
    setRemaining(value * 60);
    displayed.current = value * 60;
    saved.current = false;
  };
  const elapsed = duration * 60 - remaining;
  return (
    <section className="focus-card">
      <div className="focus-decoration" aria-hidden="true" />
      <div className="focus-heading">
        <span>
          <Target size={17} />
          مساحة التركيز
        </span>
        <ArrowUpLeft size={17} />
      </div>
      <p>شيء واحد. اهتمام كامل.</p>
      <div
        className="timer-value"
        role="timer"
        aria-label={`متبقي ${Math.floor(remaining / 60)} دقيقة و ${remaining % 60} ثانية`}
        dir="ltr"
      >
        {String(Math.floor(remaining / 60)).padStart(2, '0')}
        <span>:</span>
        {String(remaining % 60).padStart(2, '0')}
      </div>
      <div className="focus-options">
        <select
          disabled={running || elapsed > 0}
          aria-label="مدة جلسة التركيز"
          value={duration}
          onChange={(e) => changeDuration(Number(e.target.value))}
        >
          {[15, 25, 45, 60, ...([15, 25, 45, 60].includes(duration) ? [] : [duration])].map((m) => (
            <option value={m} key={m}>
              {m} دقيقة
            </option>
          ))}
        </select>
        <select
          disabled={running || elapsed > 0}
          aria-label="مهمة جلسة التركيز"
          value={task}
          onChange={(e) => setTask(e.target.value)}
        >
          <option value="">جلسة حرة</option>
          {pending.map((t) => (
            <option value={t.id} key={t.id}>
              {t.title}
            </option>
          ))}
        </select>
      </div>
      {!task && (
        <select
          className="focus-skill"
          disabled={running || elapsed > 0}
          aria-label="مهارة جلسة التركيز"
          value={skill}
          onChange={(e) => setSkill(e.target.value)}
        >
          <option value="">بدون مهارة مرتبطة</option>
          {data.skills.map((s) => (
            <option value={s.id} key={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      )}
      <div className="timer-controls">
        <button
          className="timer-play"
          onClick={toggle}
          aria-label={running ? 'إيقاف مؤقت' : 'ابدأ التركيز'}
        >
          {running ? (
            <Pause size={17} fill="currentColor" />
          ) : (
            <Play size={17} fill="currentColor" />
          )}
          {running ? 'استراحة' : elapsed > 0 ? 'متابعة' : 'ابدأ التركيز'}
        </button>
        <button className="timer-reset" aria-label="إعادة ضبط المؤقّت" onClick={reset}>
          <RotateCcw size={16} />
        </button>
        {elapsed >= 60 && (
          <button
            className="timer-reset"
            title="إنهاء وحفظ الجلسة"
            aria-label="إنهاء وحفظ الجلسة"
            onClick={() => {
              const left = running
                ? Math.max(0, Math.ceil((deadline.current - Date.now()) / 1000))
                : displayed.current;
              saveSession(duration * 60 - left);
            }}
          >
            <Check size={17} />
          </button>
        )}
      </div>
      <span className="focus-note">
        <span />
        {running
          ? 'وقت لك، بعيداً عن المشتتات'
          : elapsed
            ? 'وقت الجلسة يُحفظ عند الإنهاء'
            : 'يُسجّل الوقت تلقائياً عند انتهاء الجلسة'}
      </span>
    </section>
  );
}
