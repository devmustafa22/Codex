export type Language = 'en' | 'ar';
export type Message = Record<Language, string>;
export type Dictionary = Record<string, Message>;
export type TranslationParams = Record<string, string | number>;
