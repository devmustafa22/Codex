import { Buffer } from 'node:buffer';
import { test as base, expect } from '@playwright/test';
import type { Page, Route } from '@playwright/test';
import { createEmptyWorkspace } from '../src/lib/cloud-workspace';
import type { AppData } from '../src/lib/types';

const HOST = 'https://madar-test.supabase.co';
const PASSWORD = 'PrivateTest123!';
const USER_A = '10000000-0000-4000-8000-000000000001';
const USER_B = '10000000-0000-4000-8000-000000000002';

type MockUser = {
  id: string;
  email: string;
  aud: string;
  role: string;
  user_metadata: { username: string; display_name: string };
  app_metadata: { provider: string; providers: string[] };
  created_at: string;
  updated_at: string;
  email_confirmed_at: string;
  identities: { identity_id: string; id: string; user_id: string; provider: string }[];
};
type RemoteRow = {
  user_id: string;
  payload: AppData;
  revision: number;
  updated_at: string;
};

function mockUser(id: string, username: string, name: string): MockUser {
  const now = new Date().toISOString();
  return {
    id,
    email: `${username}@example.com`,
    aud: 'authenticated',
    role: 'authenticated',
    user_metadata: { username, display_name: name },
    app_metadata: { provider: 'email', providers: ['email'] },
    created_at: now,
    updated_at: now,
    email_confirmed_at: now,
    identities: [{ identity_id: id, id, user_id: id, provider: 'email' }],
  };
}

/** The test server never stores or transmits actual user credentials. */
class MockSupabase {
  users = [mockUser(USER_A, 'mustafa', 'مصطفى'), mockUser(USER_B, 'second_user', 'الحساب الثاني')];
  rows = new Map<string, RemoteRow>();
  saveAttempts: Record<string, unknown>[] = [];
  nativeLogins: string[] = [];
  usernameLogins: string[] = [];
  registrations: Record<string, unknown>[] = [];
  passwordChanges: string[] = [];
  recoveryEmails: string[] = [];
  failReads = false;
  failWrites = false;

  private token(user: MockUser) {
    const now = Math.floor(Date.now() / 1000);
    const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
    return `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({
      sub: user.id,
      aud: 'authenticated',
      role: 'authenticated',
      exp: now + 3600,
      iat: now,
      iss: `${HOST}/auth/v1`,
      session_id: '20000000-0000-4000-8000-000000000001',
    })}.test_signature`;
  }

  private session(user: MockUser) {
    return {
      access_token: this.token(user),
      token_type: 'bearer',
      expires_in: 3600,
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      refresh_token: `test-refresh:${user.id}`,
      user,
    };
  }

  private userForToken(token: string): MockUser | undefined {
    try {
      const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString());
      return this.users.find((user) => user.id === payload.sub);
    } catch {
      return undefined;
    }
  }

  private async respond(route: Route, status: number, value?: unknown) {
    await route.fulfill({
      status,
      headers: {
        'content-type': 'application/json',
        'access-control-allow-origin': '*',
        'access-control-allow-headers': '*',
        'access-control-allow-methods': 'GET,POST,PUT,OPTIONS',
      },
      ...(value === undefined ? {} : { body: JSON.stringify(value) }),
    });
  }

  async install(page: Page) {
    await page.route(`${HOST}/**`, async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      const body = request.postData() ? request.postDataJSON() : {};
      const bearer = (request.headers().authorization ?? '').replace(/^Bearer\s+/i, '');
      const authenticated = this.userForToken(bearer);
      if (request.method() === 'OPTIONS') return this.respond(route, 200, {});

      if (url.pathname === '/functions/v1/username-login') {
        this.usernameLogins.push(body.identifier);
        const user = this.users.find((item) => item.user_metadata.username === body.identifier);
        if (!user || body.password !== PASSWORD) {
          return this.respond(route, 401, {
            error: 'invalid_credentials',
            code: 'invalid_credentials',
          });
        }
        return this.respond(route, 200, this.session(user));
      }
      if (url.pathname === '/auth/v1/token') {
        const grant = url.searchParams.get('grant_type');
        if (grant === 'password') {
          this.nativeLogins.push(body.email);
          const user = this.users.find((item) => item.email === body.email);
          if (!user || body.password !== PASSWORD) {
            return this.respond(route, 400, {
              error: 'invalid_grant',
              error_description: 'Invalid login credentials',
              code: 'invalid_credentials',
            });
          }
          return this.respond(route, 200, this.session(user));
        }
        if (grant === 'pkce') {
          if (body.auth_code === 'expired-recovery-code')
            return this.respond(route, 400, {
              code: 'flow_state_expired',
              message: 'Recovery link expired',
            });
          return this.respond(route, 200, this.session(this.users[0]));
        }
        const user = this.users.find((item) => body.refresh_token === `test-refresh:${item.id}`);
        return user
          ? this.respond(route, 200, this.session(user))
          : this.respond(route, 401, { message: 'Invalid refresh token' });
      }
      if (url.pathname === '/auth/v1/user') {
        if (!authenticated) return this.respond(route, 401, { message: 'Not authenticated' });
        if (request.method() === 'PUT') this.passwordChanges.push(body.password);
        return this.respond(route, 200, authenticated);
      }
      if (url.pathname === '/auth/v1/logout') return this.respond(route, 204);
      if (url.pathname === '/auth/v1/signup') {
        this.registrations.push(body);
        const user = mockUser(
          '10000000-0000-4000-8000-000000000003',
          body.data.username,
          body.data.display_name,
        );
        user.email = body.email;
        return this.respond(route, 200, user);
      }
      if (url.pathname === '/auth/v1/recover') {
        this.recoveryEmails.push(body.email);
        return this.respond(route, 200, {});
      }
      if (url.pathname === '/rest/v1/rpc/get_account_access') {
        return authenticated
          ? this.respond(route, 200, { role: 'user', status: 'active' })
          : this.respond(route, 401, { code: '42501', message: 'Not authenticated' });
      }
      if (url.pathname === '/rest/v1/user_workspaces') {
        if (this.failReads) {
          return this.respond(route, 503, {
            code: 'PGRST001',
            message: 'Database temporarily unavailable',
          });
        }
        if (!authenticated)
          return this.respond(route, 401, { code: '42501', message: 'Not authenticated' });
        const ownerFilter = url.searchParams.get('user_id');
        const row =
          ownerFilter === `eq.${authenticated.id}` ? this.rows.get(authenticated.id) : undefined;
        return this.respond(route, 200, row ? [row] : []);
      }
      if (url.pathname === '/rest/v1/rpc/save_workspace') {
        this.saveAttempts.push(body);
        if (this.failWrites) return route.abort('internetdisconnected');
        if (!authenticated || body.p_user_id !== authenticated.id) {
          return this.respond(route, 403, { code: '42501', message: 'Account mismatch' });
        }
        const current = this.rows.get(authenticated.id);
        if ((current?.revision ?? 0) !== body.p_expected_revision) {
          return this.respond(route, 409, { code: '40001', message: 'workspace_conflict' });
        }
        const row: RemoteRow = {
          user_id: authenticated.id,
          payload: body.p_payload,
          revision: body.p_expected_revision + 1,
          updated_at: new Date().toISOString(),
        };
        this.rows.set(authenticated.id, row);
        return this.respond(route, 200, [row]);
      }
      return this.respond(route, 404, { message: `Unhandled mock endpoint: ${url.pathname}` });
    });
  }
}

const test = base.extend<{ cloud: MockSupabase; appErrors: string[] }>({
  cloud: async ({ page }, use) => {
    const cloud = new MockSupabase();
    await cloud.install(page);
    await use(cloud);
  },
  appErrors: [
    async ({ page }, use) => {
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      await use(errors);
      expect(errors, 'No uncaught application errors during cloud account flows').toEqual([]);
    },
    { auto: true },
  ],
});

async function signIn(page: Page, identifier = 'mustafa', password = PASSWORD) {
  await page.getByLabel('اسم المستخدم أو البريد الإلكتروني').fill(identifier);
  await page.locator('#auth-password').fill(password);
  await page.getByRole('button', { name: 'ادخل إلى مساحتك', exact: true }).click();
}

async function navigate(page: Page, label: string, pageId: string) {
  const menu = page.getByRole('button', { name: 'فتح القائمة', exact: true });
  if (await menu.isVisible()) await menu.click();
  await page
    .locator('.sidebar')
    .getByRole('button', { name: new RegExp(`^${label}(?:\\s|$)`) })
    .click();
  await expect(page).toHaveURL(new RegExp(`#${pageId}$`));
}

async function addTask(page: Page, title: string) {
  await navigate(page, 'مهامي', 'tasks');
  await page.getByRole('button', { name: 'مهمة جديدة', exact: true }).click();
  const editor = page.getByRole('dialog', { name: 'مهمة جديدة', exact: true });
  await editor.getByLabel('اسم المهمة').fill(title);
  await editor.getByRole('button', { name: 'إضافة المهمة', exact: true }).click();
  await expect(editor).not.toBeVisible();
}

async function noOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
    await page.evaluate(() => window.innerWidth + 1),
  );
}

test('username login, empty account, cloud task persistence, signout, and account isolation', async ({
  page,
  cloud,
}) => {
  await page.addInitScript((data) => localStorage.setItem('madar:data:v1', JSON.stringify(data)), {
    ...createEmptyWorkspace('بيانات التجربة القديمة'),
    tasks: [],
  });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'أهلاً بعودتك.' })).toBeVisible();
  await expect(page.locator('.app-shell')).not.toBeVisible();
  await signIn(page, 'mustafa', 'WrongPassword123!');
  await expect(page.getByRole('alert')).toContainText('اسم المستخدم أو كلمة المرور غير صحيحة');
  await signIn(page);
  await expect(page.locator('.app-shell')).toBeVisible();
  expect(cloud.saveAttempts).toHaveLength(0);
  expect(cloud.rows.size).toBe(0);
  const emptyCache = await page.evaluate(
    (id) => JSON.parse(localStorage.getItem(`madar:cloud:${id}`)!),
    USER_A,
  );
  expect(emptyCache.data.tasks).toEqual([]);
  expect(emptyCache.data.skills).toEqual([]);
  expect(emptyCache.data.profile.name).toBe('مصطفى');

  await addTask(page, 'مهمة محفوظة بحسابي');
  await expect
    .poll(() => cloud.rows.get(USER_A)?.payload.tasks[0]?.title)
    .toBe('مهمة محفوظة بحسابي');
  expect(cloud.saveAttempts[0]).toMatchObject({ p_user_id: USER_A, p_expected_revision: 0 });
  await page.reload();
  await expect(page.getByRole('button', { name: 'مهمة محفوظة بحسابي', exact: true })).toBeVisible();
  await page.locator('.sidebar').getByRole('button', { name: 'تسجيل الخروج', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'أهلاً بعودتك.' })).toBeVisible();
  await signIn(page, 'second_user@example.com');
  await expect(page.locator('.app-shell')).toBeVisible();
  await navigate(page, 'مهامي', 'tasks');
  await expect(
    page.getByRole('button', { name: 'مهمة محفوظة بحسابي', exact: true }),
  ).not.toBeVisible();
  expect(cloud.rows.has(USER_B)).toBe(false);
  expect(cloud.nativeLogins).toContain('second_user@example.com');
  expect(cloud.usernameLogins).toEqual(['mustafa', 'mustafa']);
});

test('failed first read blocks overwrites, while failed writes survive reload and explicit retry', async ({
  page,
  cloud,
}) => {
  cloud.failReads = true;
  await page.goto('/');
  await signIn(page, 'mustafa@example.com');
  // The SDK retries failed GETs with 1s/2s/4s backoff before reporting offline.
  await expect(page.getByRole('heading', { name: 'تعذّر تحميل مساحتك' })).toBeVisible({
    timeout: 12000,
  });
  expect(cloud.saveAttempts).toHaveLength(0);
  await expect(page.locator('.app-shell')).not.toBeVisible();
  cloud.failReads = false;
  await page.getByRole('button', { name: 'إعادة المحاولة', exact: true }).click();
  await expect(page.locator('.app-shell')).toBeVisible();

  cloud.failWrites = true;
  await addTask(page, 'تعديل يحتاج اتصال');
  await navigate(page, 'الإعدادات', 'settings');
  await expect(page.getByRole('button', { name: 'إعادة المزامنة', exact: true })).toBeVisible();
  const cache = await page.evaluate(
    (id) => JSON.parse(localStorage.getItem(`madar:cloud:${id}`)!),
    USER_A,
  );
  expect(cache).toMatchObject({ dirty: true, baseRevision: 0 });
  expect(cache.data.tasks[0].title).toBe('تعديل يحتاج اتصال');
  expect(cloud.rows.size).toBe(0);
  await page.reload();
  await expect(page.getByRole('button', { name: 'إعادة المزامنة', exact: true })).toBeVisible();
  cloud.failWrites = false;
  await page.getByRole('button', { name: 'إعادة المزامنة', exact: true }).click();
  await expect
    .poll(() => cloud.rows.get(USER_A)?.payload.tasks[0]?.title)
    .toBe('تعديل يحتاج اتصال');
  await expect(page.locator('.sync-summary strong')).toHaveText('محفوظ في السحابة');
  await expect
    .poll(async () =>
      page.evaluate((id) => JSON.parse(localStorage.getItem(`madar:cloud:${id}`)!).dirty, USER_A),
    )
    .toBe(false);
});

test('cross-device conflicts require explicit reload or one protected overwrite', async ({
  page,
  cloud,
}) => {
  await page.goto('/');
  await signIn(page);
  await expect(page.locator('.app-shell')).toBeVisible();
  await addTask(page, 'مهمة أولى');
  await expect.poll(() => cloud.rows.get(USER_A)?.revision).toBe(1);
  const otherDevice = structuredClone(cloud.rows.get(USER_A)!);
  otherDevice.revision = 2;
  otherDevice.payload.profile.name = 'تعديل الهاتف';
  cloud.rows.set(USER_A, otherDevice);
  await addTask(page, 'مهمة محلية معلقة');
  await navigate(page, 'الإعدادات', 'settings');
  await expect(page.getByRole('button', { name: 'تحميل نسخة السحابة', exact: true })).toBeVisible();
  expect(cloud.rows.get(USER_A)?.payload.tasks).toHaveLength(1);
  await page.getByRole('button', { name: 'تحميل نسخة السحابة', exact: true }).click();
  const reload = page.getByRole('dialog', { name: 'تحميل نسخة السحابة؟', exact: true });
  await reload.getByRole('button', { name: 'تأكيد', exact: true }).click();
  await expect(page.getByLabel('اسمك', { exact: true })).toHaveValue('تعديل الهاتف');
  await expect(page.locator('.sync-summary strong')).toHaveText('محفوظ في السحابة');

  const newerDevice = structuredClone(cloud.rows.get(USER_A)!);
  newerDevice.revision = 3;
  newerDevice.payload.profile.name = 'نسخة أحدث من الهاتف';
  cloud.rows.set(USER_A, newerDevice);
  await page.getByLabel('اسمك', { exact: true }).fill('النسخة المحلية المعتمدة');
  await page.getByRole('button', { name: 'حفظ التغييرات', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'اعتماد النسخة الحالية', exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'اعتماد النسخة الحالية', exact: true }).click();
  await page
    .getByRole('dialog', { name: 'اعتماد النسخة الحالية؟', exact: true })
    .getByRole('button', { name: 'تأكيد', exact: true })
    .click();
  await expect.poll(() => cloud.rows.get(USER_A)?.revision).toBe(4);
  expect(cloud.rows.get(USER_A)?.payload.profile.name).toBe('النسخة المحلية المعتمدة');
  await expect(page.locator('.sync-summary strong')).toHaveText('محفوظ في السحابة');
});

test('registration requires confirmation and password recovery exchanges a PKCE link before changing password', async ({
  page,
  cloud,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'حساب جديد', exact: true }).click();
  await page.locator('#auth-name').fill('حساب جديد');
  await page.locator('#auth-username').fill('new_user');
  await page.locator('#auth-email').fill('new_user@example.com');
  await page.locator('#auth-password').fill(PASSWORD);
  await page.locator('#auth-confirmation').fill(PASSWORD);
  await page.getByRole('button', { name: 'أنشئ حسابي', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('فعّل بريدك');
  expect(cloud.registrations[0]).toMatchObject({
    data: { username: 'new_user', display_name: 'حساب جديد' },
  });
  await expect(page.locator('.app-shell')).not.toBeVisible();

  await page.getByRole('button', { name: 'نسيت كلمة المرور؟', exact: true }).click();
  await page.locator('#auth-email').fill('mustafa@example.com');
  await page.getByRole('button', { name: 'أرسل رابط الاسترجاع', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('رسالة استرجاع');
  expect(cloud.recoveryEmails).toEqual(['mustafa@example.com']);
  await page.goto('/?auth=recovery&code=mock-recovery-code');
  await expect(page.getByRole('heading', { name: 'بداية جديدة وآمنة.' })).toBeVisible();
  await page.locator('#auth-password').fill('UpdatedPassword456!');
  await page.locator('#auth-confirmation').fill('UpdatedPassword456!');
  await page.getByRole('button', { name: 'احفظ كلمة المرور', exact: true }).click();
  await expect(page.locator('.app-shell')).toBeVisible();
  expect(cloud.passwordChanges).toEqual(['UpdatedPassword456!']);
  await expect(page).not.toHaveURL(/code=|auth=recovery/);
});

test('an expired recovery link cannot reset the password of an existing signed-in account', async ({
  page,
  cloud,
}) => {
  await page.goto('/');
  await signIn(page);
  await expect(page.locator('.app-shell')).toBeVisible();
  await page.evaluate(() =>
    localStorage.setItem(
      'madar:auth-code-verifier',
      JSON.stringify('test-verifier/PASSWORD_RECOVERY'),
    ),
  );
  await page.goto('/?auth=recovery&code=expired-recovery-code');
  await expect(page.getByRole('alert')).toContainText('تعذّر فتح جلسة الاسترجاع');
  await expect(
    page.getByRole('button', { name: 'احفظ كلمة المرور', exact: true }),
  ).not.toBeVisible();
  await expect(page.locator('.app-shell')).not.toBeVisible();
  expect(cloud.passwordChanges).toEqual([]);
});

test('phone login, accessible bottom navigation, and task editing fit a 360 px screen', async ({
  page,
  cloud,
}) => {
  await page.setViewportSize({ width: 360, height: 780 });
  await page.goto('/');
  await expect(page.locator('#auth-identifier')).toBeVisible();
  await noOverflow(page);
  const submit = await page.locator('.auth-submit').boundingBox();
  expect(submit?.height).toBeGreaterThanOrEqual(44);
  await signIn(page);
  await expect(page.locator('.app-shell')).toBeVisible();
  await noOverflow(page);
  const bottomNav = page.getByRole('navigation', { name: 'التنقل السريع', exact: true });
  await expect(bottomNav).toBeVisible();
  for (const button of await bottomNav.getByRole('button').all()) {
    const box = await button.boundingBox();
    expect(box?.height).toBeGreaterThanOrEqual(44);
  }
  await bottomNav.getByRole('button', { name: 'المهام', exact: true }).click();
  await expect(page).toHaveURL(/#tasks$/);
  await page.getByRole('button', { name: 'مهمة جديدة', exact: true }).click();
  const editor = page.getByRole('dialog', { name: 'مهمة جديدة', exact: true });
  await expect(editor).toBeVisible();
  await noOverflow(page);
  await editor.getByLabel('اسم المهمة').fill('مهمة من الهاتف');
  await editor.getByRole('button', { name: 'إضافة المهمة', exact: true }).click();
  await expect.poll(() => cloud.rows.get(USER_A)?.payload.tasks[0]?.title).toBe('مهمة من الهاتف');
  await bottomNav.getByRole('button', { name: 'المزيد', exact: true }).click();
  await expect(page.locator('.sidebar')).toBeVisible();
  await expect(page.locator('.app-main')).toHaveAttribute('inert', '');
  await page.locator('.sidebar').getByRole('button', { name: 'مهاراتي', exact: true }).click();
  await expect(page).toHaveURL(/#skills$/);
  await noOverflow(page);
});
