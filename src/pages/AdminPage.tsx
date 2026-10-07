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

const dateFormatter = new Intl.DateTimeFormat('ar-IQ', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'Asia/Baghdad',
});

function accountDate(value: string | null) {
  return value ? dateFormatter.format(new Date(value)) : 'لم يسجّل الدخول بعد';
}

const mutationLabels = {
  suspend: { title: 'إيقاف الحساب', confirm: 'تأكيد الإيقاف', success: 'تم إيقاف الحساب.' },
  reactivate: {
    title: 'إعادة تفعيل الحساب',
    confirm: 'تأكيد التفعيل',
    success: 'تمت إعادة تفعيل الحساب.',
  },
  delete: {
    title: 'حذف الحساب نهائياً',
    confirm: 'حذف الحساب نهائياً',
    success: 'تم حذف الحساب وبياناته.',
  },
};

export default function AdminPage() {
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
        setError(requestError instanceof Error ? requestError.message : 'تعذّر تحميل الحسابات.');
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
        requestError instanceof Error ? requestError.message : 'تعذّر تنفيذ العملية.',
      );
    } finally {
      if (lifetime.current === currentLifetime) setBusy(false);
    }
  };

  if (!authorized) {
    return (
      <Card>
        <EmptyState
          title="إدارة الحسابات متاحة للأدمن فقط"
          description="يتم التحقق من الصلاحية من الخادم. سجّل الدخول بحساب الإدارة النشط."
        />
      </Card>
    );
  }

  const pages = result ? Math.max(1, Math.ceil(result.total / result.pageSize)) : 1;
  const stats = [
    { label: 'إجمالي الحسابات', value: result?.stats.total, icon: Users, tone: 'green' },
    { label: 'الحسابات النشطة', value: result?.stats.active, icon: UserCheck, tone: 'green' },
    { label: 'الحسابات الموقوفة', value: result?.stats.suspended, icon: Ban, tone: 'amber' },
    { label: 'حسابات الإدارة', value: result?.stats.admins, icon: ShieldCheck, tone: 'purple' },
  ];

  return (
    <div className="admin-page">
      <PageHeader
        eyebrow="مساحة الإدارة"
        title="إدارة الحسابات"
        description="تابع الحسابات المسجّلة، وأدر الوصول إلى مدار من مكان واحد."
        action={
          <button
            className="button secondary"
            onClick={() => setReload((previous) => previous + 1)}
            disabled={loading || busy}
          >
            <RefreshCw size={17} className={loading ? 'admin-spinning' : ''} />
            تحديث الحسابات
          </button>
        }
      />

      <div className="admin-stats" aria-label="إحصائيات الحسابات">
        {stats.map(({ label, value, icon: Icon, tone }) => (
          <Card key={label} className="admin-stat">
            <span className={`admin-stat-icon admin-tone-${tone}`}>
              <Icon size={22} />
            </span>
            <div>
              <p>{label}</p>
              <strong>{value === undefined ? '—' : value.toLocaleString('ar-IQ')}</strong>
            </div>
          </Card>
        ))}
      </div>

      <div className="admin-access-note">
        <ShieldCheck size={20} />
        <p>
          الإيقاف يمنع الدخول والوصول السحابي مع الاحتفاظ بالبيانات. حسابات الإدارة محمية من الإيقاف
          والحذف.
        </p>
      </div>
      {notice && (
        <p
          className={noticeIsError ? 'form-error' : 'admin-notice'}
          role={noticeIsError ? 'alert' : 'status'}
        >
          {!noticeIsError && <CheckCircle2 size={18} />}
          {notice}
        </p>
      )}

      <Card className="admin-accounts" title="الحسابات المسجّلة">
        <div className="admin-filters">
          <label className="search-field admin-search">
            <Search size={18} />
            <input
              aria-label="البحث عن حساب"
              placeholder="اسم المستخدم، الاسم، أو البريد"
              value={searchInput}
              maxLength={100}
              onChange={(event) => setSearchInput(event.target.value)}
            />
          </label>
          <label className="admin-status-filter">
            <span>حالة الحساب</span>
            <select
              aria-label="حالة الحساب"
              value={query.status}
              onChange={(event) =>
                setQuery((previous) => ({
                  ...previous,
                  status: event.target.value as AccountFilter,
                  page: 1,
                }))
              }
            >
              <option value="all">كل الحسابات</option>
              <option value="active">نشط</option>
              <option value="suspended">موقوف</option>
            </select>
          </label>
        </div>

        {loading ? (
          <div className="admin-loading" role="status">
            <LoaderCircle size={28} className="admin-spinning" />
            <p>جاري تحميل الحسابات…</p>
          </div>
        ) : error ? (
          <div className="admin-load-error" role="alert">
            <p>{error}</p>
            <button
              className="button secondary"
              onClick={() => setReload((previous) => previous + 1)}
            >
              <RefreshCw size={16} />
              إعادة المحاولة
            </button>
          </div>
        ) : !result?.accounts.length ? (
          <EmptyState
            title="لا توجد حسابات مطابقة"
            description={
              query.search || query.status !== 'all'
                ? 'جرّب كلمة بحث أخرى أو غيّر فلتر الحالة.'
                : 'تظهر الحسابات هنا بعد التسجيل في مدار.'
            }
          />
        ) : (
          <>
            <div className="admin-table-head" aria-hidden="true">
              <span>الحساب</span>
              <span>الحالة والصلاحية</span>
              <span>تاريخ التسجيل / آخر دخول</span>
              <span>إدارة الحساب</span>
            </div>
            <div className="admin-account-list" aria-label="قائمة الحسابات">
              {result.accounts.map((account) => {
                const protectedAccount = account.id === actorId || account.role === 'admin';
                return (
                  <article
                    className="admin-account"
                    key={account.id}
                    aria-label={`حساب ${account.username}`}
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
                          {account.email || 'بدون بريد إلكتروني'}
                        </span>
                        <small className="admin-email-state">
                          {account.emailConfirmed ? 'البريد مؤكّد' : 'بانتظار تأكيد البريد'}
                        </small>
                      </div>
                    </div>
                    <div className="admin-account-badges">
                      <span className={`admin-badge admin-state-${account.status}`}>
                        {account.status === 'active' ? 'نشط' : 'موقوف'}
                      </span>
                      <span className={`admin-badge admin-role-${account.role}`}>
                        {account.role === 'admin' ? (
                          <>
                            <ShieldCheck size={13} />
                            أدمن
                          </>
                        ) : (
                          'مستخدم'
                        )}
                      </span>
                      {account.id === actorId && <small>حسابك الحالي</small>}
                    </div>
                    <div className="admin-account-dates">
                      <div>
                        <span>تاريخ التسجيل</span>
                        <time dateTime={account.createdAt}>{accountDate(account.createdAt)}</time>
                      </div>
                      <div>
                        <span>آخر دخول</span>
                        {account.lastSignInAt ? (
                          <time dateTime={account.lastSignInAt}>
                            {accountDate(account.lastSignInAt)}
                          </time>
                        ) : (
                          <p>لم يسجّل الدخول بعد</p>
                        )}
                      </div>
                    </div>
                    <div className="admin-account-actions">
                      {protectedAccount ? (
                        <span className="admin-protected">
                          <LockKeyhole size={15} />
                          حساب إدارة محمي
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
                            {account.status === 'active' ? 'إيقاف الحساب' : 'إعادة تفعيل الحساب'}
                          </button>
                          <button
                            className="button admin-delete"
                            disabled={busy || !!blockedActions[account.id]}
                            onClick={() => openConfirmation('delete', account)}
                          >
                            <Trash2 size={15} />
                            حذف الحساب
                          </button>
                          {blockedActions[account.id] && (
                            <small className="admin-protected">
                              {blockedActions[account.id].kind === 'delete'
                                ? 'حذف معلّق بانتظار مراجعة مالك الموقع'
                                : 'تغيير الحالة قيد التحقق؛ انتظر 15 دقيقة'}
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
                {result.total.toLocaleString('ar-IQ')} حساب مطابق · الصفحة{' '}
                {query.page.toLocaleString('ar-IQ')} من {pages.toLocaleString('ar-IQ')}
              </p>
              <div>
                <button
                  className="button secondary"
                  aria-label="الصفحة السابقة"
                  disabled={query.page <= 1 || busy}
                  onClick={() => setQuery((previous) => ({ ...previous, page: previous.page - 1 }))}
                >
                  <ChevronRight size={17} />
                  السابق
                </button>
                <button
                  className="button secondary"
                  aria-label="الصفحة التالية"
                  disabled={query.page >= pages || busy}
                  onClick={() => setQuery((previous) => ({ ...previous, page: previous.page + 1 }))}
                >
                  التالي
                  <ChevronLeft size={17} />
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
                ? 'سيتم منع هذا الحساب من تسجيل الدخول والوصول إلى بياناته السحابية. تبقى بياناته محفوظة ويمكنك إعادة تفعيله لاحقاً.'
                : pending.action === 'reactivate'
                  ? 'سيتم السماح لهذا الحساب بتسجيل الدخول والوصول إلى بياناته السحابية مرة أخرى.'
                  : 'سيتم حذف الحساب وجميع بياناته السحابية نهائياً، بما فيها المهام والمهارات وسجل النشاط. لا يمكن التراجع عن هذه العملية.'}
            </p>
            {pending.action === 'delete' && (
              <label className="form-field admin-delete-confirm">
                <span>
                  اكتب اسم المستخدم للتأكيد: <bdi>{pending.account.username}</bdi>
                </span>
                <input
                  aria-label="اكتب اسم المستخدم للتأكيد"
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
                {mutationError}
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
                {busy ? 'جاري تنفيذ العملية…' : mutationLabels[pending.action].confirm}
              </button>
              <button
                className="button secondary"
                type="button"
                disabled={busy}
                onClick={closeConfirmation}
              >
                إلغاء
              </button>
            </div>
            {busy && (
              <p className="admin-busy-note" role="status">
                انتظر إتمام العملية قبل إغلاق النافذة.
              </p>
            )}
          </form>
        </Modal>
      )}
    </div>
  );
}
