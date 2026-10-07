import type { Dictionary } from './types';

export const settingsMessages: Dictionary = {
  'settings.eyebrow': {
    en: 'A space that feels like you',
    ar: 'مساحة تشبهك',
  },
  'settings.title': {
    en: 'Settings',
    ar: 'الإعدادات',
  },
  'settings.description': {
    en: 'Set your goals, customize your experience, and keep your journey backed up.',
    ar: 'رتّب أهدافك، خصّص تجربتك، واحتفظ بنسخة آمنة من رحلتك.',
  },
  'settings.textSize.title': {
    en: 'Text size',
    ar: 'حجم الخط',
  },
  'settings.textSize.choose': {
    en: 'Choose a text size',
    ar: 'اختر حجم الخط',
  },
  'settings.textSize.normal': {
    en: 'Default',
    ar: 'الافتراضي',
  },
  'settings.textSize.medium': {
    en: 'Medium',
    ar: 'متوسط',
  },
  'settings.textSize.large': {
    en: 'Large',
    ar: 'كبير',
  },
  'settings.textSize.extraLarge': {
    en: 'Extra large',
    ar: 'كبير جداً',
  },
  'settings.textSize.preview': {
    en: 'A small step today. Clear progress tomorrow.',
    ar: 'خطوة صغيرة اليوم، تقدّم واضح بكرة.',
  },
  'settings.cloud.title': {
    en: 'Your account and cloud sync',
    ar: 'حسابك والحفظ السحابي',
  },
  'settings.sync.local': {
    en: 'Saved in this browser',
    ar: 'محفوظ على هذا المتصفح',
  },
  'settings.sync.loading': {
    en: 'Loading your account',
    ar: 'تحميل بيانات الحساب',
  },
  'settings.sync.saving': {
    en: 'Changes are waiting to sync',
    ar: 'التغييرات تنتظر الحفظ السحابي',
  },
  'settings.sync.synced': {
    en: 'Saved to the cloud',
    ar: 'محفوظ في السحابة',
  },
  'settings.sync.offline': {
    en: 'You are offline — changes are waiting to sync',
    ar: 'اتصالك غير متوفر — تغييراتك تنتظر المزامنة',
  },
  'settings.sync.error': {
    en: 'Sync could not be completed',
    ar: 'تعذّر إتمام المزامنة',
  },
  'settings.sync.conflict': {
    en: 'A newer version exists on another device',
    ar: 'هناك نسخة أحدث على جهاز آخر',
  },
  'settings.sync.description': {
    en: 'Each account has its own private workspace. Changes sync automatically when you are online. Check their status here, and store backup files somewhere private.',
    ar: 'كل حساب عنده مساحة خاصة. التعديلات تُحفظ تلقائياً عند توفر الاتصال، وتظهر حالة الحفظ هنا. ملفات النسخ الاحتياطية تشمل بيانات مساحتك؛ احفظها بمكان خاص.',
  },
  'settings.sync.retry': {
    en: 'Retry sync',
    ar: 'إعادة المزامنة',
  },
  'settings.sync.conflictDescription': {
    en: 'Download a backup first, then choose which version to keep. A newer version will never be overwritten automatically.',
    ar: 'نزّل نسخة احتياطية أولاً، ثم اختَر البيانات التي تريد اعتمادها. لن نكتب فوق النسخة الأحدث تلقائياً.',
  },
  'settings.sync.reload': {
    en: 'Load cloud version',
    ar: 'تحميل نسخة السحابة',
  },
  'settings.sync.overwrite': {
    en: 'Keep this device’s version',
    ar: 'اعتماد النسخة الحالية',
  },
  'settings.password.title': {
    en: 'Change password',
    ar: 'تغيير كلمة المرور',
  },
  'settings.password.new': {
    en: 'New password',
    ar: 'كلمة المرور الجديدة',
  },
  'settings.password.confirm': {
    en: 'Confirm new password',
    ar: 'تأكيد كلمة المرور الجديدة',
  },
  'settings.password.busy': {
    en: 'Changing password…',
    ar: 'جارٍ التغيير…',
  },
  'settings.password.lengthError': {
    en: 'Choose a password between 10 and 128 characters.',
    ar: 'اختر كلمة مرور بين 10 و128 حرفاً.',
  },
  'settings.password.matchError': {
    en: 'The passwords do not match.',
    ar: 'كلمتا المرور غير متطابقتين.',
  },
  'settings.password.success': {
    en: 'Password changed',
    ar: 'تم تغيير كلمة المرور',
  },
  'settings.password.failed': {
    en: 'Could not change the password.',
    ar: 'تعذّر تغيير كلمة المرور.',
  },
  'settings.profile.title': {
    en: 'Your profile',
    ar: 'ملفك الشخصي',
  },
  'settings.profile.avatarFallback': {
    en: 'M',
    ar: 'م',
  },
  'settings.profile.space': {
    en: 'Your personal workspace',
    ar: 'مساحتك الشخصية',
  },
  'settings.profile.name': {
    en: 'Your name',
    ar: 'اسمك',
  },
  'settings.profile.role': {
    en: 'Your journey in a few words',
    ar: 'وصف رحلتك',
  },
  'settings.profile.weekly': {
    en: 'Weekly goal (hours)',
    ar: 'هدف الأسبوع (ساعات)',
  },
  'settings.profile.focus': {
    en: 'Focus session (minutes)',
    ar: 'مدة جلسة التركيز (دقائق)',
  },
  'settings.profile.save': {
    en: 'Save changes',
    ar: 'حفظ التغييرات',
  },
  'settings.profile.focusNote': {
    en: 'The new duration applies when you start a new session.',
    ar: 'المدة الجديدة تُطبّق عند فتح جلسة جديدة.',
  },
  'settings.profile.nameError': {
    en: 'Enter your name before saving settings.',
    ar: 'اكتب اسمك قبل حفظ الإعدادات.',
  },
  'settings.profile.goalError': {
    en: 'Check your weekly goal and focus duration.',
    ar: 'تحقق من هدف الأسبوع ومدة التركيز.',
  },
  'settings.appearance.title': {
    en: 'Appearance',
    ar: 'مظهر مساحتك',
  },
  'settings.appearance.description': {
    en: 'Choose the theme that suits you.',
    ar: 'اختر الإضاءة التي تناسب وقتك.',
  },
  'settings.appearance.light': {
    en: 'Light mode',
    ar: 'وضع نهاري',
  },
  'settings.appearance.dark': {
    en: 'Dark mode',
    ar: 'وضع ليلي',
  },
  'settings.backup.title': {
    en: 'Your backup',
    ar: 'نسختك الاحتياطية',
  },
  'settings.backup.heading': {
    en: 'Keep a copy of your progress',
    ar: 'بياناتك تستحق أن تحتفظ بها',
  },
  'settings.backup.cloudDescription': {
    en: 'Cloud sync lets you access your workspace across devices. Download a backup before restoring data or resolving a conflict: restoring replaces this account’s current data.',
    ar: 'الحفظ السحابي يتيح فتح مساحتك من أجهزتك. نزّل نسخة إضافية قبل الاسترجاع أو معالجة تعارض، لأن الاسترجاع يستبدل بيانات الحساب الحالي.',
  },
  'settings.backup.localDescription': {
    en: 'This local demo is saved in this browser. Download a copy to import into your cloud account later.',
    ar: 'هذه تجربة محلية محفوظة في هذا المتصفح. نزّل نسخة لاسترجاعها في حسابك السحابي لاحقاً.',
  },
  'settings.backup.download': {
    en: 'Download backup',
    ar: 'تنزيل نسخة احتياطية',
  },
  'settings.backup.restore': {
    en: 'Restore backup',
    ar: 'استرجاع نسخة',
  },
  'settings.backup.importLegacy': {
    en: 'Import old browser data',
    ar: 'نقل بيانات النسخة القديمة',
  },
  'settings.backup.downloaded': {
    en: 'Your backup has been downloaded',
    ar: 'تم تنزيل نسخة احتياطية من بياناتك',
  },
  'settings.backup.tooLarge': {
    en: 'The file exceeds the 5 MB limit.',
    ar: 'الملف أكبر من الحجم المسموح: 5 ميغابايت.',
  },
  'settings.backup.readFailed': {
    en: 'Could not read the file. Try another backup.',
    ar: 'تعذّرت قراءة الملف. جرّب نسخة احتياطية أخرى.',
  },
  'settings.backup.invalid': {
    en: 'This backup file is invalid.',
    ar: 'ملف النسخة الاحتياطية غير صالح.',
  },
  'settings.backup.legacyMissing': {
    en: 'No old data was found in this browser at this address. Restore a backup file if you used a different address.',
    ar: 'ماكو بيانات للنسخة القديمة على هذا المتصفح والعنوان. استرجع ملف النسخة الاحتياطية إذا كنت تستخدم عنواناً آخر.',
  },
  'settings.backup.legacyFailed': {
    en: 'Could not read the old browser data. Use a backup file instead.',
    ar: 'تعذّرت قراءة بيانات النسخة القديمة. استخدم ملف النسخة الاحتياطية.',
  },
  'settings.sync.resolveFailed': {
    en: 'Could not resolve the conflict.',
    ar: 'تعذّرت معالجة التعارض.',
  },
  'settings.data.title': {
    en: 'Manage workspace data',
    ar: 'إدارة بيانات المساحة',
  },
  'settings.data.clearTitle': {
    en: 'A fresh start',
    ar: 'بداية جديدة',
  },
  'settings.data.clearDescription': {
    en: 'Remove tasks, skills, activity logs, and events. Your settings are kept.',
    ar: 'مسح المهام والمهارات والسجلات والمواعيد. تبقى إعداداتك كما هي.',
  },
  'settings.data.clear': {
    en: 'Clear data',
    ar: 'مسح البيانات',
  },
  'settings.data.demoTitle': {
    en: 'Restore demo workspace',
    ar: 'استعادة المثال التجريبي',
  },
  'settings.data.demoDescription': {
    en: 'Replace your data with an example workspace to explore Madar.',
    ar: 'استبدال بياناتك بمثال يساعدك على استكشاف مدار.',
  },
  'settings.data.demo': {
    en: 'Restore demo',
    ar: 'استعادة المثال',
  },
  'settings.privacy.title': {
    en: 'Your space. Your data.',
    ar: 'مساحتك، وبياناتك.',
  },
  'settings.privacy.cloudDescription': {
    en: 'Your workspace is stored in Supabase under your account. Access policies let each account read only its own workspace.',
    ar: 'بيانات المساحة محفوظة في قاعدة بيانات Supabase تحت حسابك، وسياسات الوصول تسمح للحساب بقراءة بياناته فقط.',
  },
  'settings.privacy.localDescription': {
    en: 'You are using the local demo. Its data stays in this browser while you explore Madar before creating an account.',
    ar: 'أنت في التجربة المحلية. بياناتها تبقى في هذا المتصفح، ويمكنك استكشاف مدار قبل إنشاء حساب.',
  },
  'settings.privacy.cloudAccount': {
    en: 'Password-protected account and sign-in session',
    ar: 'حساب بكلمة مرور وجلسة تسجيل دخول',
  },
  'settings.privacy.localAccount': {
    en: 'Explore without an account',
    ar: 'تجربة بدون حساب',
  },
  'settings.privacy.cloudSync': {
    en: 'Sync when you are online',
    ar: 'مزامنة عند توفر الاتصال',
  },
  'settings.privacy.localSync': {
    en: 'The local demo does not sync',
    ar: 'التجربة المحلية لا تتزامن',
  },
  'settings.privacy.cloudNote': {
    en: 'Pending changes are cached separately for your account on this device. Use a trusted device and export a backup before clearing browser data.',
    ar: 'التغييرات المعلّقة لها نسخة مؤقتة خاصة بالحساب على الجهاز. استخدم جهازاً موثوقاً، وصدّر نسخة قبل مسح بيانات المتصفح.',
  },
  'settings.privacy.localNote': {
    en: 'Clearing browser data removes demo records. Keep a backup.',
    ar: 'مسح بيانات المتصفح يزيل سجلات التجربة. احتفظ بنسخة احتياطية.',
  },
  'settings.hosting.title': {
    en: 'Where can you host Madar?',
    ar: 'وين تستضيف مدار؟',
  },
  'settings.hosting.description': {
    en: 'Use Cloudflare to host the frontend with HTTPS and GitHub deployments, and Supabase for accounts and data. Both offer free plans with usage limits.',
    ar: 'Cloudflare Pages للواجهة مع HTTPS ونشر من GitHub، وSupabase للحسابات والبيانات. كلاهما يوفّر خطة مجانية ضمن حدود الاستخدام.',
  },
  'settings.hosting.visit': {
    en: 'Visit Cloudflare',
    ar: 'زيارة Cloudflare Pages',
  },
  'settings.hosting.build': {
    en: 'Build command:',
    ar: 'أمر البناء:',
  },
  'settings.hosting.output': {
    en: 'Output directory:',
    ar: 'مجلد النشر:',
  },
  'settings.tip.title': {
    en: 'A place to start',
    ar: 'فكرة للبداية',
  },
  'settings.tip.description': {
    en: 'Start with two or three skills and a realistic weekly goal. Log your activity after each session. You do not need to track every minute to see your progress.',
    ar: 'ابدأ بمهارتين أو ثلاث، وحدد هدفاً أسبوعياً واقعياً، ثم سجّل نشاطك بعد كل جلسة. ما تحتاج توثّق كل دقيقة حتى تشوف تقدّمك.',
  },
  'settings.confirm.overwrite.title': {
    en: 'Keep this device’s version?',
    ar: 'اعتماد النسخة الحالية؟',
  },
  'settings.confirm.reload.title': {
    en: 'Load the cloud version?',
    ar: 'تحميل نسخة السحابة؟',
  },
  'settings.confirm.import.title': {
    en: 'Restore this backup?',
    ar: 'استرجاع النسخة الاحتياطية؟',
  },
  'settings.confirm.clear.title': {
    en: 'Start a fresh workspace?',
    ar: 'بدء مساحة جديدة؟',
  },
  'settings.confirm.demo.title': {
    en: 'Restore the demo data?',
    ar: 'استعادة البيانات التجريبية؟',
  },
  'settings.confirm.overwrite.description': {
    en: 'The cloud version will be replaced with data from this device. Download a backup first. If another edit happens during this operation, the conflict will appear again.',
    ar: 'سيتم استبدال نسخة السحابة ببيانات هذا الجهاز. نزّل نسخة احتياطية أولاً. إذا حدث تعديل جديد أثناء العملية سيظهر التعارض مجدداً.',
  },
  'settings.confirm.reload.description': {
    en: 'Pending changes on this device will be discarded and the cloud data loaded. Download a backup before continuing.',
    ar: 'سيتم تجاهل التعديلات المعلّقة على هذا الجهاز وتحميل بيانات السحابة. نزّل نسخة احتياطية قبل المتابعة.',
  },
  'settings.confirm.import.description': {
    en: 'Your workspace will be replaced with the file’s contents. Download a backup of your current data first.',
    ar: 'سيتم استبدال بيانات المساحة بمحتويات الملف. ننصح بتنزيل نسخة من بياناتك الحالية أولاً.',
  },
  'settings.confirm.data.description': {
    en: 'Your current data will be replaced. Download a backup first: this cannot be undone without one.',
    ar: 'سيتم استبدال بياناتك الحالية. نزّل نسخة احتياطية قبل المتابعة، لأن هذه الخطوة لا يمكن التراجع عنها بدون نسخة.',
  },
  'settings.admin.date.noSignIn': {
    en: 'Never signed in',
    ar: 'لم يسجّل الدخول بعد',
  },
  'settings.admin.suspend.title': {
    en: 'Suspend account',
    ar: 'إيقاف الحساب',
  },
  'settings.admin.suspend.confirm': {
    en: 'Confirm suspension',
    ar: 'تأكيد الإيقاف',
  },
  'settings.admin.suspend.success': {
    en: 'Account suspended.',
    ar: 'تم إيقاف الحساب.',
  },
  'settings.admin.reactivate.title': {
    en: 'Reactivate account',
    ar: 'إعادة تفعيل الحساب',
  },
  'settings.admin.reactivate.confirm': {
    en: 'Confirm reactivation',
    ar: 'تأكيد التفعيل',
  },
  'settings.admin.reactivate.success': {
    en: 'Account reactivated.',
    ar: 'تمت إعادة تفعيل الحساب.',
  },
  'settings.admin.delete.title': {
    en: 'Permanently delete account',
    ar: 'حذف الحساب نهائياً',
  },
  'settings.admin.delete.confirm': {
    en: 'Permanently delete account',
    ar: 'حذف الحساب نهائياً',
  },
  'settings.admin.delete.success': {
    en: 'Account and data deleted.',
    ar: 'تم حذف الحساب وبياناته.',
  },
  'settings.admin.loadFailed': {
    en: 'Could not load accounts.',
    ar: 'تعذّر تحميل الحسابات.',
  },
  'settings.admin.actionFailed': {
    en: 'Could not complete the action.',
    ar: 'تعذّر تنفيذ العملية.',
  },
  'settings.admin.access.title': {
    en: 'Account management is for administrators',
    ar: 'إدارة الحسابات متاحة للأدمن فقط',
  },
  'settings.admin.access.description': {
    en: 'Permissions are verified by the server. Sign in with an active administrator account.',
    ar: 'يتم التحقق من الصلاحية من الخادم. سجّل الدخول بحساب الإدارة النشط.',
  },
  'settings.admin.stats.total': {
    en: 'Total accounts',
    ar: 'إجمالي الحسابات',
  },
  'settings.admin.stats.active': {
    en: 'Active accounts',
    ar: 'الحسابات النشطة',
  },
  'settings.admin.stats.suspended': {
    en: 'Suspended accounts',
    ar: 'الحسابات الموقوفة',
  },
  'settings.admin.stats.admins': {
    en: 'Administrator accounts',
    ar: 'حسابات الإدارة',
  },
  'settings.admin.eyebrow': {
    en: 'Administration',
    ar: 'مساحة الإدارة',
  },
  'settings.admin.title': {
    en: 'Account management',
    ar: 'إدارة الحسابات',
  },
  'settings.admin.description': {
    en: 'View registered accounts and manage access to Madar from one place.',
    ar: 'تابع الحسابات المسجّلة، وأدر الوصول إلى مدار من مكان واحد.',
  },
  'settings.admin.refresh': {
    en: 'Refresh accounts',
    ar: 'تحديث الحسابات',
  },
  'settings.admin.stats.label': {
    en: 'Account statistics',
    ar: 'إحصائيات الحسابات',
  },
  'settings.admin.accessNote': {
    en: 'Suspension prevents sign-in and cloud access while keeping account data. Administrator accounts are protected from suspension and deletion.',
    ar: 'الإيقاف يمنع الدخول والوصول السحابي مع الاحتفاظ بالبيانات. حسابات الإدارة محمية من الإيقاف والحذف.',
  },
  'settings.admin.accounts.title': {
    en: 'Registered accounts',
    ar: 'الحسابات المسجّلة',
  },
  'settings.admin.search.label': {
    en: 'Search accounts',
    ar: 'البحث عن حساب',
  },
  'settings.admin.search.placeholder': {
    en: 'Username, name, or email',
    ar: 'اسم المستخدم، الاسم، أو البريد',
  },
  'settings.admin.filter.label': {
    en: 'Account status',
    ar: 'حالة الحساب',
  },
  'settings.admin.filter.all': {
    en: 'All accounts',
    ar: 'كل الحسابات',
  },
  'settings.admin.status.active': {
    en: 'Active',
    ar: 'نشط',
  },
  'settings.admin.status.suspended': {
    en: 'Suspended',
    ar: 'موقوف',
  },
  'settings.admin.loading': {
    en: 'Loading accounts…',
    ar: 'جاري تحميل الحسابات…',
  },
  'settings.admin.retry': {
    en: 'Try again',
    ar: 'إعادة المحاولة',
  },
  'settings.admin.empty.title': {
    en: 'No matching accounts',
    ar: 'لا توجد حسابات مطابقة',
  },
  'settings.admin.empty.filtered': {
    en: 'Try a different search term or status filter.',
    ar: 'جرّب كلمة بحث أخرى أو غيّر فلتر الحالة.',
  },
  'settings.admin.empty.initial': {
    en: 'Accounts appear here after they register with Madar.',
    ar: 'تظهر الحسابات هنا بعد التسجيل في مدار.',
  },
  'settings.admin.table.account': {
    en: 'Account',
    ar: 'الحساب',
  },
  'settings.admin.table.access': {
    en: 'Status and role',
    ar: 'الحالة والصلاحية',
  },
  'settings.admin.table.dates': {
    en: 'Registered / last sign-in',
    ar: 'تاريخ التسجيل / آخر دخول',
  },
  'settings.admin.table.manage': {
    en: 'Manage account',
    ar: 'إدارة الحساب',
  },
  'settings.admin.accounts.label': {
    en: 'Account list',
    ar: 'قائمة الحسابات',
  },
  'settings.admin.email.none': {
    en: 'No email address',
    ar: 'بدون بريد إلكتروني',
  },
  'settings.admin.email.confirmed': {
    en: 'Email confirmed',
    ar: 'البريد مؤكّد',
  },
  'settings.admin.email.pending': {
    en: 'Email confirmation pending',
    ar: 'بانتظار تأكيد البريد',
  },
  'settings.admin.role.admin': {
    en: 'Admin',
    ar: 'أدمن',
  },
  'settings.admin.role.user': {
    en: 'User',
    ar: 'مستخدم',
  },
  'settings.admin.current': {
    en: 'Your current account',
    ar: 'حسابك الحالي',
  },
  'settings.admin.date.registered': {
    en: 'Registered',
    ar: 'تاريخ التسجيل',
  },
  'settings.admin.date.lastSignIn': {
    en: 'Last sign-in',
    ar: 'آخر دخول',
  },
  'settings.admin.protected': {
    en: 'Protected administrator account',
    ar: 'حساب إدارة محمي',
  },
  'settings.admin.delete.button': {
    en: 'Delete account',
    ar: 'حذف الحساب',
  },
  'settings.admin.blocked.delete': {
    en: 'Deletion pending site owner review',
    ar: 'حذف معلّق بانتظار مراجعة مالك الموقع',
  },
  'settings.admin.blocked.status': {
    en: 'Status change is being verified; wait 15 minutes',
    ar: 'تغيير الحالة قيد التحقق؛ انتظر 15 دقيقة',
  },
  'settings.admin.pagination.previousLabel': {
    en: 'Previous page',
    ar: 'الصفحة السابقة',
  },
  'settings.admin.pagination.nextLabel': {
    en: 'Next page',
    ar: 'الصفحة التالية',
  },
  'settings.admin.pagination.previous': {
    en: 'Previous',
    ar: 'السابق',
  },
  'settings.admin.pagination.next': {
    en: 'Next',
    ar: 'التالي',
  },
  'settings.admin.suspend.description': {
    en: 'This account will be prevented from signing in and accessing cloud data. Its data is kept, and you can reactivate it later.',
    ar: 'سيتم منع هذا الحساب من تسجيل الدخول والوصول إلى بياناته السحابية. تبقى بياناته محفوظة ويمكنك إعادة تفعيله لاحقاً.',
  },
  'settings.admin.reactivate.description': {
    en: 'This account will be able to sign in and access its cloud data again.',
    ar: 'سيتم السماح لهذا الحساب بتسجيل الدخول والوصول إلى بياناته السحابية مرة أخرى.',
  },
  'settings.admin.delete.description': {
    en: 'The account and all its cloud data, including tasks, skills, and activity logs, will be permanently deleted. This action cannot be undone.',
    ar: 'سيتم حذف الحساب وجميع بياناته السحابية نهائياً، بما فيها المهام والمهارات وسجل النشاط. لا يمكن التراجع عن هذه العملية.',
  },
  'settings.admin.delete.typeUsername': {
    en: 'Type the username to confirm',
    ar: 'اكتب اسم المستخدم للتأكيد',
  },
  'settings.admin.busy': {
    en: 'Working…',
    ar: 'جاري تنفيذ العملية…',
  },
  'settings.admin.cancel': {
    en: 'Cancel',
    ar: 'إلغاء',
  },
  'settings.admin.busyNote': {
    en: 'Wait for the action to finish before closing this dialog.',
    ar: 'انتظر إتمام العملية قبل إغلاق النافذة.',
  },
  'settings.language.title': {
    en: 'Platform language',
    ar: 'لغة المنصة',
  },
  'settings.language.description': {
    en: 'Choose your interface language. The page direction adjusts automatically and your own data stays as you wrote it.',
    ar: 'اختر لغة الواجهة. يتغيّر اتجاه الصفحة تلقائياً وتبقى بياناتك كما كتبتها.',
  },
  'settings.language.choose': {
    en: 'Choose a language',
    ar: 'اختر اللغة',
  },
  'settings.textSize.cloudDescription': {
    en: 'Make text comfortable to read. The size changes immediately and is saved to your account across devices.',
    ar: 'كبّر النص بما يناسبك. يتغيّر الحجم مباشرة ويبقى محفوظاً في حسابك على أجهزتك.',
  },
  'settings.textSize.localDescription': {
    en: 'Make text comfortable to read. The size changes immediately and is saved in this browser.',
    ar: 'كبّر النص بما يناسبك. يتغيّر الحجم مباشرة ويبقى محفوظاً على هذا المتصفح.',
  },
  'settings.cloud.lastSaved': {
    en: 'Last saved: {date}',
    ar: 'آخر حفظ: {date}',
  },
  'settings.backup.tasks': {
    en: '{count} tasks',
    ar: '{count} مهام',
  },
  'settings.backup.skills': {
    en: '{count} skills',
    ar: '{count} مهارات',
  },
  'settings.backup.activities': {
    en: '{count} activities',
    ar: '{count} أنشطة',
  },
  'settings.backup.events': {
    en: '{count} events',
    ar: '{count} مواعيد',
  },
  'settings.admin.account.label': {
    en: 'Account {username}',
    ar: 'حساب {username}',
  },
  'settings.admin.pagination.summary': {
    en: '{count} matching accounts · Page {page} of {pages}',
    ar: '{count} حساب مطابق · الصفحة {page} من {pages}',
  },
};
