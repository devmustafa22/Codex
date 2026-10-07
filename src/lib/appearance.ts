export const TEXT_SIZE_OPTIONS = [
  { value: 'normal', label: 'الافتراضي', percentage: 100 },
  { value: 'medium', label: 'متوسط', percentage: 115 },
  { value: 'large', label: 'كبير', percentage: 130 },
  { value: 'extra-large', label: 'كبير جداً', percentage: 150 },
] as const;

export type TextSize = (typeof TEXT_SIZE_OPTIONS)[number]['value'];
