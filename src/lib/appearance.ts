export const TEXT_SIZE_OPTIONS = [
  { value: 'normal', label: 'settings.textSize.normal', percentage: 100 },
  { value: 'medium', label: 'settings.textSize.medium', percentage: 115 },
  { value: 'large', label: 'settings.textSize.large', percentage: 130 },
  { value: 'extra-large', label: 'settings.textSize.extraLarge', percentage: 150 },
] as const;

export type TextSize = (typeof TEXT_SIZE_OPTIONS)[number]['value'];
