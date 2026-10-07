import { test as base, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import type { AppData } from '../src/lib/types';

const STORAGE_KEY = 'madar:data:v1';
const LANGUAGE_KEY = 'madar:language';
const PERSONAL_TITLE = 'خطتي الشخصية — Build a portfolio';
const PERSONAL_NOTE = 'لا تترجم هذا النص — Keep my own words unchanged.';

type Language = 'en' | 'ar';
type Screen = 'dashboard' | 'tasks' | 'skills' | 'calendar' | 'journal' | 'insights' | 'settings';

const labels: Record<Language, Record<Screen, string>> = {
  en: {
    dashboard: 'Overview',
    tasks: 'My tasks',
    skills: 'My skills',
    calendar: 'Calendar',
    journal: 'Journey journal',
    insights: 'Insights',
    settings: 'Settings',
  },
  ar: {
    dashboard: 'نظرة عامة',
    tasks: 'مهامي',
    skills: 'مهاراتي',
    calendar: 'التقويم',
    journal: 'سجلّ الرحلة',
    insights: 'التحليلات',
    settings: 'الإعدادات',
  },
};

const test = base.extend<{ browserErrors: string[] }>({
  browserErrors: [
    async ({ page }, use) => {
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      await use(errors);
      expect(errors, 'Language changes should not raise uncaught browser errors').toEqual([]);
    },
    { auto: true },
  ],
});

test.beforeEach(async ({ page }) => {
  await page.clock.install({ time: new Date('2026-10-07T10:00:00Z') });
  // Enter the real local demo without preselecting Arabic or seeding a language preference.
  await page.addInitScript(() => sessionStorage.setItem('madar:demo', '1'));
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
});

async function storedData(page: Page): Promise<AppData> {
  return page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? 'null'), STORAGE_KEY);
}

function personalContent(data: AppData) {
  const { language: _language, textSize: _textSize, ...profile } = data.profile;
  return {
    profile,
    skills: data.skills,
    tasks: data.tasks,
    entries: data.entries,
    events: data.events,
  };
}

async function switchLanguage(page: Page, next: Language) {
  const label = next === 'ar' ? 'Switch to Arabic' : 'التحويل إلى الإنجليزية';
  await page.getByRole('button', { name: label, exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('lang', next);
  await expect(page.locator('html')).toHaveAttribute('dir', next === 'ar' ? 'rtl' : 'ltr');
}

async function navigate(page: Page, screen: Screen, language: Language) {
  const menu = page.getByRole('button', {
    name: language === 'en' ? 'Open menu' : 'فتح القائمة',
    exact: true,
  });
  if (await menu.isVisible()) await menu.click();
  await page
    .locator('.sidebar')
    .getByRole('button', { name: new RegExp(`^${labels[language][screen]}(?:\\s|$)`) })
    .click();
  await expect(page).toHaveURL(new RegExp(`#${screen}$`));
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
}

async function expectNoOverflow(page: Page, context: string) {
  const dimensions = await page.evaluate(() => ({
    content: document.documentElement.scrollWidth,
    viewport: window.innerWidth,
  }));
  expect(dimensions.content, context).toBeLessThanOrEqual(dimensions.viewport + 1);
}

test('a fresh demo defaults to English, LTR navigation, and English dates and titles', async ({
  page,
}) => {
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');
  await expect(page).toHaveTitle('Overview — Madar');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(/^Welcome back,/);
  await expect(page.locator('.topbar-date')).toContainText('October');
  await expect(page.getByRole('button', { name: 'Switch to Arabic', exact: true })).toBeVisible();
  await expect(page.locator('.sidebar').getByRole('button', { name: 'My tasks' })).toBeVisible();
  const sidebar = await page.locator('.sidebar').boundingBox();
  expect(sidebar).not.toBeNull();
  expect(sidebar!.x, 'English places the desktop sidebar on the left').toBeLessThanOrEqual(1);
  expect(await page.locator('body').innerText()).not.toMatch(
    /\b(?:shell|common|activity|planning|settings|auth|admin)\.[A-Za-z]/,
  );
  await expectNoOverflow(page, 'Fresh English dashboard fits the desktop viewport');
});

test('UI language choices persist after reload while all personal content stays unchanged', async ({
  page,
}) => {
  await navigate(page, 'tasks', 'en');
  await page.getByRole('button', { name: 'New task', exact: true }).click();
  const editor = page.getByRole('dialog', { name: 'New task', exact: true });
  await editor.getByLabel('Task name').fill(PERSONAL_TITLE);
  await editor.getByLabel('Details and notes').fill(PERSONAL_NOTE);
  await editor.getByRole('button', { name: 'Add task', exact: true }).click();
  await expect(page.getByRole('button', { name: PERSONAL_TITLE, exact: true })).toBeVisible();
  const before = personalContent(await storedData(page));

  await switchLanguage(page, 'ar');
  await expect(page).toHaveTitle('مهامي — مدار');
  await expect(page.getByRole('button', { name: 'مهمة جديدة', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: PERSONAL_TITLE, exact: true })).toBeVisible();
  await expect.poll(async () => (await storedData(page)).profile.language).toBe('ar');
  expect(personalContent(await storedData(page))).toEqual(before);
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('lang', 'ar');
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('مهامي');
  await expect(page.getByRole('button', { name: PERSONAL_TITLE, exact: true })).toBeVisible();

  await switchLanguage(page, 'en');
  await expect.poll(async () => (await storedData(page)).profile.language).toBe('en');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page).toHaveTitle('My tasks — Madar');
  expect(personalContent(await storedData(page))).toEqual(before);
  const savedTask = (await storedData(page)).tasks.find((task) => task.title === PERSONAL_TITLE);
  expect(savedTask?.description).toBe(PERSONAL_NOTE);
  expect(await page.evaluate((key) => localStorage.getItem(key), LANGUAGE_KEY)).toBe('en');
});

test('a language change preserves an open unsaved task draft, focus, and running timer', async ({
  page,
}) => {
  // Freeze browser time before starting; runFor below advances exact session durations.
  await page.clock.pauseAt(new Date('2026-10-07T10:01:00Z'));
  await page.getByRole('button', { name: 'Start focusing', exact: true }).click();
  await page.clock.runFor(10_500);
  await expect(page.getByRole('timer')).toHaveText('24:50');
  await page.getByRole('button', { name: 'New task', exact: true }).click();
  const editor = page.getByRole('dialog', { name: 'New task', exact: true });
  const titleField = editor.getByLabel('Task name');
  await titleField.fill(PERSONAL_TITLE);
  await titleField.focus();
  const originalInput = await titleField.elementHandle();

  // The modal intentionally blocks background controls. Use the real language singleton
  // to exercise a live language change without closing or recreating the modal.
  await page.evaluate(async (modulePath) => {
    const i18n = await import(modulePath);
    i18n.setLanguage('ar');
  }, '/src/lib/i18n.ts');
  await expect(page.locator('html')).toHaveAttribute('lang', 'ar');
  const translatedEditor = page.getByRole('dialog', { name: 'مهمة جديدة', exact: true });
  const translatedField = translatedEditor.getByLabel('اسم المهمة');
  await expect(translatedField).toHaveValue(PERSONAL_TITLE);
  await expect(translatedField).toBeFocused();
  expect(
    await translatedField.evaluate((element, previous) => element === previous, originalInput),
  ).toBe(true);
  await page.clock.runFor(5_000);
  await translatedEditor.getByRole('button', { name: 'إلغاء', exact: true }).click();
  await expect(page.getByRole('timer')).toHaveText('24:45');
  await expect(page.getByRole('button', { name: 'إيقاف مؤقت', exact: true })).toBeVisible();
  expect((await storedData(page)).tasks.some((task) => task.title === PERSONAL_TITLE)).toBe(false);

  await switchLanguage(page, 'en');
  await page.clock.runFor(5_000);
  await expect(page.getByRole('timer')).toHaveText('24:40');
  await expect(page.getByRole('button', { name: 'Pause', exact: true })).toBeVisible();
});

test('both languages fit 360px at the largest text size across every screen and calendar view', async ({
  page,
}) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 360, height: 740 });
  await navigate(page, 'settings', 'en');
  await page.getByText('Extra large', { exact: true }).click();
  await expect(page.locator('input[name="textSize"][value="extra-large"]')).toBeChecked();
  await expect(page.locator('html')).toHaveAttribute('data-text-size', 'extra-large');

  for (const language of ['en', 'ar'] as const) {
    if (language === 'ar') await switchLanguage(page, 'ar');
    for (const screen of Object.keys(labels[language]) as Screen[]) {
      await navigate(page, screen, language);
      await expectNoOverflow(page, `${language}/${screen} at 360px and 150% text`);
      expect(await page.locator('body').innerText()).not.toMatch(
        /\b(?:shell|common|activity|planning|settings|auth|admin)\.[A-Za-z]/,
      );
    }
    await navigate(page, 'calendar', language);
    const calendarViews = language === 'en' ? ['Week', 'Year', 'Month'] : ['أسبوع', 'سنة', 'شهر'];
    for (const view of calendarViews) {
      await page.getByRole('button', { name: view, exact: true }).click();
      await expect(page.getByRole('button', { name: view, exact: true })).toHaveAttribute(
        'aria-pressed',
        'true',
      );
      await expectNoOverflow(page, `${language} calendar ${view} at 360px and 150% text`);
    }

    await page
      .getByRole('button', { name: language === 'en' ? 'Open menu' : 'فتح القائمة', exact: true })
      .click();
    const sidebar = page.locator('.sidebar');
    await expect(sidebar).toBeInViewport();
    const bounds = await sidebar.boundingBox();
    expect(bounds).not.toBeNull();
    if (language === 'en') {
      expect(bounds!.x, 'English mobile drawer opens from the left').toBeLessThanOrEqual(1);
    } else {
      expect(
        bounds!.x + bounds!.width,
        'Arabic mobile drawer opens from the right',
      ).toBeGreaterThanOrEqual(359);
    }
    await sidebar
      .getByRole('button', {
        name: language === 'en' ? 'Close menu' : 'إغلاق القائمة',
        exact: true,
      })
      .click();
  }
});
