# نشر مدار على الإنترنت

أنصح بـ **Cloudflare Workers Static Assets للواجهة + Supabase للحسابات والبيانات**. هذه بداية مجانية مناسبة للاستخدام الشخصي، وتتيح الدخول من الهاتف والكمبيوتر بالحساب نفسه. توصي وثائق Cloudflare الحالية باستخدام Workers للمشاريع الجديدة؛ ويمكن استعمال Pages كبديل إذا ظهر خيار إنشائه في حسابك.

الملفات المرفقة هي المشروع القابل للنشر. نشر الواجهة وإعداد خدمات Supabase خطوتان مستقلتان. إذا طبّقت ملف قاعدة البيانات ونشرت دالة اسم المستخدم مسبقاً، أكمل ربط الواجهة وإعداد العناوين. تفاصيل الإعداد موجودة في [دليل السحابة](cloud-setup.md).

## كيف تتوزع الخدمات؟

| الخدمة                           | ما تستضيفه                                    | الإعداد الذي تحتاجه                           |
| -------------------------------- | --------------------------------------------- | --------------------------------------------- |
| Cloudflare Workers Static Assets | واجهة React وملفات CSS والخطوط                | بناء `npm run build` ونشر ملفات `dist`        |
| Supabase Auth                    | حسابات المستخدمين وكلمات المرور وتأكيد البريد | مزوّد Email وعناوين التوجيه                   |
| Supabase PostgreSQL              | المهام والمهارات والأنشطة والمواعيد           | ملف migration المرفق وصلاحيات RLS             |
| Supabase Edge Functions          | تسجيل الدخول باسم المستخدم                    | نشر `username-login` وقائمة `ALLOWED_ORIGINS` |
| مزوّد SMTP عند فتح التسجيل العام | رسائل التأكيد واسترجاع كلمة المرور            | إعداد Custom SMTP داخل Supabase               |

الواجهة لا تحتاج خادم Node.js يعمل طوال الوقت بعد البناء. Node.js مطلوب لعملية التطوير والبناء، ثم Cloudflare يقدم الملفات، والواجهة تتصل بـ Supabase مباشرة بالمفتاح العام.

## قبل النشر

1. أكمل [إعداد Supabase](cloud-setup.md)، وجرّب تسجيل الدخول والحفظ محلياً.
2. تأكد أن `.env.local` يحتوي فقط رابط Supabase ومفتاحه العام، وأن الملف مستبعد من Git.
3. شغّل من مجلد المشروع:

   ```bash
   npm ci
   npm test
   npm run build
   ```

4. نزّل نسخة JSON من بياناتك القديمة إذا تنتقل من نسخة المتصفح السابقة. هذه البيانات لا تنتقل تلقائياً إلى الحساب الجديد.

على Windows استعمل `npm.cmd` إذا منع PowerShell تشغيل `npm.ps1`.

## الخيار المفضل: Workers Static Assets من GitHub

ارفع ملفات المشروع إلى مستودعك `devmustafa22/Codex`؛ GitHub يحتفظ بالمصدر، وCloudflare يبني الموقع من كل تحديث ترسله إلى الفرع الذي اخترته.

1. إذا كان المشروع موجوداً على GitHub بالفعل، أكمل مباشرة. وإلا افتح مجلده في VS Code، واستعمل **Source Control** لإنشاء commit واربطه بمستودع GitHub. لا ترفع `.env.local` أو `node_modules` أو النسخ الاحتياطية الشخصية.
2. افتح حساب Cloudflare، ثم **Workers & Pages → Create application → Continue with GitHub**. قد يظهر الخيار باسم **Import a repository**. اختر مسار GitHub الموجود في واجهة إنشاء Workers؛ هذا المسار يدعم استضافة ملفات مدار الثابتة.
3. اختر `devmustafa22/Codex` وفرع الإنتاج `main`.
4. اضبط المشروع والبناء:

   | الإعداد                         | القيمة                                                 |
   | ------------------------------- | ------------------------------------------------------ |
   | Project name                    | `codex`؛ يجب أن يطابق `name` في `wrangler.jsonc`       |
   | Production branch               | `main`                                                 |
   | Root directory                  | فارغ؛ `package.json` و`wrangler.jsonc` في جذر المستودع |
   | Build command                   | `npm run build`                                        |
   | Deploy command                  | `npx wrangler deploy`                                  |
   | `NODE_VERSION`                  | `22`                                                   |
   | `VITE_SUPABASE_URL`             | رابط مشروع Supabase                                    |
   | `VITE_SUPABASE_PUBLISHABLE_KEY` | المفتاح العام `sb_publishable_...` أو `anon` العام     |

5. أضف المتغيرات الثلاثة في **Build variables and secrets** قبل البناء الأول، ثم اختر **Deploy** أو **Save and Deploy**. إعدادات **Variables & Secrets** الخاصة بتشغيل Worker منفصلة عن متغيرات البناء؛ متغيرا `VITE_SUPABASE_*` يجب أن يصلا إلى أمر البناء. إذا غيّرتهما بعد النشر، أعد عملية البناء والنشر؛ Vite يضمّن قيمهما في ملفات الواجهة.
6. ستأخذ عنوان إنتاج ينتهي بـ `.workers.dev`. احتفظ بعنوان **Production** الذي تعرضه Cloudflare، ثم طبّق خطوات [ربط عنوان الإنتاج بـ Supabase](#ربط-عنوان-الإنتاج-بـ-supabase) أدناه.
7. جرّب تسجيل الدخول وتأكيد البريد والحفظ واسترجاع كلمة المرور من عنوان الإنتاج، ثم افتح الحساب نفسه على الهاتف.

ملف [wrangler.jsonc](../wrangler.jsonc) يحدد `assets.directory` بقيمة `./dist` وطريقة عرض الصفحة لتطبيق SPA. يستضيف هذا الإعداد الملفات الثابتة فقط، ولا يحتاج ملف Worker أو خادماً إضافياً. في إعداد Workers لا توجد حاجة لإدخال حقل **Build output directory**؛ موقع المخرجات موجود في ملف الإعداد. إذا أردت تغيير الاسم `codex`، غيّره في الملف وفي Cloudflare معاً قبل النشر، وإلا قد يفشل البناء بسبب اختلاف الاسمين.

بعدها تؤدي التحديثات التي ترفعها إلى `main` إلى بناء ونشر نسخة جديدة. اسم موقع Cloudflare ومعرّف مشروع Supabase مستقلان؛ استعمل عنوان كل خدمة في مكانه.

## ربط عنوان الإنتاج بـ Supabase

هذه الخطوة مطلوبة سواء كان عنوان الموقع ينتهي بـ `.workers.dev` أو `.pages.dev` أو كان نطاقاً خاصاً. استعمل عنوان الإنتاج الحقيقي من Cloudflare؛ أمثلة `pages.dev` في دليل السحابة تُستبدل بعنوان موقعك.

1. في **Supabase → Authentication → URL Configuration**، اجعل **Site URL** عنوان الموقع الكامل الذي يبدأ بـ `https://`.
2. أضف إلى **Redirect URLs** عنوان الموقع متبوعاً بـ `/`، وعنوانه متبوعاً بـ `/?auth=recovery`. أبقِ عنوانَي التطوير إن كنت تحتاج التجربة المحلية.
3. في **Supabase → Edge Functions → Secrets**، حدّث قيمة `ALLOWED_ORIGINS` لتشمل أصل عنوان الموقع: البروتوكول والنطاق فقط، دون مسار أو `/` في النهاية. أبقِ العناوين الأخرى التي تستخدمها مفصولة بفواصل.
4. اختبر تسجيل الدخول باسم المستخدم من عنوان الإنتاج. نجاح رفع الواجهة وحده لا يؤكد إعداد CORS أو البريد أو صلاحيات قاعدة البيانات.

## بديل: Cloudflare Pages من GitHub

إذا كان خيار إنشاء Pages متاحاً، افتح **Workers & Pages → Create application → Pages → Connect to Git**، ثم اختر المستودع والفرع نفسهما. أسماء الأزرار قد تختلف بين إصدارات اللوحة.

إعداد Pages هو: **Build command** بقيمة `npm run build` و**Build output directory** بقيمة `dist`، مع ترك **Root directory** فارغاً. أضف `NODE_VERSION=22` ومتغيرَي Supabase العامين إلى متغيرات البناء قبل النشر. اسم مشروع Pages لا يحتاج مطابقة اسم Worker في `wrangler.jsonc`، ولا تستخدم أمر `wrangler deploy` في هذا المسار. رابط الموقع ينتهي بـ `.pages.dev`؛ طبّق عليه إعدادات Supabase السابقة.

## بديل: رفع ملفات البناء مباشرة إلى Pages

يمكن النشر بدون ربط GitHub إذا تفضّل البدء سريعاً:

1. أكمل `.env.local` بقيم مشروع Supabase، ثم نفّذ `npm ci` و`npm run build` على جهازك.
2. أنشئ ZIP يحتوي **محتويات `dist`**؛ يجب أن يكون `index.html` في جذر ZIP. لا ترفع ZIP المصدر، ولا تضع مجلد `dist` نفسه داخل الأرشيف.
3. في Cloudflare Pages أنشئ مشروع **Direct Upload / Upload assets** وارفع ZIP البناء أو مجلد الملفات.
4. أضف عنوان الموقع النهائي إلى إعدادات Supabase وقائمة `ALLOWED_ORIGINS`.
5. عند أي تعديل، أعد البناء وارفع النسخة الجديدة.

إضافة متغيرات إلى Cloudflare بعد رفع الملفات مباشرة لا تغيّر البناء الذي رفعتَه؛ أعد البناء على جهازك أولاً بالقيم الجديدة. المشروع المبني بدون قيم اتصال يعمل كتجربة محلية ويعرض إعداد الحسابات، ولا يصبح سحابياً بمجرد رفعه.

وثائق Cloudflare توضح أن التحويل من مشروع Direct Upload إلى نشر تلقائي من Git يحتاج إنشاء مشروع Pages جديد مرتبط بـ Git.

## حدود الخطة المجانية

راجعنا وثائق Workers في **2026-10-07**، وحدود Pages وSupabase في **2026-10-06**. راجع صفحة الخطة عند التسجيل لأن الحصص يمكن أن تتغير.

| المنصة                | حدود تحقّقنا منها                                                                                       | ما يعنيه ذلك لمدار                                                             |
| --------------------- | ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| Workers Static Assets | طلبات الملفات الثابتة مجانية وغير محدودة، ولا توجد تكلفة إضافية لتخزينها                                | مدار ينشر ملفات ثابتة؛ حسابات Supabase وبياناته تبقى ضمن حصص Supabase          |
| Cloudflare Pages Free | 500 عملية بناء شهرياً، والطلبات للملفات الثابتة مجانية وغير محدودة                                      | مناسب لواجهة المشروع؛ هذا لا يعني أن قواعد البيانات أو الدوال الخارجية بلا حصص |
| Supabase Free         | مشروعان مجانيان؛ قاعدة بيانات 500 MB لكل مشروع؛ 50,000 مستخدم نشط شهرياً؛ 500,000 استدعاء Edge Function | أكثر من كافٍ كبداية شخصية مع متابعة الاستهلاك؛ توجد حصص أخرى مثل نقل البيانات  |
| Supabase Storage Free | 1 GB ضمن حصة المؤسسة                                                                                    | المشروع الحالي يحفظ سجلات نصية في قاعدة البيانات ولا يستخدم رفع ملفات          |

مشاريع Supabase المجانية قد تتوقف بعد فترة عدم نشاط وتحتاج استئنافاً من لوحة التحكم. المجاني لا يوفّر ضمان تشغيل أو نسخ احتياطي مماثلاً للخطط المدفوعة. احتفظ بنسخ JSON مستقلة، وراجع الحاجة للترقية إذا اعتمدت عليه لفريق أو سجلات حساسة لعملك.

استضافة الملفات الثابتة لا تستدعي سكربت Worker في الإعداد الحالي. إذا أضفت لاحقاً وظائف خادم، تخضع طلباتها لحدود وتسعير Workers، ولعمليات البناء حصص مستقلة في خطة Cloudflare.

عنوانا `workers.dev` و`pages.dev` مجانيان. شراء نطاق خاص أو خدمة SMTP أو الانتقال إلى خطة مدفوعة تكاليف منفصلة. مزوّد البريد الافتراضي في Supabase يرسل إلى أعضاء فريق المشروع فقط؛ فتح حسابات عامة يحتاج إعداد Custom SMTP، كما يشرح دليل السحابة.

## استعمال الهاتف

افتح عنوان الموقع المنشور في متصفح الهاتف وسجّل بحسابك. الواجهة تدعم العربية واتجاه RTL، وتكيّف الشاشات والنوافذ والأزرار مع العرض الصغير. البيانات تُجلب من نفس حساب Supabase؛ لا تحتاج تطبيق هاتف منفصلاً.

عند التعديل من الهاتف والكمبيوتر معاً، انتظر نجاح الحفظ وراجع تنبيه التعارض إن ظهر. التخزين السحابي لا يعني دمج كل تغيير تلقائياً عندما يعدّل جهازان النسخة نفسها في الوقت نفسه.

## بعد النشر وقبل اعتماد الموقع

أكمل [قائمة التحقق العملية](cloud-setup.md#8-التحقق-قبل-الاعتماد-اليومي): حسابان مستقلان، استرجاع كلمة المرور، الحفظ بعد إعادة التحميل، جهازان، انقطاع الإنترنت، والتجربة على الهاتف. اختبار كود المشروع لا يثبت تفعيل خدمة البريد أو إعداد قاعدة البيانات في حساب استضافة لم يُربط بعد.

## البدائل

Vercel وNetlify يستطيعان استضافة واجهة Vite أيضاً. إذا اخترت بديلاً، تبقى قاعدة Supabase كما هي، مع تحديث عنوان الموقع وعناوين التوجيه و`ALLOWED_ORIGINS`.

## المصادر الرسمية

قرأنا النسخ الرسمية من الوثائق على GitHub عندما لم تكن صفحات المواقع المباشرة متاحة في شبكة التطوير:

- [Cloudflare: توصية Workers للمشاريع الجديدة](https://developers.cloudflare.com/pages/get-started/) — [المصدر](https://github.com/cloudflare/cloudflare-docs/blob/production/src/content/partials/pages/workers-for-new-projects.mdx).
- [Workers Static Assets: إعداد ملفات الواجهة](https://developers.cloudflare.com/workers/static-assets/migration-guides/migrate-from-pages/) — [المصدر](https://github.com/cloudflare/cloudflare-docs/blob/production/src/content/docs/workers/static-assets/migration-guides/migrate-from-pages.mdx).
- [Workers Builds: البناء والنشر ومتغيرات البناء](https://developers.cloudflare.com/workers/ci-cd/builds/configuration/) — [المصدر](https://github.com/cloudflare/cloudflare-docs/blob/production/src/content/docs/workers/ci-cd/builds/configuration.mdx).
- [Workers Static Assets: التسعير والحدود](https://developers.cloudflare.com/workers/static-assets/billing-and-limitations/) — [المصدر](https://github.com/cloudflare/cloudflare-docs/blob/production/src/content/docs/workers/static-assets/billing-and-limitations.mdx).
- [Cloudflare Pages: الحدود](https://developers.cloudflare.com/pages/platform/limits/) — [المصدر](https://github.com/cloudflare/cloudflare-docs/blob/production/src/content/docs/pages/platform/limits.mdx).
- [Cloudflare Pages: تسعير الملفات الثابتة والدوال](https://developers.cloudflare.com/pages/functions/pricing/) — [المصدر](https://github.com/cloudflare/cloudflare-docs/blob/production/src/content/docs/pages/functions/pricing.mdx).
- [Cloudflare Pages: إعداد البناء والمتغيرات](https://developers.cloudflare.com/pages/configuration/build-configuration/) — [المصدر](https://github.com/cloudflare/cloudflare-docs/blob/production/src/content/docs/pages/configuration/build-configuration.mdx).
- [Cloudflare Pages: دليل Vite](https://developers.cloudflare.com/pages/framework-guides/deploy-a-vite3-project/) — [المصدر](https://github.com/cloudflare/cloudflare-docs/blob/production/src/content/docs/pages/framework-guides/deploy-a-vite3-project.mdx). الدليل يوضح البناء إلى `dist`؛ نسخة Vite المستخدمة محددة في اعتماديات المشروع.
- [Cloudflare Pages: الرفع المباشر](https://developers.cloudflare.com/pages/get-started/direct-upload/) — [المصدر](https://github.com/cloudflare/cloudflare-docs/blob/production/src/content/docs/pages/get-started/direct-upload.mdx).
- [Supabase: الخطة المجانية والحصص](https://supabase.com/docs/guides/platform/billing-on-supabase) — [المصدر](https://github.com/supabase/supabase/blob/master/apps/docs/content/guides/platform/billing-on-supabase.mdx).
- [Supabase: قيود البريد وCustom SMTP](https://supabase.com/docs/guides/auth/auth-smtp) — [المصدر](https://github.com/supabase/supabase/blob/master/apps/docs/content/guides/auth/auth-smtp.mdx).
