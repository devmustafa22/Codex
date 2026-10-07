import { readFile } from 'node:fs/promises';
import { test as base, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import type { AppData } from '../src/lib/types';

const STORAGE_KEY = 'madar:data:v1';
const TODAY = '2026-10-06';

const test = base.extend<{ appErrors: string[] }>({
  appErrors: [
    async ({ page }, use) => {
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      await use(errors);
      expect(errors, 'The application should not raise uncaught browser errors').toEqual([]);
    },
    { auto: true },
  ],
});

test.beforeEach(async ({ page }) => {
  await page.clock.install({ time: new Date('2026-10-06T10:00:00Z') });
  await page.addInitScript(() => sessionStorage.setItem('madar:demo', '1'));
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
});

async function navigate(page: Page, label: string, pageId: string) {
  const menu = page.getByRole('button', { name: 'فتح القائمة', exact: true });
  if (await menu.isVisible()) await menu.click();
  await page
    .locator('.sidebar')
    .getByRole('button', { name: new RegExp(`^${label}(?:\\s|$)`) })
    .click();
  await expect(page).toHaveURL(new RegExp(`#${pageId}$`));
}

async function storedData(page: Page): Promise<AppData> {
  return page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? 'null'), STORAGE_KEY);
}

async function expectNoPageOverflow(page: Page) {
  const dimensions = await page.evaluate(() => ({
    content: document.documentElement.scrollWidth,
    viewport: window.innerWidth,
  }));
  expect(
    dimensions.content,
    'Content should fit the viewport without horizontal page scrolling',
  ).toBeLessThanOrEqual(dimensions.viewport + 1);
}

test('creates, edits, completes, and persists a task after reload', async ({ page }) => {
  await navigate(page, 'مهامي', 'tasks');
  await page.getByRole('button', { name: 'مهمة جديدة', exact: true }).click();
  let editor = page.getByRole('dialog', { name: 'مهمة جديدة', exact: true });
  await editor.getByLabel('اسم المهمة').fill('خطة اختبار الواجهة');
  await editor.getByLabel('تفاصيل وملاحظات').fill('التحقق من الحفظ والتعديل');
  await editor.getByLabel('الموعد النهائي').fill(TODAY);
  await editor.getByLabel('الوقت المتوقع بالدقائق').fill('45');
  await editor.getByRole('combobox', { name: 'الأولوية', exact: true }).selectOption('high');
  await editor.getByRole('button', { name: 'إضافة المهمة', exact: true }).click();
  await expect(editor).not.toBeVisible();
  await expect(page.getByRole('button', { name: 'خطة اختبار الواجهة', exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'تعديل خطة اختبار الواجهة', exact: true }).click();
  editor = page.getByRole('dialog', { name: 'تعديل المهمة', exact: true });
  await editor.getByLabel('اسم المهمة').fill('خطة اختبار معدّلة');
  await editor.getByLabel('الوقت المتوقع بالدقائق').fill('55');
  await editor.getByRole('button', { name: 'حفظ التعديلات', exact: true }).click();
  // Completion moves the task to another column and remounts its checkbox.
  await page.getByRole('checkbox', { name: 'إكمال خطة اختبار معدّلة', exact: true }).click();
  await expect(
    page.getByRole('checkbox', { name: 'إعادة فتح خطة اختبار معدّلة', exact: true }),
  ).toBeChecked();
  await expect
    .poll(
      async () =>
        (await storedData(page)).tasks.find((task) => task.title === 'خطة اختبار معدّلة')?.status,
    )
    .toBe('done');

  await page.reload();
  await expect(
    page.getByRole('checkbox', { name: 'إعادة فتح خطة اختبار معدّلة', exact: true }),
  ).toBeChecked();
  const saved = (await storedData(page)).tasks.find((task) => task.title === 'خطة اختبار معدّلة');
  expect(saved).toMatchObject({
    status: 'done',
    priority: 'high',
    estimatedMinutes: 55,
    dueDate: TODAY,
    completedAt: TODAY,
  });
});

test('creates a skill and changes its progress through actual linked journal activity', async ({
  page,
}) => {
  await navigate(page, 'مهاراتي', 'skills');
  await page.getByRole('button', { name: 'مهارة جديدة', exact: true }).click();
  const skillEditor = page.getByRole('dialog', { name: 'ابدأ مهارة جديدة', exact: true });
  await skillEditor.getByLabel('اسم المهارة').fill('مهارة التحقق العملي');
  await skillEditor.getByLabel('المجال', { exact: true }).fill('برمجة');
  await skillEditor.getByLabel('هدف التعلّم الكلي (ساعات)', { exact: true }).fill('2');
  await skillEditor.getByLabel('الهدف الأسبوعي (ساعات)', { exact: true }).fill('1');
  await skillEditor.getByLabel('وقت تعلّم سابق (ساعات)').fill('0');
  await skillEditor.getByRole('button', { name: 'إضافة المهارة', exact: true }).click();
  let skillCard = page
    .locator('article.skill-card')
    .filter({ has: page.getByRole('button', { name: 'مهارة التحقق العملي', exact: true }) });
  await expect(skillCard.locator('.skill-progress-heading strong')).toHaveText('0%');

  await navigate(page, 'سجلّ الرحلة', 'journal');
  await page.getByRole('button', { name: 'تسجيل نشاط', exact: true }).first().click();
  let entryEditor = page.getByRole('dialog', { name: 'سجّل خطوة جديدة', exact: true });
  await entryEditor.getByLabel('عنوان النشاط', { exact: true }).fill('جلسة تطبيق اختبارية');
  await entryEditor.getByLabel('الوقت بالدقائق', { exact: true }).fill('60');
  await entryEditor
    .getByRole('combobox', { name: 'المهارة المرتبطة', exact: true })
    .selectOption({ label: 'مهارة التحقق العملي' });
  await entryEditor.getByRole('button', { name: 'حفظ النشاط', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'جلسة تطبيق اختبارية', exact: true }),
  ).toBeVisible();
  await navigate(page, 'مهاراتي', 'skills');
  skillCard = page
    .locator('article.skill-card')
    .filter({ has: page.getByRole('button', { name: 'مهارة التحقق العملي', exact: true }) });
  await expect(skillCard.locator('.skill-progress-heading strong')).toHaveText('50%');

  await navigate(page, 'سجلّ الرحلة', 'journal');
  await page.getByRole('button', { name: 'تعديل جلسة تطبيق اختبارية', exact: true }).click();
  entryEditor = page.getByRole('dialog', { name: 'تعديل النشاط', exact: true });
  await entryEditor.getByLabel('الوقت بالدقائق', { exact: true }).fill('30');
  await entryEditor.getByRole('button', { name: 'حفظ التعديلات', exact: true }).click();
  await navigate(page, 'مهاراتي', 'skills');
  await expect(skillCard.locator('.skill-progress-heading strong')).toHaveText('25%');
  await page.reload();
  await expect(skillCard.locator('.skill-progress-heading strong')).toHaveText('25%');
});

test('creates, edits, and deletes calendar events and navigates month, week, and year', async ({
  page,
}) => {
  await navigate(page, 'التقويم', 'calendar');
  await page.getByRole('button', { name: 'موعد جديد', exact: true }).click();
  let editor = page.getByRole('dialog', { name: 'موعد جديد', exact: true });
  await editor.getByLabel('عنوان الموعد', { exact: true }).fill('موعد التحقق العملي');
  await editor.getByLabel('التاريخ', { exact: true }).fill(TODAY);
  await editor.getByLabel('وقت البداية', { exact: true }).fill('13:45');
  await editor.getByLabel('المدة بالدقائق', { exact: true }).fill('75');
  await editor.getByRole('combobox', { name: 'نوع الموعد', exact: true }).selectOption('work');
  await editor.getByRole('button', { name: 'إضافة الموعد', exact: true }).click();
  await expect(
    page.locator('.calendar-day-detail').getByText('موعد التحقق العملي', { exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'تعديل موعد التحقق العملي', exact: true }).click();
  editor = page.getByRole('dialog', { name: 'تعديل الموعد', exact: true });
  await editor.getByLabel('عنوان الموعد', { exact: true }).fill('موعد تم تعديله');
  await editor.getByLabel('وقت البداية', { exact: true }).fill('14:30');
  await editor.getByRole('button', { name: 'حفظ التعديلات', exact: true }).click();
  await page.reload();
  await expect(
    page.locator('.calendar-day-detail').getByText('موعد تم تعديله', { exact: true }),
  ).toBeVisible();
  await expect(
    page.locator('.calendar-day-detail').getByText('14:30', { exact: true }),
  ).toBeVisible();

  const period = page.locator('.calendar-navigation h2');
  const initialMonth = await period.innerText();
  await page.getByRole('button', { name: 'الفترة التالية', exact: true }).click();
  await expect(period).not.toHaveText(initialMonth);
  await page.getByRole('button', { name: 'الفترة السابقة', exact: true }).click();
  await expect(period).toHaveText(initialMonth);
  await page.getByRole('button', { name: 'أسبوع', exact: true }).click();
  await expect(page.locator('.calendar-day')).toHaveCount(7);
  const initialWeek = await period.innerText();
  await page.getByRole('button', { name: 'الفترة التالية', exact: true }).click();
  await expect(period).not.toHaveText(initialWeek);
  await page.getByRole('button', { name: 'الفترة السابقة', exact: true }).click();
  await expect(period).toHaveText(initialWeek);
  await page.getByRole('button', { name: 'سنة', exact: true }).click();
  await expect(page.locator('.mini-month')).toHaveCount(12);
  await expect(period).toHaveText('2026');
  await page.getByRole('button', { name: 'الفترة التالية', exact: true }).click();
  await expect(period).toHaveText('2027');
  await page.getByRole('button', { name: 'الفترة السابقة', exact: true }).click();
  await page.locator('.mini-month-heading').nth(9).click();
  await expect(page.getByRole('button', { name: 'شهر', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await page.locator('.calendar-day.today').click();
  await page.getByRole('button', { name: 'حذف موعد تم تعديله', exact: true }).click();
  await page
    .getByRole('dialog', { name: 'حذف الموعد؟', exact: true })
    .getByRole('button', { name: 'تأكيد', exact: true })
    .click();
  await expect(
    page.locator('.calendar-day-detail').getByText('موعد تم تعديله', { exact: true }),
  ).toHaveCount(0);
  expect((await storedData(page)).events.some((event) => event.title === 'موعد تم تعديله')).toBe(
    false,
  );
});

test('downloads a real backup, restores it, and preserves data after an invalid import', async ({
  page,
}) => {
  await navigate(page, 'الإعدادات', 'settings');
  const original = await storedData(page);
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'تنزيل نسخة احتياطية', exact: true }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe(`madar-backup-${TODAY}.json`);
  const path = await download.path();
  expect(path).not.toBeNull();
  const backup = await readFile(path!, 'utf8');
  expect(JSON.parse(backup)).toEqual(original);

  await page.getByLabel('اسمك', { exact: true }).fill('اسم مؤقت للاختبار');
  await page.getByRole('button', { name: 'حفظ التغييرات', exact: true }).click();
  await expect.poll(async () => (await storedData(page)).profile.name).toBe('اسم مؤقت للاختبار');
  await page.locator('input[type="file"]').setInputFiles({
    name: 'restored.json',
    mimeType: 'application/json',
    buffer: Buffer.from(backup),
  });
  await page
    .getByRole('dialog', { name: 'استرجاع النسخة الاحتياطية؟', exact: true })
    .getByRole('button', { name: 'تأكيد', exact: true })
    .click();
  await expect.poll(async () => storedData(page)).toEqual(original);
  await expect(page.getByLabel('اسمك', { exact: true })).toHaveValue(original.profile.name);

  const invalid = JSON.parse(backup);
  invalid.tasks[0].status = 'unsupported-status';
  const before = await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY);
  await page.locator('input[type="file"]').setInputFiles({
    name: 'invalid.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(invalid)),
  });
  await page
    .getByRole('dialog', { name: 'استرجاع النسخة الاحتياطية؟', exact: true })
    .getByRole('button', { name: 'تأكيد', exact: true })
    .click();
  await expect(page.getByRole('alert')).toContainText('النسخة الاحتياطية غير صالحة');
  expect(await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY)).toBe(before);
  await page.reload();
  expect(await storedData(page)).toEqual(original);
});

test('persists theme and keeps all profile preferences when clearing activity data', async ({
  page,
}) => {
  await navigate(page, 'الإعدادات', 'settings');
  await page.getByLabel('اسمك', { exact: true }).fill('شخصي محفوظ');
  await page.getByLabel('وصف رحلتك', { exact: true }).fill('رحلة خاصة بالتجربة');
  await page.getByLabel('هدف الأسبوع (ساعات)', { exact: true }).fill('12');
  await page.getByLabel('مدة جلسة التركيز (دقائق)', { exact: true }).fill('1');
  await page.getByRole('button', { name: 'حفظ التغييرات', exact: true }).click();
  await page.getByRole('button', { name: 'وضع ليلي', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  const profile = (await storedData(page)).profile;
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(page.getByLabel('اسمك', { exact: true })).toHaveValue('شخصي محفوظ');
  await page.getByRole('button', { name: 'مسح البيانات', exact: true }).click();
  await page
    .getByRole('dialog', { name: 'بدء مساحة جديدة؟', exact: true })
    .getByRole('button', { name: 'تأكيد', exact: true })
    .click();
  const cleared = await storedData(page);
  expect(cleared.profile).toEqual(profile);
  expect(cleared.tasks).toEqual([]);
  expect(cleared.skills).toEqual([]);
  expect(cleared.entries).toEqual([]);
  expect(cleared.events).toEqual([]);
  await expect(page.locator('.data-counts')).toHaveText('0 مهام0 مهارات0 أنشطة0 مواعيد');
  await page.reload();
  expect((await storedData(page)).profile).toEqual(profile);
});

test('finds tasks and skills through global search and opens the corresponding page', async ({
  page,
}) => {
  await page.getByRole('button', { name: /ابحث عن مهمة، مهارة أو نشاط/ }).click();
  let search = page.getByRole('dialog', { name: 'البحث في مساحتك', exact: true });
  await search.getByLabel('كلمات البحث', { exact: true }).fill('React Hooks');
  await search.getByRole('button', { name: /إكمال درس React Hooks/ }).click();
  await expect(page).toHaveURL(/#tasks$/);
  const taskEditor = page.getByRole('dialog', { name: 'تعديل المهمة', exact: true });
  await expect(taskEditor.getByLabel('اسم المهمة')).toHaveValue('إكمال درس React Hooks');
  await taskEditor.getByRole('button', { name: 'إغلاق', exact: true }).click();
  await page.keyboard.press('Control+k');
  search = page.getByRole('dialog', { name: 'البحث في مساحتك', exact: true });
  await search.getByLabel('كلمات البحث', { exact: true }).fill('تصميم واجهات المستخدم');
  await search.getByRole('button', { name: /تصميم واجهات المستخدم/ }).click();
  await expect(page).toHaveURL(/#skills$/);
  await expect(
    page.getByRole('dialog', { name: 'تصميم واجهات المستخدم', exact: true }),
  ).toBeVisible();
});

test('keeps search keyboard focus and avoids stacking dialogs over an editor', async ({ page }) => {
  await page.keyboard.press('Control+k');
  const search = page.getByRole('dialog', { name: 'البحث في مساحتك', exact: true });
  await expect(search.getByLabel('كلمات البحث', { exact: true })).toBeFocused();
  await page.keyboard.press('Control+k');
  await expect(page.getByRole('dialog')).toHaveCount(1);
  await page.keyboard.press('Escape');
  await expect(search).not.toBeVisible();
  await page.getByRole('button', { name: 'مهمة جديدة', exact: true }).click();
  const task = page.getByRole('dialog', { name: 'مهمة جديدة', exact: true });
  await expect(task.getByLabel('اسم المهمة')).toBeFocused();
  await page.keyboard.press('Control+k');
  await expect(page.getByRole('dialog')).toHaveCount(1);
  await expect(task).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(task).not.toBeVisible();
});

test('rejects a whitespace-only profile name and retains the saved profile', async ({ page }) => {
  await navigate(page, 'الإعدادات', 'settings');
  const original = (await storedData(page)).profile;
  await page.getByLabel('اسمك', { exact: true }).fill('   ');
  await page.getByRole('button', { name: 'حفظ التغييرات', exact: true }).click();
  await expect(page.getByRole('alert')).toBeVisible();
  expect((await storedData(page)).profile).toEqual(original);
  await page.reload();
  await expect(page.getByLabel('اسمك', { exact: true })).toHaveValue(original.name);
});

test('navigates every screen on mobile without page overflow, including calendar views', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const screens = [
    ['نظرة عامة', 'dashboard', /مصطفى/],
    ['مهامي', 'tasks', /^مهامي$/],
    ['مهاراتي', 'skills', /^رحلة مهاراتي$/],
    ['التقويم', 'calendar', /^التقويم$/],
    ['سجلّ الرحلة', 'journal', /^سجلّ رحلتك$/],
    ['التحليلات', 'insights', /^إحصائياتك، قصة تقدّمك$/],
    ['الإعدادات', 'settings', /^الإعدادات$/],
  ] as const;
  for (const [label, id, heading] of screens) {
    await navigate(page, label, id);
    await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible();
    await expectNoPageOverflow(page);
    await expect(page.getByRole('button', { name: 'فتح القائمة', exact: true })).toBeVisible();
  }
  await navigate(page, 'التقويم', 'calendar');
  for (const label of ['أسبوع', 'سنة', 'شهر']) {
    await page.getByRole('button', { name: label, exact: true }).click();
    await expectNoPageOverflow(page);
  }
  await navigate(page, 'مهامي', 'tasks');
  await page.getByRole('button', { name: 'قائمة', exact: true }).click();
  await expectNoPageOverflow(page);
});

test('short screens can reach sidebar bottom and page footer without clipped controls', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 600 });
  const sidebar = page.locator('.sidebar');
  const lowerStatus = sidebar.locator('.local-save');
  await lowerStatus.scrollIntoViewIfNeeded();
  const bounds = await lowerStatus.boundingBox();
  expect(bounds).not.toBeNull();
  expect(bounds!.y).toBeGreaterThanOrEqual(0);
  expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(600);
  expect(await sidebar.evaluate((element) => getComputedStyle(element).overflowY)).toBe('auto');
  const footer = page.locator('.app-footer');
  await footer.scrollIntoViewIfNeeded();
  await expect(footer).toBeInViewport();
  await page.setViewportSize({ width: 360, height: 640 });
  await footer.scrollIntoViewIfNeeded();
  const footerBounds = await footer.boundingBox();
  const navBounds = await page.locator('.mobile-bottom-nav').boundingBox();
  expect(footerBounds!.y + footerBounds!.height).toBeLessThanOrEqual(navBounds!.y);
  await expectNoPageOverflow(page);
});

test('finishes one minute of focus while navigating and records exactly one linked session', async ({
  page,
}) => {
  await navigate(page, 'الإعدادات', 'settings');
  await page.getByLabel('مدة جلسة التركيز (دقائق)', { exact: true }).fill('1');
  await page.getByRole('button', { name: 'حفظ التغييرات', exact: true }).click();
  await navigate(page, 'نظرة عامة', 'dashboard');
  await expect(page.getByRole('timer')).toHaveText('01:00');
  await page
    .getByLabel('مهارة جلسة التركيز', { exact: true })
    .selectOption({ label: 'تطوير الويب' });
  const before = await storedData(page);
  await page.getByRole('button', { name: 'ابدأ التركيز', exact: true }).click();
  await page.clock.runFor(20_000);
  await navigate(page, 'مهامي', 'tasks');
  await page.clock.runFor(45_000);
  await expect
    .poll(async () => (await storedData(page)).entries.length)
    .toBe(before.entries.length + 1);
  await navigate(page, 'نظرة عامة', 'dashboard');
  await expect(page.getByRole('timer')).toHaveText('01:00');
  await expect(page.getByRole('button', { name: 'ابدأ التركيز', exact: true })).toBeVisible();
  const after = await storedData(page);
  const newEntries = after.entries.filter(
    (entry) => !before.entries.some((old) => old.id === entry.id),
  );
  expect(newEntries).toHaveLength(1);
  expect(newEntries[0]).toMatchObject({
    title: 'جلسة تركيز',
    minutes: 1,
    kind: 'focus',
    date: TODAY,
    skillId: 'skill-code',
  });
  await navigate(page, 'سجلّ الرحلة', 'journal');
  await expect(page.getByRole('heading', { name: 'جلسة تركيز', exact: true })).toHaveCount(1);
  await page.clock.runFor(120_000);
  await navigate(page, 'مهاراتي', 'skills');
  await navigate(page, 'نظرة عامة', 'dashboard');
  expect(
    (await storedData(page)).entries.filter(
      (entry) => !before.entries.some((old) => old.id === entry.id),
    ),
  ).toHaveLength(1);
});

test('preserves corrupt saved data until an explicit reset and then resumes saving', async ({
  page,
}) => {
  const corrupt = '{invalid original';
  await page.evaluate(({ key, value }) => localStorage.setItem(key, value), {
    key: STORAGE_KEY,
    value: corrupt,
  });
  await page.reload();
  await expect(page.getByRole('alert')).toContainText('البيانات الأصلية دون استبدالها');
  expect(await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY)).toBe(corrupt);
  await navigate(page, 'الإعدادات', 'settings');
  await page.getByRole('button', { name: 'استعادة المثال', exact: true }).click();
  await page
    .getByRole('dialog', { name: 'استعادة البيانات التجريبية؟', exact: true })
    .getByRole('button', { name: 'تأكيد', exact: true })
    .click();
  await expect(page.getByRole('alert')).toHaveCount(0);
  expect((await storedData(page)).version).toBe(1);
  await page.getByLabel('اسمك', { exact: true }).fill('حفظ بعد الاستعادة');
  await page.getByRole('button', { name: 'حفظ التغييرات', exact: true }).click();
  await page.reload();
  await expect(page.getByLabel('اسمك', { exact: true })).toHaveValue('حفظ بعد الاستعادة');
});
