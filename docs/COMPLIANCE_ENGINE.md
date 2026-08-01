# Dynamic Compliance Engine (SBC & NFPA)

## الهيكل
```
lib/compliance/          محرك الامتثال + أنواع + محلل ملفات + EKB
lib/export/              تقارير PDF/DOCX
lib/notifications/       WhatsApp webhook
app/api/compliance/      REST: validate, ekb
app/api/notifications/   REST: whatsapp
app/api/export/          REST: compliance-report
components/compliance/   واجهة المحرك
components/projects/     معاينة ميدانية + عارض BIM
lib/constants/module-navigation.ts  تبويبات الأقسام
```

## معايير
- SBC 801 / اشتقاقات النشاط الحالية
- NFPA 13 / 72 / 101 (قواعد استرشادية)
- ربط مواضيع EKB

## صيغ الملفات المدعومة
DWG · RVT · IFC · PDF · XLSX · DOCX  
(الملفات الثنائية تُسجَّل وصفياً فقط — لا تنفيذ داخل المتصفح)

## APIs
- `POST /api/compliance/validate`
- `GET /api/compliance/ekb`
- `POST /api/notifications/whatsapp` (`WHATSAPP_WEBHOOK_URL`)
- `POST /api/export/compliance-report`
