import { Buffer } from 'node:buffer';
import { test as base, expect } from '@playwright/test';
import type { Page, Route } from '@playwright/test';
import { createEmptyWorkspace } from '../src/lib/cloud-workspace';

const HOST = 'https://madar-test.supabase.co';
const PASSWORD = 'PrivateTest123!';
const ADMIN_ID = '10000000-0000-4000-8000-000000000011';
const MEMBER_ID = '10000000-0000-4000-8000-000000000012';

type AccountStatus = 'active' | 'suspended' | 'deleted';
type TestUser = {
  id: string;
  email: string;
  aud: string;
  role: string;
  user_metadata: { username: string; display_name: string; role?: string };
  app_metadata: { provider: string; providers: string[] };
  created_at: string;
  updated_at: string;
  email_confirmed_at: string;
  identities: { identity_id: string; id: string; user_id: string; provider: string }[];
};
type AdminRequest = { actor: string | null; body: Record<string, unknown> };

function user(id: string, username: string, displayName: string): TestUser {
  const now = '2026-10-07T08:00:00.000Z';
  return {
    id,
    email: `${username}@example.com`,
    aud: 'authenticated',
    role: 'authenticated',
    user_metadata: { username, display_name: displayName },
    app_metadata: { provider: 'email', providers: ['email'] },
    created_at: now,
    updated_at: now,
    email_confirmed_at: now,
    identities: [{ identity_id: id, id, user_id: id, provider: 'email' }],
  };
}

/** Only server-owned access grants administration; editable profile fields do not. */
class AdminServer {
  users = [
    user(ADMIN_ID, 'mustafaasad', 'مصطفى الأدمن'),
    user(MEMBER_ID, 'member_one', 'حساب عضو'),
  ];
  access = new Map<string, { role: 'admin' | 'user'; status: AccountStatus }>([
    [ADMIN_ID, { role: 'admin', status: 'active' }],
    [MEMBER_ID, { role: 'user', status: 'active' }],
  ]);
  adminRequests: AdminRequest[] = [];
  accessRequests: string[] = [];
  workspaceReads: string[] = [];
  workspaceWrites: string[] = [];
  failAdminRequests = false;
  mutationOutcome: 'delete_unknown' | 'status_unknown' | null = null;
  holdList: Promise<void> | null = null;
  listStarted = false;

  private token(current: TestUser) {
    const now = Math.floor(Date.now() / 1000);
    const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
    return `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({
      sub: current.id,
      aud: 'authenticated',
      role: 'authenticated',
      exp: now + 3600,
      iat: now,
      iss: `${HOST}/auth/v1`,
      session_id: '20000000-0000-4000-8000-000000000011',
    })}.test_signature`;
  }

  session(current: TestUser) {
    return {
      access_token: this.token(current),
      token_type: 'bearer',
      expires_in: 3600,
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      refresh_token: `admin-test-refresh:${current.id}`,
      user: current,
    };
  }

  private authenticated(token: string): TestUser | undefined {
    try {
      const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString());
      return this.users.find((current) => current.id === payload.sub);
    } catch {
      return undefined;
    }
  }

  private respond(route: Route, status: number, body?: unknown) {
    return route.fulfill({
      status,
      headers: {
        'content-type': 'application/json',
        'access-control-allow-origin': '*',
        'access-control-allow-headers': '*',
        'access-control-allow-methods': 'GET,POST,PUT,OPTIONS',
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  }

  private list(body: Record<string, unknown>) {
    const accounts = this.users
      .filter((current) => this.access.get(current.id)?.status !== 'deleted')
      .map((current) => ({
        id: current.id,
        username: current.user_metadata.username,
        displayName: current.user_metadata.display_name,
        email: current.email,
        role: this.access.get(current.id)!.role,
        status: this.access.get(current.id)!.status,
        createdAt: current.created_at,
        lastSignInAt: '2026-10-07T10:00:00.000Z',
        emailConfirmed: true,
      }));
    const search = String(body.search ?? '').toLowerCase();
    const status = body.status ?? 'all';
    const filtered = accounts.filter(
      (account) =>
        (status === 'all' || account.status === status) &&
        [account.username, account.email, account.displayName].some((value) =>
          value.toLowerCase().includes(search),
        ),
    );
    const page = Number(body.page ?? 1);
    const pageSize = Number(body.pageSize ?? 20);
    return {
      accounts: filtered.slice((page - 1) * pageSize, page * pageSize),
      page,
      pageSize,
      total: filtered.length,
      stats: {
        total: accounts.length,
        active: accounts.filter((account) => account.status === 'active').length,
        suspended: accounts.filter((account) => account.status === 'suspended').length,
        admins: accounts.filter((account) => account.role === 'admin').length,
      },
    };
  }

  async install(page: Page) {
    await page.route(`${HOST}/**`, async (route) => {
      const request = route.request();
      const path = new URL(request.url()).pathname;
      const body = request.postData() ? request.postDataJSON() : {};
      const bearer = (request.headers().authorization ?? '').replace(/^Bearer\s+/i, '');
      const current = this.authenticated(bearer);
      if (request.method() === 'OPTIONS') return this.respond(route, 200, {});

      if (path === '/functions/v1/username-login' || path === '/auth/v1/token') {
        const candidate = this.users.find(
          (item) =>
            item.user_metadata.username === body.identifier ||
            item.email === body.email ||
            body.refresh_token === `admin-test-refresh:${item.id}`,
        );
        if (!candidate || (body.password !== undefined && body.password !== PASSWORD)) {
          return this.respond(route, 401, { code: 'invalid_credentials' });
        }
        return this.respond(route, 200, this.session(candidate));
      }
      if (path === '/auth/v1/user') {
        return current
          ? this.respond(route, 200, current)
          : this.respond(route, 401, { message: 'Not authenticated' });
      }
      if (path === '/auth/v1/logout') return this.respond(route, 204);
      if (path === '/rest/v1/rpc/get_account_access') {
        if (!current) return this.respond(route, 401, { code: '42501' });
        this.accessRequests.push(current.id);
        return this.respond(route, 200, this.access.get(current.id));
      }
      if (path === '/rest/v1/user_workspaces') {
        if (!current || this.access.get(current.id)?.status !== 'active') {
          return this.respond(route, 403, { code: '42501', message: 'Account is inactive' });
        }
        this.workspaceReads.push(current.id);
        // A deliberately editable title of "admin" never becomes an access grant.
        const payload = createEmptyWorkspace(current.user_metadata.display_name);
        payload.profile.role = 'admin';
        return this.respond(route, 200, [
          {
            user_id: current.id,
            payload,
            revision: 1,
            updated_at: new Date().toISOString(),
          },
        ]);
      }
      if (path === '/rest/v1/rpc/save_workspace') {
        if (!current || this.access.get(current.id)?.status !== 'active') {
          return this.respond(route, 403, { code: '42501', message: 'Account is inactive' });
        }
        this.workspaceWrites.push(current.id);
        return this.respond(route, 200, [
          {
            user_id: current.id,
            payload: body.p_payload,
            revision: body.p_expected_revision + 1,
            updated_at: new Date().toISOString(),
          },
        ]);
      }
      if (path === '/functions/v1/account-admin') {
        this.adminRequests.push({ actor: current?.id ?? null, body });
        if (
          !current ||
          this.access.get(current.id)?.role !== 'admin' ||
          this.access.get(current.id)?.status !== 'active'
        ) {
          return this.respond(route, 403, { code: 'forbidden', error: 'forbidden' });
        }
        if (this.failAdminRequests) {
          return this.respond(route, 503, {
            code: 'admin_unavailable',
            error: 'admin_unavailable',
          });
        }
        if (body.action === 'list') {
          const snapshot = this.list(body);
          this.listStarted = true;
          if (this.holdList) await this.holdList;
          return this.respond(route, 200, snapshot);
        }
        const target = this.users.find((item) => item.id === body.userId);
        if (!target || target.id === current.id) {
          return this.respond(route, 409, {
            code: 'protected_account',
            error: 'protected_account',
          });
        }
        if (body.action === 'delete' && this.mutationOutcome === 'delete_unknown') {
          this.access.get(target.id)!.status = 'suspended';
          return this.respond(route, 503, {
            code: 'account_delete_unknown',
            error: 'account_delete_unknown',
            pending: true,
            retryable: false,
            targetId: target.id,
          });
        }
        if (body.action === 'reactivate' && this.mutationOutcome === 'status_unknown') {
          this.access.get(target.id)!.status = 'active';
          return this.respond(route, 503, {
            code: 'account_status_confirmation_pending',
            error: 'account_status_confirmation_pending',
            pending: true,
            retryable: false,
            retryAfterSeconds: 900,
          });
        }
        if (body.action === 'delete') {
          if (body.confirmation !== target.user_metadata.username) {
            return this.respond(route, 400, { code: 'confirmation_mismatch' });
          }
          this.access.get(target.id)!.status = 'deleted';
          return this.respond(route, 200, { deleted: true, targetId: target.id });
        }
        if (body.action !== 'suspend' && body.action !== 'reactivate') {
          return this.respond(route, 400, { code: 'invalid_request' });
        }
        const status = body.action === 'suspend' ? 'suspended' : 'active';
        this.access.get(target.id)!.status = status;
        return this.respond(route, 200, {
          account: { id: target.id, username: target.user_metadata.username, status },
        });
      }
      return this.respond(route, 404, { message: `Unhandled admin mock endpoint: ${path}` });
    });
  }
}

const test = base.extend<{ server: AdminServer; appErrors: string[] }>({
  server: async ({ page }, use) => {
    const server = new AdminServer();
    await server.install(page);
    await use(server);
  },
  appErrors: [
    async ({ page }, use) => {
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      await use(errors);
      expect(errors, 'Admin flows must not throw uncaught browser errors').toEqual([]);
    },
    { auto: true },
  ],
});

async function signIn(page: Page, identifier = 'mustafaasad') {
  await page.getByLabel('اسم المستخدم أو البريد الإلكتروني').fill(identifier);
  await page.locator('#auth-password').fill(PASSWORD);
  await page.getByRole('button', { name: 'ادخل إلى مساحتك', exact: true }).click();
  await expect(page.locator('.app-shell')).toBeVisible();
}

async function openAdmin(page: Page) {
  const menu = page.getByRole('button', { name: 'فتح القائمة', exact: true });
  if (await menu.isVisible()) await menu.click();
  await page
    .locator('.sidebar')
    .getByRole('button', { name: 'إدارة الحسابات', exact: true })
    .click();
  await expect(page.getByRole('heading', { name: 'إدارة الحسابات', exact: true })).toBeVisible();
  await expect(page).toHaveURL(/#admin$/);
}

function memberRow(page: Page) {
  return page.getByRole('article', { name: 'حساب member_one', exact: true });
}

async function noOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
    await page.evaluate(() => window.innerWidth + 1),
  );
}

test('editable metadata and profile titles cannot reveal administration, even with a direct URL', async ({
  page,
  server,
}) => {
  server.users[1].user_metadata.role = 'admin';
  await page.goto('/#admin');
  await signIn(page, 'member_one');
  await expect(page).toHaveURL(/#dashboard$/);
  await expect(
    page.locator('.sidebar').getByRole('button', { name: 'إدارة الحسابات', exact: true }),
  ).toHaveCount(0);
  await page.goto('/#admin');
  await expect(page.locator('.app-shell')).toBeVisible();
  await expect(page).toHaveURL(/#dashboard$/);
  expect(server.adminRequests).toEqual([]);
  expect(server.accessRequests).toContain(MEMBER_ID);
});

test('an administrator sees account metadata and confirms suspension and reactivation', async ({
  page,
  server,
}, testInfo) => {
  await page.goto('/');
  await signIn(page);
  await openAdmin(page);
  const member = memberRow(page);
  await expect(member).toContainText('حساب عضو');
  await expect(member).toContainText('member_one@example.com');
  const ownAccount = page.getByRole('article', { name: 'حساب mustafaasad', exact: true });
  await expect(ownAccount).toContainText('حساب إدارة محمي');
  await expect(ownAccount.getByRole('button', { name: 'إيقاف الحساب', exact: true })).toHaveCount(
    0,
  );
  await expect(ownAccount.getByRole('button', { name: 'حذف الحساب', exact: true })).toHaveCount(0);
  await expect(member.getByRole('button', { name: 'إيقاف الحساب', exact: true })).toBeVisible();
  expect(server.adminRequests[0]).toMatchObject({ actor: ADMIN_ID, body: { action: 'list' } });
  await page.screenshot({ path: testInfo.outputPath('admin-desktop.png'), fullPage: true });

  await member.getByRole('button', { name: 'إيقاف الحساب', exact: true }).click();
  const suspend = page.getByRole('dialog', { name: 'إيقاف الحساب', exact: true });
  await expect(suspend).toContainText('member_one');
  // Opening a destructive action must not mutate the account.
  expect(server.access.get(MEMBER_ID)?.status).toBe('active');
  await suspend.getByRole('button', { name: 'تأكيد الإيقاف', exact: true }).click();
  await expect(suspend).not.toBeVisible();
  await expect.poll(() => server.access.get(MEMBER_ID)?.status).toBe('suspended');
  expect(server.adminRequests).toContainEqual({
    actor: ADMIN_ID,
    body: { action: 'suspend', userId: MEMBER_ID },
  });
  await expect(
    member.getByRole('button', { name: 'إعادة تفعيل الحساب', exact: true }),
  ).toBeVisible();
  await member.getByRole('button', { name: 'إعادة تفعيل الحساب', exact: true }).click();
  const reactivate = page.getByRole('dialog', { name: 'إعادة تفعيل الحساب', exact: true });
  await reactivate.getByRole('button', { name: 'تأكيد التفعيل', exact: true }).click();
  await expect(reactivate).not.toBeVisible();
  await expect.poll(() => server.access.get(MEMBER_ID)?.status).toBe('active');
  expect(server.adminRequests).toContainEqual({
    actor: ADMIN_ID,
    body: { action: 'reactivate', userId: MEMBER_ID },
  });
});

test('search and status filters query the server and failed lists expose a usable retry', async ({
  page,
  server,
}) => {
  server.access.get(MEMBER_ID)!.status = 'suspended';
  await page.goto('/');
  await signIn(page);
  await openAdmin(page);
  await expect(memberRow(page)).toBeVisible();
  await page.getByLabel('البحث عن حساب', { exact: true }).fill('member_one@example.com');
  await page.getByLabel('حالة الحساب', { exact: true }).selectOption('suspended');
  await expect
    .poll(() => server.adminRequests.at(-1)?.body)
    .toMatchObject({
      action: 'list',
      search: 'member_one@example.com',
      status: 'suspended',
      page: 1,
      pageSize: 20,
    });
  await expect(memberRow(page)).toBeVisible();
  await expect(page.getByRole('article', { name: 'حساب mustafaasad', exact: true })).toHaveCount(0);
  server.failAdminRequests = true;
  await page.getByRole('button', { name: 'تحديث الحسابات', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('تعذّر');
  await expect(memberRow(page)).toHaveCount(0);
  server.failAdminRequests = false;
  await page.getByRole('button', { name: 'إعادة المحاولة', exact: true }).click();
  await expect(memberRow(page)).toBeVisible();
  await expect(page.getByRole('alert')).toHaveCount(0);
});

test('permanent deletion requires the target username and sends the confirmed target to the server', async ({
  page,
  server,
}) => {
  await page.goto('/');
  await signIn(page);
  await openAdmin(page);
  await memberRow(page).getByRole('button', { name: 'حذف الحساب', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'حذف الحساب نهائياً', exact: true });
  const remove = dialog.getByRole('button', { name: 'حذف الحساب نهائياً', exact: true });
  await expect(remove).toBeDisabled();
  await dialog.getByLabel('اكتب اسم المستخدم للتأكيد', { exact: true }).fill('mustafaasad');
  await expect(remove).toBeDisabled();
  expect(server.adminRequests.filter((request) => request.body.action === 'delete')).toEqual([]);
  await dialog.getByLabel('اكتب اسم المستخدم للتأكيد', { exact: true }).fill('member_one');
  await expect(remove).toBeEnabled();
  await remove.click();
  await expect(dialog).not.toBeVisible();
  await expect(memberRow(page)).toHaveCount(0);
  expect(server.adminRequests).toContainEqual({
    actor: ADMIN_ID,
    body: { action: 'delete', userId: MEMBER_ID, confirmation: 'member_one' },
  });
  expect(server.access.get(MEMBER_ID)?.status).toBe('deleted');
});

test('an unknown deletion result reloads authoritative state and locks repeated account actions', async ({
  page,
  server,
}) => {
  server.mutationOutcome = 'delete_unknown';
  await page.goto('/');
  await signIn(page);
  await openAdmin(page);
  await memberRow(page).getByRole('button', { name: 'حذف الحساب', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'حذف الحساب نهائياً', exact: true });
  await dialog.getByLabel('اكتب اسم المستخدم للتأكيد', { exact: true }).fill('member_one');
  await dialog.getByRole('button', { name: 'حذف الحساب نهائياً', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page.getByRole('alert')).toContainText('تعذّر تأكيد نتيجة حذف الحساب');
  await expect(page.getByRole('alert')).toContainText('مراجعة مالك الموقع');
  await expect(page.getByRole('alert')).not.toContainText('تم حذف الحساب وبياناته.');
  const member = memberRow(page);
  await expect(member).toBeVisible();
  await expect(member.locator('.admin-state-suspended')).toHaveText('موقوف');
  const remove = member.getByRole('button', { name: 'حذف الحساب', exact: true });
  await expect(remove).toBeDisabled();
  await expect(
    member.getByRole('button', { name: 'إعادة تفعيل الحساب', exact: true }),
  ).toBeDisabled();
  const box = await remove.boundingBox();
  expect(box).not.toBeNull();
  await page.mouse.click(box!.x + box!.width / 2, box!.y + box!.height / 2);
  await page.getByRole('button', { name: 'تحديث الحسابات', exact: true }).click();
  await expect(member.getByRole('button', { name: 'حذف الحساب', exact: true })).toBeDisabled();
  await expect(dialog).not.toBeVisible();
  expect(server.adminRequests.filter((request) => request.body.action === 'delete')).toHaveLength(
    1,
  );
  expect(
    server.adminRequests.filter((request) => request.body.action === 'list').length,
  ).toBeGreaterThan(1);
});

test('an uncertain status confirmation shows server state without claiming success or repeating the mutation', async ({
  page,
  server,
}) => {
  server.access.get(MEMBER_ID)!.status = 'suspended';
  server.mutationOutcome = 'status_unknown';
  await page.goto('/');
  await signIn(page);
  await openAdmin(page);
  await memberRow(page).getByRole('button', { name: 'إعادة تفعيل الحساب', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'إعادة تفعيل الحساب', exact: true });
  await dialog.getByRole('button', { name: 'تأكيد التفعيل', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page.getByRole('alert')).toContainText('تعذّر تأكيد الحالة النهائية للحساب');
  await expect(page.getByRole('alert')).not.toContainText('تمت إعادة تفعيل الحساب.');
  const member = memberRow(page);
  await expect(member.locator('.admin-state-active')).toHaveText('نشط');
  const suspend = member.getByRole('button', { name: 'إيقاف الحساب', exact: true });
  await expect(suspend).toBeDisabled();
  await expect(member.getByRole('button', { name: 'حذف الحساب', exact: true })).toBeDisabled();
  const box = await suspend.boundingBox();
  expect(box).not.toBeNull();
  await page.mouse.click(box!.x + box!.width / 2, box!.y + box!.height / 2);
  await page.getByRole('button', { name: 'تحديث الحسابات', exact: true }).click();
  await expect(member.getByRole('button', { name: 'إيقاف الحساب', exact: true })).toBeDisabled();
  await expect(dialog).not.toBeVisible();
  expect(
    server.adminRequests.filter((request) => request.body.action === 'reactivate'),
  ).toHaveLength(1);
  expect(server.adminRequests.filter((request) => request.body.action === 'suspend')).toHaveLength(
    0,
  );
});

test('phone administration and deletion dialog fit 360 px and retain keyboard access', async ({
  page,
  server,
}, testInfo) => {
  await page.setViewportSize({ width: 360, height: 780 });
  await page.goto('/');
  await signIn(page);
  await openAdmin(page);
  await expect(memberRow(page)).toBeVisible();
  await noOverflow(page);
  await page.screenshot({ path: testInfo.outputPath('admin-mobile.png'), fullPage: true });
  const remove = memberRow(page).getByRole('button', { name: 'حذف الحساب', exact: true });
  const box = await remove.boundingBox();
  expect(box?.height).toBeGreaterThanOrEqual(44);
  await remove.click();
  const dialog = page.getByRole('dialog', { name: 'حذف الحساب نهائياً', exact: true });
  await expect(dialog).toBeVisible();
  await noOverflow(page);
  const confirmation = dialog.getByLabel('اكتب اسم المستخدم للتأكيد', { exact: true });
  await confirmation.focus();
  await expect(confirmation).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
  await expect(memberRow(page)).toBeVisible();
  expect(server.adminRequests.every((request) => request.actor === ADMIN_ID)).toBe(true);
});

test('an old administrator response cannot disclose account data after switching to an ordinary user', async ({
  page,
  server,
  context,
}) => {
  let releaseList!: () => void;
  server.holdList = new Promise<void>((resolve) => {
    releaseList = resolve;
  });
  await page.goto('/');
  await signIn(page);
  await openAdmin(page);
  await expect.poll(() => server.listStarted).toBe(true);

  // A second tab uses the same real SDK and triggers its cross-tab auth event.
  const secondTab = await context.newPage();
  await server.install(secondTab);
  await secondTab.goto('/');
  await expect(secondTab.locator('.app-shell')).toBeVisible();
  await secondTab
    .locator('.sidebar')
    .getByRole('button', { name: 'تسجيل الخروج', exact: true })
    .click();
  await expect(secondTab.getByRole('heading', { name: 'أهلاً بعودتك.' })).toBeVisible();
  await signIn(secondTab, 'member_one');
  await expect(page.locator('.app-shell')).toBeVisible();
  await expect(page).toHaveURL(/#dashboard$/);
  const delayedResponse = page.waitForResponse(
    (response) => response.url() === `${HOST}/functions/v1/account-admin`,
  );
  releaseList();
  await delayedResponse;
  // Check after the delayed response arrived, rather than before it could render.
  await expect(page.getByText('member_one@example.com', { exact: true })).toHaveCount(0);
  await expect(
    page.locator('.sidebar').getByRole('button', { name: 'إدارة الحسابات', exact: true }),
  ).toHaveCount(0);
  expect(server.adminRequests.every((request) => request.actor === ADMIN_ID)).toBe(true);
  await secondTab.close();
});

for (const status of ['suspended', 'deleted'] as const) {
  test(`a restored ${status} session cannot mount or fetch its cached workspace`, async ({
    page,
    server,
  }) => {
    server.access.get(MEMBER_ID)!.status = status;
    const cached = createEmptyWorkspace('PRIVATE-CACHED-MARKER');
    await page.addInitScript(
      ({ session, data, userId }) => {
        localStorage.setItem('madar:auth', JSON.stringify(session));
        localStorage.setItem(
          `madar:cloud:${userId}`,
          JSON.stringify({ version: 1, data, baseRevision: 1, dirty: false }),
        );
      },
      { session: server.session(server.users[1]), data: cached, userId: MEMBER_ID },
    );
    await page.goto('/#tasks');
    await expect(
      page.getByRole('heading', { name: status === 'suspended' ? /موقوف/ : /محذوف/ }),
    ).toBeVisible();
    await expect(page.locator('.app-shell')).toHaveCount(0);
    await expect(page.getByText('PRIVATE-CACHED-MARKER', { exact: false })).toHaveCount(0);
    expect(server.accessRequests).toContain(MEMBER_ID);
    expect(server.workspaceReads).toEqual([]);
    expect(server.workspaceWrites).toEqual([]);
  });

  test(`a ${status} account loses its workspace after a server access refresh`, async ({
    page,
    server,
  }) => {
    await page.goto('/');
    await signIn(page, 'member_one');
    const before = server.accessRequests.length;
    server.access.get(MEMBER_ID)!.status = status;
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await expect.poll(() => server.accessRequests.length).toBeGreaterThan(before);
    await expect(page.locator('.app-shell')).not.toBeVisible();
    await expect(
      page.getByRole('heading', { name: status === 'suspended' ? /موقوف/ : /محذوف/ }),
    ).toBeVisible();
    await expect(page.getByRole('button', { name: 'مهمة جديدة', exact: true })).toHaveCount(0);
    expect(server.workspaceWrites).toEqual([]);
  });
}
