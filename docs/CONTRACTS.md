# أتمتة العقود بعد اعتماد/سداد عرض السعر

## التدفق
1. عند تحويل عرض السعر إلى `معتمد` / `بانتظار السداد` أو الحالة المالية إلى `تم السداد` / `معتمد مالياً`.
2. يُستدعى `processAutoContractOnApproval` من واجهة متابعة العميل.
3. يُنشأ سجل في `sales_contracts` مرتبط بـ `quotation_number` (مرة واحدة فقط).
4. قالب الطباعة A4 يسحب بيانات الشركة/البنك/خطة السداد والشروط العامة 1–13.

## الملفات
- `lib/business/contract-service.ts` — الربط التلقائي
- `components/sales/ContractPrint.tsx` — قالب عقد الاتفاق
- `app/api/contracts/auto-generate` — API إنشاء/إعادة ربط
- `scripts/sql/019_auto_contracts.sql` — أعمدة اللقطة + Database Trigger

## SQL
نفّذ `019_auto_contracts.sql` بعد `017` و`018`.
