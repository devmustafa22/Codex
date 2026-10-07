import { beforeEach } from 'vitest';
import { setLanguage } from './lib/i18n';

// Existing domain tests use Arabic fixtures; localization tests choose their own language.
beforeEach(() => setLanguage('ar'));
