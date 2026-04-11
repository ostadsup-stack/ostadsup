# Ostadi (ostadsup)

منصة PWA لإدارة الأفواج: أستاذ (لوحة واحدة)، طالب، منسق — مع **Supabase** (Postgres + Auth + RLS + Storage).  
*English:* platform for managing relations between teachers and students.

## المتطلبات

- حساب [Supabase](https://supabase.com)
- Node.js 20+

## إعداد Supabase

1. أنشئ مشروعاً جديداً.
2. من **SQL Editor**، إما لصق الملف المجمّع مرة واحدة:
   - [supabase/ostadi_all_for_sql_editor.sql](supabase/ostadi_all_for_sql_editor.sql)
   أو نفّذ بالترتيب:
   - [supabase/migrations/20260401160000_init_ostadi.sql](supabase/migrations/20260401160000_init_ostadi.sql)
   - [supabase/migrations/20260401160100_storage_materials.sql](supabase/migrations/20260401160100_storage_materials.sql)
   - [supabase/migrations/20260401170000_ensure_my_profile.sql](supabase/migrations/20260401170000_ensure_my_profile.sql)
3. **Authentication → Providers**: فعّل البريد وكلمة المرور.
4. للتطوير السريع: **Authentication → Providers → Email** عطّل «Confirm email» إن أردت تجربة فورية بدون تأكيد البريد.
5. انسخ **Project URL** و **anon public key** من **Project Settings → API**.

## تشغيل الواجهة

```bash
cd web
cp .env.example .env
# عدّل VITE_SUPABASE_URL و VITE_SUPABASE_ANON_KEY
npm install
npm run dev
```

- مسار الأستاذ بعد التسجيل كـ **أستاذ**: `/t`
- مسار الطالب: `/s` — الانضمام: `/s/join`

## البناء للإنتاج

```bash
cd web
npm run build
npm run preview
```

## النشر على Vercel

- **Root Directory = `.` (جذر المستودع):** يستخدم [`vercel.json`](vercel.json) في الجذر؛ أوامر التثبيت والبناء تستهدف `web/` تلقائياً، والمخرجات من `web/dist`.
- **Root Directory = `web`:** يُدمَج مع [`web/vercel.json`](web/vercel.json) (`npm ci` و`npm run build` و`outputDirectory: dist`). لا تضبط يدوياً أوامراً في لوحة Vercel تتعارض مع ذلك.
- إن رأيت خطأ `npm ci --prefix web` فغالباً كان السبب جذر المشروع = `web` مع أمر يفترض جذر المستودع؛ الإعداد أعلاه يعالج الحالتين.
- أضِف `VITE_SUPABASE_URL` و`VITE_SUPABASE_ANON_KEY` في **Settings → Environment Variables** (لا ترفع `.env` إلى GitHub). يُفضَّل **Node 20+** (مثلاً عبر [`.nvmrc`](.nvmrc) أو إعدادات المشروع).

## ملاحظات

- **المنسق**: الأستاذ يرقّي عضواً من صفحة الفوج (زر «جعله منسقاً»).
- **واتساب**: أزرار مشاركة تفتح `wa.me` بنص جاهز (بدون WhatsApp API).
- **المراقبة**: لإنتاج حقيقي يُنصح بربط أداة أخطاء (مثل Sentry) في الواجهة.

## هيكل المستودع

- `web/` — تطبيق Vite + React + TypeScript + PWA
- `supabase/migrations/` — مخطط قاعدة البيانات و RLS
- `prompt ostadi` — وثيقة الرؤية الأصلية
