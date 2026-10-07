import { useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import {
  Ban,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  LoaderCircle,
  LockKeyhole,
  RefreshCw,
  Search,
  ShieldCheck,
  Trash2,
  UserCheck,
  Users,
} from 'lucide-react';
import { Card, EmptyState, Modal, PageHeader } from '../components/ui';
import { useAuth } from '../state/AuthContext';
import { supabase } from '../lib/supabase';
import { AdminError, createAdminApi } from '../lib/admin';
import type { AccountAction, AccountFilter, AccountList, ManagedAccount } from '../lib/admin';
import { useLanguage } from '../state/LanguageContext';
import { getLocale, localizeMessage } from '../lib/i18n';

export default function AdminPage() {
  const { language, t } = useLanguage();
  const dateFormatter = new Intl.DateTimeFormat(getLocale(), {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Baghdad',
  });
  const accountDate = (value: string | null) =>
    value ? dateFormatter.format(new Date(value)) : t('settings.admin.date.noSignIn');
  const mutationLabels = {
    suspend: {
      title: t('settings.admin.suspend.title'),
      confirm: t('settings.admin.suspend.confirm'),
      success: t('settings.admin.suspend.success'),
    },
    reactivate: {
      title: t('settings.admin.reactivate.title'),
      confirm: t('settings.admin.reactivate.confirm'),
      success: t('settings.admin.reactivate.success'),
    },
    delete: {
      title: t('settings.admin.delete.title'),
      confirm: t('settings.admin.delete.confirm'),
      success: t('settings.admin.delete.success'),
    },
  };
  const { user, accountAccess } = useAuth();
  const actorId = user?.id ?? '';
  const authorized =
    !!actorId && accountAccess?.role === 'admin' && accountAccess.status === 'active';
  const api = useMemo(
    () => (supabase && actorId ? createAdminApi(supabase, actorId) : null),
    [actorId],
  );
  const [searchInput, setSearchInput] = useState('');
  const [query, setQuery] = useState({ search: '', status: 'all' as AccountFilter, page: 1 });
  const [reload, setReload] = useState(0);
  const [result, setResult] = useState<AccountList | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [noticeIsError, setNoticeIsError] = useState(false);
  const [pending, setPending] = useState<{ action: AccountAction; account: ManagedAccount } | null>(
    null,
  );
  const [confirmation, setConfirmation] = useState('');
  const [mutationError, setMutationError] = useState('');
  const [busy, setBusy] = useState(false);
  const [blockedActions, setBlockedActions] = useState<
    Record<string, { kind: 'status' | 'delete'; until: number | null }>
  >({});
  const lifetime = useRef(0);

  useEffect(() => {
    lifetime.current += 1;
    setResult(null);
    setPending(null);
    setConfirmation('');
    setMutationError('');
    setNotice('');
    setNoticeIsError(false);
    setBusy(false);
    setBlockedActions({});
    return () => {
      lifetime.current += 1;
    };
  }, [actorId, authorized]);

  useEffect(() => {
    const deadlines = Object.values(blockedActions).flatMap((action) =>
      action.until === null ? [] : [action.until],
    );
    if (!deadlines.length) return;
    const timer = window.setTimeout(
      () => {
        setBlockedActions((previous) =>
          Object.fromEntries(
            Object.entries(previous).filter(
              ([, action]) => action.until === null || action.until > Date.now(),
            ),
          ),
        );
      },
      Math.max(1, Math.min(...deadlines) - Date.now()),
    );
    return () => window.clearTimeout(timer);
  }, [blockedActions]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setQuery((previous) =>
        previous.search === searchInput.trim()
          ? previous
          : {
              ...previous,
              search: searchInput.trim(),
              page: 1,
            },
      );
    }, 350);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    if (!authorized || !api) return;
    let active = true;
    setLoading(true);
    setError('');
    void api.list(query).then(
      (data) => {
        if (!active) return;
        const lastPage = Math.max(1, Math.ceil(data.total / data.pageSize));
        if (query.page > lastPage) {
          setQuery((previous) => ({ ...previous, page: lastPage }));
          return;
        }
        setResult(data);
        setLoading(false);
      },
      (requestError: unknown) => {
        if (!active) return;
        setResult(null);
        setError(
          requestError instanceof Error ? requestError.message : t('settings.admin.loadFailed'),
        );
        setLoading(false);
      },
    );
    return () => {
      active = false;
    };
  }, [api, authorized, query, reload]);

  const closeConfirmation = () => {
    if (busy) return;
    setPending(null);
    setMutationError('');
    setConfirmation('');
  };

  const openConfirmation = (action: AccountAction, account: ManagedAccount) => {
    if (busy || blockedActions[account.id] || account.id === actorId || account.role === 'admin')
      return;
    setPending({ action, account });
    setConfirmation('');
    setMutationError('');
    setNotice('');
  };

  const submitMutation = async (event: FormEvent) => {
    event.preventDefault();
    if (!authorized || !api || !pending || busy || blockedActions[pending.account.id]) return;
    if (pending.action === 'delete' && confirmation !== pending.account.username) return;
    const currentLifetime = lifetime.current;
    setBusy(true);
    setMutationError('');
    try {
      await api.manage(pending.action, pending.account, confirmation);
      if (lifetime.current !== currentLifetime) return;
      setNotice(mutationLabels[pending.action].success);
      setNoticeIsError(false);
      setPending(null);
      setConfirmation('');
      setReload((previous) => previous + 1);
    } catch (requestError) {
      if (lifetime.current !== currentLifetime) return;
      if (requestError instanceof AdminError && requestError.pending) {
        const kind = requestError.pending;
        const until =
          kind === 'status' ? Date.now() + (requestError.retryAfterSeconds ?? 900) * 1000 : null;
        setBlockedActions((previous) => ({ ...previous, [pending.account.id]: { kind, until } }));
        setNotice(requestError.message);
        setNoticeIsError(true);
        setPending(null);
        setConfirmation('');
        setReload((previous) => previous + 1);
        return;
      }
      if (requestError instanceof AdminError && requestError.changedState === 'deleted') {
        setNotice(requestError.message);
        setNoticeIsError(true);
        setPending(null);
        setConfirmation('');
        setReload((previous) => previous + 1);
        return;
      }
      if (requestError instanceof AdminError && requestError.changedState === 'suspended') {
        setReload((previous) => previous + 1);
      }
      setMutationError(
        requestError instanceof Error ? requestError.message : t('settings.admin.actionFailed'),
      );
    } finally {
      if (lifetime.current === currentLifetime) setBusy(false);
    }
  };

  if (!authorized) {
    return (
      <Card>
        <EmptyState
          title={t('settings.admin.access.title')}
          description={t('settings.admin.access.description')}
        />
      </Card>
    );
  }

  const pages = result ? Math.max(1, Math.ceil(result.total / result.pageSize)) : 1;
  const stats = [
    {
      label: t('settings.admin.stats.total'),
      value: result?.stats.total,
      icon: Users,
      tone: 'green',
    },
    {
      label: t('settings.admin.stats.active'),
      value: result?.stats.active,
      icon: UserCheck,
      tone: 'green',
    },
    {
      label: t('settings.admin.stats.suspended'),
      value: result?.stats.suspended,
      icon: Ban,
      tone: 'amber',
    },
    {
      label: t('settings.admin.stats.admins'),
      value: result?.stats.admins,
      icon: ShieldCheck,
      tone: 'purple',
    },
  ];

  return (
    <div className="admin-page">
      <PageHeader
        eyebrow={t('settings.admin.eyebrow')}
        title={t('settings.admin.title')}
        description={t('settings.admin.description')}
        action={
          <button
            className="button secondary"
            onClick={() => setReload((previous) => previous + 1)}
            disabled={loading || busy}
          >
            <RefreshCw size={17} className={loading ? 'admin-spinning' : ''} />
            {t('settings.admin.refresh')}
          </button>
        }
      />

      <div className="admin-stats" aria-label={t('settings.admin.stats.label')}>
        {stats.map(({ label, value, icon: Icon, tone }) => (
          <Card key={label} className="admin-stat">
            <span className={`admin-stat-icon admin-tone-${tone}`}>
              <Icon size={22} />
            </span>
            <div>
              <p>{label}</p>
              <strong>{value === undefined ? '—' : value.toLocaleString(getLocale())}</strong>
            </div>
          </Card>
        ))}
      </div>

      <div className="admin-access-note">
        <ShieldCheck size={20} />
        <p>{t('settings.admin.accessNote')}</p>
      </div>
      {notice && (
        <p
          className={noticeIsError ? 'form-error' : 'admin-notice'}
          role={noticeIsError ? 'alert' : 'status'}
        >
          {!noticeIsError && <CheckCircle2 size={18} />}
          {localizeMessage(notice)}
        </p>
      )}

      <Card className="admin-accounts" title={t('settings.admin.accounts.title')}>
        <div className="admin-filters">
          <label className="search-field admin-search">
            <Search size={18} />
            <input
              aria-label={t('settings.admin.search.label')}
              placeholder={t('settings.admin.search.placeholder')}
              value={searchInput}
              maxLength={100}
              onChange={(event) => setSearchInput(event.target.value)}
            />
          </label>
          <label className="admin-status-filter">
            <span>{t('settings.admin.filter.label')}</span>
            <select
              aria-label={t('settings.admin.filter.label')}
              value={query.status}
              onChange={(event) =>
                setQuery((previous) => ({
                  ...previous,
                  status: event.target.value as AccountFilter,
                  page: 1,
                }))
              }
            >
              <option value="all">{t('settings.admin.filter.all')}</option>
              <option value="active">{t('settings.admin.status.active')}</option>
              <option value="suspended">{t('settings.admin.status.suspended')}</option>
            </select>
          </label>
        </div>

        {loading ? (
          <div className="admin-loading" role="status">
            <LoaderCircle size={28} className="admin-spinning" />
            <p>{t('settings.admin.loading')}</p>
          </div>
        ) : error ? (
          <div className="admin-load-error" role="alert">
            <p>{localizeMessage(error)}</p>
            <button
              className="button secondary"
              onClick={() => setReload((previous) => previous + 1)}
            >
              <RefreshCw size={16} />
              {t('settings.admin.retry')}
            </button>
          </div>
        ) : !result?.accounts.length ? (
          <EmptyState
            title={t('settings.admin.empty.title')}
            description={
              query.search || query.status !== 'all'
                ? t('settings.admin.empty.filtered')
                : t('settings.admin.empty.initial')
            }
          />
        ) : (
          <>
            <div className="admin-table-head" aria-hidden="true">
              <span>{t('settings.admin.table.account')}</span>
              <span>{t('settings.admin.table.access')}</span>
              <span>{t('settings.admin.table.dates')}</span>
              <span>{t('settings.admin.table.manage')}</span>
            </div>
            <div className="admin-account-list" aria-label={t('settings.admin.accounts.label')}>
              {result.accounts.map((account) => {
                const protectedAccount = account.id === actorId || account.role === 'admin';
                return (
                  <article
                    className="admin-account"
                    key={account.id}
                    aria-label={t('settings.admin.account.label', { username: account.username })}
                  >
                    <div className="admin-account-identity">
                      <span className="admin-avatar" aria-hidden="true">
                        {account.displayName.slice(0, 1) || account.username.slice(0, 1)}
                      </span>
                      <div>
                        <strong>{account.displayName || account.username}</strong>
                        <span className="admin-username" dir="ltr">
                          @{account.username}
                        </span>
                        <span className="admin-email" dir="ltr">
                          {account.email || t('settings.admin.email.none')}
                        </span>
                        <small className="admin-email-state">
                          {account.emailConfirmed
                            ? t('settings.admin.email.confirmed')
                            : t('settings.admin.email.pending')}
                        </small>
                      </div>
                    </div>
                    <div className="admin-account-badges">
                      <span className={`admin-badge admin-state-${account.status}`}>
                        {account.status === 'active'
                          ? t('settings.admin.status.active')
                          : t('settings.admin.status.suspended')}
                      </span>
                      <span className={`admin-badge admin-role-${account.role}`}>
                        {account.role === 'admin' ? (
                          <>
                            <ShieldCheck size={13} />
                            {t('settings.admin.role.admin')}
                          </>
                        ) : (
                          t('settings.admin.role.user')
                        )}
                      </span>
                      {account.id === actorId && <small>{t('settings.admin.current')}</small>}
                    </div>
                    <div className="admin-account-dates">
                      <div>
                        <span>{t('settings.admin.date.registered')}</span>
                        <time dateTime={account.createdAt}>{accountDate(account.createdAt)}</time>
                      </div>
                      <div>
                        <span>{t('settings.admin.date.lastSignIn')}</span>
                        {account.lastSignInAt ? (
                          <time dateTime={account.lastSignInAt}>
                            {accountDate(account.lastSignInAt)}
                          </time>
                        ) : (
                          <p>{t('settings.admin.date.noSignIn')}</p>
                        )}
                      </div>
                    </div>
                    <div className="admin-account-actions">
                      {protectedAccount ? (
                        <span className="admin-protected">
                          <LockKeyhole size={15} />
                          {t('settings.admin.protected')}
                        </span>
                      ) : (
                        <>
                          <button
                            className={`button secondary admin-action-${account.status === 'active' ? 'suspend' : 'reactivate'}`}
                            disabled={busy || !!blockedActions[account.id]}
                            onClick={() =>
                              openConfirmation(
                                account.status === 'active' ? 'suspend' : 'reactivate',
                                account,
                              )
                            }
                          >
                            {account.status === 'active' ? (
                              <Ban size={15} />
                            ) : (
                              <UserCheck size={15} />
                            )}
                            {account.status === 'active'
                              ? t('settings.admin.suspend.title')
                              : t('settings.admin.reactivate.title')}
                          </button>
                          <button
                            className="button admin-delete"
                            disabled={busy || !!blockedActions[account.id]}
                            onClick={() => openConfirmation('delete', account)}
                          >
                            <Trash2 size={15} />
                            {t('settings.admin.delete.button')}
                          </button>
                          {blockedActions[account.id] && (
                            <small className="admin-protected">
                              {blockedActions[account.id].kind === 'delete'
                                ? t('settings.admin.blocked.delete')
                                : t('settings.admin.blocked.status')}
                            </small>
                          )}
                        </>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
            <div className="admin-pagination">
              <p>
                {t('settings.admin.pagination.summary', {
                  count: result.total.toLocaleString(getLocale()),
                  page: query.page.toLocaleString(getLocale()),
                  pages: pages.toLocaleString(getLocale()),
                })}
              </p>
              <div>
                <button
                  className="button secondary"
                  aria-label={t('settings.admin.pagination.previousLabel')}
                  disabled={query.page <= 1 || busy}
                  onClick={() => setQuery((previous) => ({ ...previous, page: previous.page - 1 }))}
                >
                  {language === 'ar' ? <ChevronRight size={17} /> : <ChevronLeft size={17} />}
                  {t('settings.admin.pagination.previous')}
                </button>
                <button
                  className="button secondary"
                  aria-label={t('settings.admin.pagination.nextLabel')}
                  disabled={query.page >= pages || busy}
                  onClick={() => setQuery((previous) => ({ ...previous, page: previous.page + 1 }))}
                >
                  {t('settings.admin.pagination.next')}
                  {language === 'ar' ? <ChevronLeft size={17} /> : <ChevronRight size={17} />}
                </button>
              </div>
            </div>
          </>
        )}
      </Card>

      {pending && (
        <Modal title={mutationLabels[pending.action].title} onClose={closeConfirmation}>
          <form className="admin-confirmation" onSubmit={submitMutation} aria-busy={busy}>
            <div className="admin-confirm-account">
              <strong>{pending.account.displayName || pending.account.username}</strong>
              <span dir="ltr">@{pending.account.username}</span>
            </div>
            <p className="confirm-text">
              {pending.action === 'suspend'
                ? t('settings.admin.suspend.description')
                : pending.action === 'reactivate'
                  ? t('settings.admin.reactivate.description')
                  : t('settings.admin.delete.description')}
            </p>
            {pending.action === 'delete' && (
              <label className="form-field admin-delete-confirm">
                <span>
                  {t('settings.admin.delete.typeUsername')}: <bdi>{pending.account.username}</bdi>
                </span>
                <input
                  aria-label={t('settings.admin.delete.typeUsername')}
                  value={confirmation}
                  onChange={(event) => setConfirmation(event.target.value)}
                  dir="ltr"
                  autoComplete="off"
                  spellCheck={false}
                  disabled={busy}
                />
              </label>
            )}
            {mutationError && (
              <p className="form-error" role="alert">
                {localizeMessage(mutationError)}
              </p>
            )}
            <div className="form-actions">
              <button
                className={`button ${pending.action === 'reactivate' ? 'primary' : 'danger'}`}
                disabled={
                  busy || (pending.action === 'delete' && confirmation !== pending.account.username)
                }
                type="submit"
              >
                {busy && <LoaderCircle size={17} className="admin-spinning" />}
                {busy ? t('settings.admin.busy') : mutationLabels[pending.action].confirm}
              </button>
              <button
                className="button secondary"
                type="button"
                disabled={busy}
                onClick={closeConfirmation}
              >
                {t('settings.admin.cancel')}
              </button>
            </div>
            {busy && (
              <p className="admin-busy-note" role="status">
                {t('settings.admin.busyNote')}
              </p>
            )}
          </form>
        </Modal>
      )}
    </div>
  );
}
