# StockiPro v1.2

SaaS متعدد المتاجر لجرد المخزون الفوري — Next.js (App Router) +
Supabase (Postgres, Auth, RLS, Realtime).

## الحالة الحالية

- **قاعدة البيانات**: حقيقية وجاهزة على Supabase، المشروع `StockiPro`
  (`akovwpscqsxeouoxmqwu`) — Schema + RLS + migrations كاملة،
  security advisor = 0 alertes، الـ isolation بين المتاجر مختبرة.
- **الكود**: كل الصفحات والـ server actions جاهزة (login، scan،
  dashboard، admin) — تفاصيل كل مرحلة في [`docs/`](./docs).
- **التصميم البصري**: أساسي (Tailwind utility classes، بلا هوية
  بصرية مصممة) — يحتاج تصميم حقيقي قبل الإطلاق للزبائن.
- **GitHub / Vercel**: لسه ماشي مربوطين — هذا repo جاهز للدفع.

## التشغيل محلياً

```bash
npm install
cp .env.example .env.local   # عمّر القيم من Supabase Dashboard → Settings → API
npm run build
npx vitest run
npm run dev
```

## البنية

```
app/
  layout.tsx            # viewport lock + RTL + Cairo
  login/                # تسجيل الدخول + أول تفعيل (PIN)
  scan/                  # الماسح الضوئي + كشف التكرار + وضع بلا اتصال
  dashboard/             # الفوارق (Écart) + Realtime + Excel
  admin/                 # Master Admin (إدارة المتاجر)
  (admin)/workers/        # إدارة العمال (إنشاء/تعطيل/PIN جديد)
lib/
  supabase/               # عملاء Supabase (client/server/admin)
  auth-helpers.ts         # PIN + إيميل اصطناعي
  excel.ts                # قالب/استيراد/تصدير Excel
  offline-queue.ts        # قائمة انتظار IndexedDB
middleware.ts              # حراسة الجلسة والصلاحيات
tests/                      # اختبارات Vitest
docs/                       # تفاصيل كل مرحلة من التطوير (تاريخياً)
```

## ما ينقص قبل الإطلاق الحقيقي

1. تصميم بصري حقيقي (هوية بصرية، ألوان، تفاصيل UI).
2. ربط GitHub + Vercel (انظر الخطوات اللي عطاهالك Claude في المحادثة).
3. حساب `admin` الأول لازم يتزاد يدوياً من Supabase Dashboard (ما
   كاينش UI لهذا بعد — انظر `docs/README-etape-7-FINAL.md`).
