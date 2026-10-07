import { useLanguage } from '../state/LanguageContext';
import { useState } from 'react';
import { Search, ArrowUpLeft, ListTodo, Sprout, BookOpen, CalendarDays } from 'lucide-react';
import { useApp } from '../state/AppContext';
import { Modal, EmptyState } from './ui';
import type { PageId } from '../lib/types';

export function SearchDialog({ onClose }: { onClose: () => void }) {
  const { t } = useLanguage();
  const { data, openItem } = useApp();
  const [query, setQuery] = useState('');
  const all = [
    ...data.tasks.map((task) => ({
      id: task.id,
      title: task.title,
      description: task.description,
      label: t('shell.search.task'),
      page: 'tasks' as PageId,
      icon: ListTodo,
    })),
    ...data.skills.map((s) => ({
      id: s.id,
      title: s.name,
      description: s.description,
      label: t('shell.search.skill'),
      page: 'skills' as PageId,
      icon: Sprout,
    })),
    ...data.entries.map((e) => ({
      id: e.id,
      title: e.title,
      description: e.note,
      label: t('shell.search.activity'),
      page: 'journal' as PageId,
      icon: BookOpen,
    })),
    ...data.events.map((e) => ({
      id: e.id,
      title: e.title,
      description: e.note,
      label: t('shell.search.event'),
      page: 'calendar' as PageId,
      icon: CalendarDays,
    })),
  ];
  const results = query.trim()
    ? all
        .filter((item) =>
          `${item.title} ${item.description}`.toLowerCase().includes(query.trim().toLowerCase()),
        )
        .slice(0, 12)
    : [];
  return (
    <Modal title={t('shell.search.title')} onClose={onClose}>
      <label className="search-field global-search-input">
        <Search size={19} />
        <input
          autoFocus
          aria-label={t('shell.search.keywords')}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t('shell.search.placeholder')}
        />
      </label>
      {query.trim() ? (
        results.length ? (
          <div className="search-results">
            {results.map((item) => (
              <button
                key={`${item.page}-${item.id}`}
                onClick={() => {
                  openItem(item.page, item.id);
                  onClose();
                }}
              >
                <span className="search-result-icon">
                  <item.icon size={18} />
                </span>
                <div>
                  <strong>{item.title}</strong>
                  <span>
                    {item.label} · {t('shell.search.open')}
                  </span>
                </div>
                <ArrowUpLeft size={16} />
              </button>
            ))}
          </div>
        ) : (
          <EmptyState
            title={t('shell.search.noResults')}
            description={t('shell.search.tryAgain')}
          />
        )
      ) : (
        <div className="search-prompt">
          <Search size={26} />
          <p>{t('shell.search.prompt')}</p>
          <span>{t('shell.search.description')}</span>
        </div>
      )}
    </Modal>
  );
}
