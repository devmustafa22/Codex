import { useState } from 'react';
import { Search, ArrowUpLeft, ListTodo, Sprout, BookOpen, CalendarDays } from 'lucide-react';
import { useApp } from '../state/AppContext';
import { Modal, EmptyState } from './ui';
import type { PageId } from '../lib/types';

export function SearchDialog({ onClose }: { onClose: () => void }) {
  const { data, openItem } = useApp();
  const [query, setQuery] = useState('');
  const all = [
    ...data.tasks.map((t) => ({
      id: t.id,
      title: t.title,
      description: t.description,
      label: 'مهمة',
      page: 'tasks' as PageId,
      icon: ListTodo,
    })),
    ...data.skills.map((s) => ({
      id: s.id,
      title: s.name,
      description: s.description,
      label: 'مهارة',
      page: 'skills' as PageId,
      icon: Sprout,
    })),
    ...data.entries.map((e) => ({
      id: e.id,
      title: e.title,
      description: e.note,
      label: 'نشاط',
      page: 'journal' as PageId,
      icon: BookOpen,
    })),
    ...data.events.map((e) => ({
      id: e.id,
      title: e.title,
      description: e.note,
      label: 'موعد',
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
    <Modal title="البحث في مساحتك" onClose={onClose}>
      <label className="search-field global-search-input">
        <Search size={19} />
        <input
          autoFocus
          aria-label="كلمات البحث"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="مهمة، مهارة، أو فكرة كتبتها..."
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
                  <span>{item.label} · فتح التفاصيل</span>
                </div>
                <ArrowUpLeft size={16} />
              </button>
            ))}
          </div>
        ) : (
          <EmptyState title="ما لقينا نتيجة" description="جرّب كلمة أقصر أو عنواناً مختلفاً." />
        )
      ) : (
        <div className="search-prompt">
          <Search size={26} />
          <p>كل خطواتك قابلة للعثور عليها.</p>
          <span>ابحث في المهام، المهارات، المواعيد وسجلّ الرحلة.</span>
        </div>
      )}
    </Modal>
  );
}
