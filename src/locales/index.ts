import { commonMessages } from './common';
import { demoMessages } from './demo';
import { shellMessages } from './shell';
import { activityMessages } from './activity';
import { planningMessages } from './planning';
import { settingsMessages } from './settings';
import { authMessages } from './auth';
import type { Dictionary } from './types';

export const messages: Dictionary = {
  ...commonMessages,
  ...demoMessages,
  ...shellMessages,
  ...activityMessages,
  ...planningMessages,
  ...settingsMessages,
  ...authMessages,
};
