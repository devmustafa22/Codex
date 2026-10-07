import { useLanguage } from '../state/LanguageContext';
import { useEffect, useRef, useState } from 'react';
import { Play, Pause, RotateCcw, Target, ArrowUpLeft, Check } from 'lucide-react';
import { useApp } from '../state/AppContext';
import { todayKey } from '../lib/dates';

export function FocusTimer() {
  const { t } = useLanguage();
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
      notify(t('shell.focus.minimum'));
      return;
    }
    const selected = data.tasks.find((t) => t.id === task);
    addEntry({
      title: selected
        ? t('shell.focus.sessionTask', { title: selected.title })
        : t('shell.focus.session'),
      note: t('shell.focus.loggedNote'),
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
          {t('shell.focus.title')}
        </span>
        <ArrowUpLeft size={17} />
      </div>
      <p>{t('shell.focus.subtitle')}</p>
      <div
        className="timer-value"
        role="timer"
        aria-label={t('shell.focus.remaining', {
          minutes: Math.floor(remaining / 60),
          seconds: remaining % 60,
        })}
        dir="ltr"
      >
        {String(Math.floor(remaining / 60)).padStart(2, '0')}
        <span>:</span>
        {String(remaining % 60).padStart(2, '0')}
      </div>
      <div className="focus-options">
        <select
          disabled={running || elapsed > 0}
          aria-label={t('shell.focus.duration')}
          value={duration}
          onChange={(e) => changeDuration(Number(e.target.value))}
        >
          {[15, 25, 45, 60, ...([15, 25, 45, 60].includes(duration) ? [] : [duration])].map((m) => (
            <option value={m} key={m}>
              {t('shell.focus.minutes', { count: m })}
            </option>
          ))}
        </select>
        <select
          disabled={running || elapsed > 0}
          aria-label={t('shell.focus.task')}
          value={task}
          onChange={(e) => setTask(e.target.value)}
        >
          <option value="">{t('shell.focus.free')}</option>
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
          aria-label={t('shell.focus.skill')}
          value={skill}
          onChange={(e) => setSkill(e.target.value)}
        >
          <option value="">{t('shell.focus.noSkill')}</option>
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
          aria-label={running ? t('shell.focus.pause') : t('shell.focus.start')}
        >
          {running ? (
            <Pause size={17} fill="currentColor" />
          ) : (
            <Play size={17} fill="currentColor" />
          )}
          {running
            ? t('shell.focus.break')
            : elapsed > 0
              ? t('shell.focus.resume')
              : t('shell.focus.start')}
        </button>
        <button className="timer-reset" aria-label={t('shell.focus.reset')} onClick={reset}>
          <RotateCcw size={16} />
        </button>
        {elapsed >= 60 && (
          <button
            className="timer-reset"
            title={t('shell.focus.finish')}
            aria-label={t('shell.focus.finish')}
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
          ? t('shell.focus.runningNote')
          : elapsed
            ? t('shell.focus.pausedNote')
            : t('shell.focus.readyNote')}
      </span>
    </section>
  );
}
