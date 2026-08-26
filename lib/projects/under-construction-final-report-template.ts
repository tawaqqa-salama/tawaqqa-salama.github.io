import type { CompanyProfile } from '@/lib/company-profile';
import type {
  UnderConstructionTechnicalReportModel,
  UnderConstructionTechnicalReportSection,
  UnderConstructionTechnicalReportSystem,
  UnderConstructionTechnicalReportValue,
} from '@/lib/projects/under-construction-technical-report-model';
import { esc, formatReportTextHtml } from '@/lib/projects/engineering-report-engine/renderer/html-utils';
import { getEmbeddedArabicFontCss } from '@/lib/projects/engineering-report-engine/renderer/embedded-fonts';

function tx(value: string | null | undefined, fallback = 'غير متوفر'): string {
  const text = value?.trim();
  return formatReportTextHtml(text || fallback);
}

function normalizeDisplay(value: string | null | undefined): string {
  const raw = value?.trim() || '';
  if (!raw) return 'غير متوفر';
  return raw
    .replace(/\bK-Factor\s+K(?=\d)/gi, 'K-Factor = ')
    .replace(/^K(\d+(?:\.\d+)?)$/, 'K = $1')
    .replace(/رطب\s*\(\s*رطب\s*\(\s*Wet Pipe\s*\)\s*\)/i, 'رطب (Wet Pipe)')
    .replace(/^wet$/i, 'رطب (Wet Pipe)')
    .replace(/^upright$/i, 'رأسي (Upright)')
    .replace(/^dry_chemical$/i, 'مسحوق كيميائي جاف');
}

function display(value: string | null | undefined, fallback = 'غير متوفر'): string {
  return value?.trim() ? tx(normalizeDisplay(value)) : tx(fallback);
}

function referenceDisplay(value: string | null | undefined): string {
  return value?.trim() ? display(value) : tx('لم يُسجل مرجع');
}

function sourceLine(item: UnderConstructionTechnicalReportValue): string {
  const reference = item.reference ? ` — ${item.reference}` : '';
  return `المصدر: ${item.source_label}${reference}`;
}

function renderValueRows(items: UnderConstructionTechnicalReportValue[]): string {
  if (!items.length) {
    return '<tr><td colspan="3" class="empty-cell">لم تُسجل بيانات مصدرية صريحة لهذا القسم.</td></tr>';
  }
  return items.map((item) => `<tr><th>${tx(item.label)}</th><td>${display(item.value)}</td><td class="source-cell">${tx(sourceLine(item))}</td></tr>`).join('');
}

function systemList(sections: UnderConstructionTechnicalReportSection[]): UnderConstructionTechnicalReportSystem[] {
  return sections.flatMap((section) => section.systems);
}

function decisionLabel(system: UnderConstructionTechnicalReportSystem): string {
  return system.applicable === true ? 'مطلوب بقرار صريح' : 'لم يكتمل قرار الانطباق';
}

function renderRequirements(sections: UnderConstructionTechnicalReportSection[]): string {
  const systems = systemList(sections);
  if (!systems.length) return '<div class="empty-note">لم تُسجل متطلبات صريحة في دراسة المشروع.</div>';
  return `<table class="requirements-table"><thead><tr><th>النظام / المتطلب</th><th>الحالة</th><th>المرجع</th><th>ملخص المتطلب</th></tr></thead><tbody>${systems.map((system) => `<tr><th>${tx(system.system_label)}</th><td>${tx(decisionLabel(system))}</td><td>${referenceDisplay(system.code_reference)}</td><td>${display(system.code_requirement)}</td></tr>`).join('')}</tbody></table>`;
}

function renderDesignSolutions(sections: UnderConstructionTechnicalReportSection[]): string {
  const systems = systemList(sections).filter((system) => system.applicable === true);
  if (!systems.length) return '<div class="empty-note">لم تُسجل حلول تصميمية لأنظمة مطلوبة بقرار صريح.</div>';
  return `<table class="design-table"><thead><tr><th>النظام</th><th>الحل التصميمي المختار</th><th>مرجع المخطط / التصميم</th><th>ملاحظة التنفيذ</th></tr></thead><tbody>${systems.map((system) => `<tr><th>${tx(system.system_label)}</th><td>${display(system.selected_solution, 'لم يتم إدخال الحل التصميمي')}</td><td>${display(system.drawing_reference, 'لم يُسجل بالمخطط')}</td><td>${display(system.implementation_note, 'لم تُسجل ملاحظة تنفيذ')}</td></tr>`).join('')}</tbody></table>`;
}

function renderEngineeringDataSheet(model: UnderConstructionTechnicalReportModel): string {
  const include = /سعة الخزان|حجم الخزان|التدفق|الضغط|نوع النظام|نوع المرشات|تصنيف الخطورة|K-Factor|عدد المناطق|عدد المرشات|عدد المخارج|مسافة|عرض|إنارة|لوحات المخارج|كواشف|لوحة|نقاط النداء|أجهزة التنبيه|المولد|التأريض|الصواعق/i;
  const items = model.engineering_data.filter((item) => include.test(`${item.label} ${item.value}`));
  const uniqueItems = items.filter((item, index, all) => all.findIndex((candidate) => `${candidate.label}|${candidate.value}` === `${item.label}|${item.value}`) === index);
  if (!uniqueItems.length) return '<div class="empty-note">لا توجد قيم هندسية مرجعية متاحة للعرض في هذا القسم.</div>';
  return `<table class="engineering-data-table"><thead><tr><th>البند الهندسي</th><th>القيمة</th><th>المصدر الكانوني</th></tr></thead><tbody>${uniqueItems.map((item) => `<tr><th>${tx(item.label)}</th><td>${display(item.value)}</td><td class="source-cell">${tx(sourceLine(item))}</td></tr>`).join('')}</tbody></table>`;
}

function sectionTitle(number: number, title: string, marker = ''): string {
  return `<h2 class="chapter-title"><span class="chapter-number" dir="ltr">${String(number).padStart(2, '0')}</span>${marker}${tx(title)}</h2>`;
}

function renderCover(model: UnderConstructionTechnicalReportModel, company: CompanyProfile): string {
  const brand = company.legal_name || company.name || 'توقع سلامة للاستشارات';
  const logo = company.logo_url ? `<img class="cover-logo" src="${esc(company.logo_url)}" alt="" />` : `<div class="cover-logo-fallback">توقع سلامة</div>`;
  return `<section class="cover page-break">
    <div class="cover-orbit cover-orbit-a"></div><div class="cover-orbit cover-orbit-b"></div><div class="cover-grid"></div>
    <div class="cover-inner"><header class="cover-header"><div>${logo}</div><div class="cover-brand">${tx(brand)}</div><div class="cover-line"></div></header>
      <main class="cover-main"><div class="micro-label">TECHNICAL REPORT — FIRE &amp; LIFE SAFETY</div><h1>التقرير الفني للمبنى تحت الإنشاء</h1><p>دراسة متطلبات السلامة والوقاية من الحريق للمشروع</p><div class="cover-badge">UNDER_CONSTRUCTION</div></main>
      <section class="cover-details"><div><span>اسم المشروع</span><strong>${tx(model.project_information.project_name)}</strong></div><div><span>المالك</span><strong>${tx(model.project_information.owner)}</strong></div><div><span>الموقع</span><strong>${tx(model.project_information.location)}</strong></div><div><span>رقم التقرير</span><strong dir="ltr">${tx(model.project_information.report_number)}</strong></div><div><span>التاريخ</span><strong dir="ltr">${tx(model.project_information.report_date)}</strong></div><div><span>الجهة الاستشارية</span><strong>${tx(model.project_information.consulting_office || brand)}</strong></div></section>
      <footer class="cover-footer"><span>وثيقة هندسية رسمية</span><span>منصة توقع سلامة</span></footer></div></section>`;
}

function renderToc(pageMap?: Record<string, number>): string {
  const entries = [
    ['intro', 'مقدمة ونطاق الدراسة'], ['project', 'بيانات المشروع والمالك'], ['building', 'بيانات المبنى والتصنيف'], ['basis', 'أساس التصميم والمراجع'], ['requirements', 'متطلبات السلامة والوقاية من الحريق'], ['engineering', 'الأنظمة الهندسية المطلوبة'], ['data', 'البيانات والحسابات الهندسية المرجعية'], ['recommendations', 'المتطلبات والتوصيات الفنية'], ['summary', 'الملخص والخلاصة وحدود الدراسة'], ['approvals', 'الاعتماد والتوقيعات'],
  ];
  return `<section class="toc-page page-break"><div class="eyebrow">دليل التقرير</div><h1>فهرس المحتويات</h1><div class="toc-list">${entries.map(([id, title], index) => `<div class="toc-row"><span class="toc-number" dir="ltr">${String(index + 1).padStart(2, '0')}</span><span class="toc-title">${tx(title)}</span><span class="toc-dots"></span><span class="toc-page-number" dir="ltr">${pageMap?.[id] || '—'}</span></div>`).join('')}</div><p class="toc-note">الأرقام تثبت من PDF الفعلي عند التوليد متعدد التمريرات؛ لا تمثل هذه الصفحة اعتمادًا أو حكمًا بالمطابقة.</p></section>`;
}

function renderSection(number: number, title: string, body: string, id: string, pageMap?: Record<string, number>): string {
  const marker = pageMap ? '' : `<span class="section-marker">SECTION_PAGE_${esc(id)}MARKEREND</span>`;
  return `<section class="report-section keep-section" id="section-${esc(id)}">${sectionTitle(number, title, marker)}${body}</section>`;
}

function renderProjectReferences(model: UnderConstructionTechnicalReportModel): string {
  return `<table class="data-table"><thead><tr><th>البند</th><th>القيمة</th><th>المصدر</th></tr></thead><tbody>${renderValueRows(model.project_references)}</tbody></table>`;
}

function renderCodes(model: UnderConstructionTechnicalReportModel): string {
  if (!model.code_references.length) return '<p class="empty-note">لم تُسجل مراجع كودية أو تصميمية صريحة لهذا المشروع.</p>';
  return `<table class="data-table"><thead><tr><th>المرجع</th><th>البيان</th><th>المصدر</th></tr></thead><tbody>${model.code_references.map((item) => `<tr><th>${tx(item.title)}</th><td>${tx(item.reference)}${item.note ? `<br/><span class="muted">${tx(item.note)}</span>` : ''}</td><td class="source-cell">${tx(item.sources.map((source) => source.source_label).join(' + '))}</td></tr>`).join('')}</tbody></table>`;
}

function renderRecommendations(model: UnderConstructionTechnicalReportModel): string {
  if (!model.implementation_notes.length) return '<div class="empty-note">لا توجد متطلبات أو ملاحظات تنفيذ صريحة مسجلة ضمن الدراسة الحالية.</div>';
  return `<ol class="recommendation-list">${model.implementation_notes.map((item) => `<li><strong>${tx(item.system_label || 'ملاحظة عامة')}</strong><p>${tx(item.text)}</p></li>`).join('')}</ol>`;
}

function renderApprovals(model: UnderConstructionTechnicalReportModel, company: CompanyProfile, pageMap?: Record<string, number>): string {
  const office = model.project_information.consulting_office || company.legal_name || company.name || 'الجهة الاستشارية';
  const marker = pageMap ? '' : '<span class="section-marker">SECTION_PAGE_approvalsMARKEREND</span>';
  return `<section class="approval-page page-break">${marker}<div class="eyebrow">وثيقة الاعتماد</div>${sectionTitle(10, 'الاعتماد والتوقيعات')}<div class="approval-meta"><span>رقم التقرير: <bdi dir="ltr">${tx(model.project_information.report_number)}</bdi></span><span>التاريخ: <bdi dir="ltr">${tx(model.project_information.report_date)}</bdi></span><span>الجهة: ${tx(office)}</span></div><p class="approval-note">تُستكمل التوقيعات والأختام وفق الصلاحيات والإجراءات المعتمدة للمكتب والاستشاري المسؤول.</p><div class="signature-grid"><div class="signature-box"><strong>المهندس المُعد</strong><span>الاسم: ....................................</span><span>التوقيع: ..................................</span><span>التاريخ: ...................................</span></div><div class="stamp-box">مكان ختم المكتب</div><div class="signature-box"><strong>اعتماد المكتب</strong><span>الجهة: ${tx(office)}</span><span>التوقيع / الختم: ........................</span><span>التاريخ: ...................................</span></div><div class="signature-box notes-box"><strong>ملاحظات الاعتماد</strong><span></span><span></span><span></span></div></div></section>`;
}

function css(): string {
  return `${getEmbeddedArabicFontCss()}
@page { size: A4 portrait; margin: 14mm 15mm 17mm; }
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; background: #fff; color: #19332b; font-family: 'Noto Naskh Arabic', 'Noto Naskh Arabic UI', Tahoma, sans-serif; font-size: 11.5pt; line-height: 1.75; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
.report { direction: rtl; }
.cover { min-height: 266mm; margin: -14mm -15mm -17mm; padding: 0; position: relative; overflow: hidden; break-after: page; page-break-after: always; background: #113d34; color: #f5fbf6; }
.cover-inner { min-height: 297mm; padding: 20mm 20mm 15mm; position: relative; z-index: 1; display: flex; flex-direction: column; }
.cover-grid { position: absolute; inset: -20mm; opacity: .23; background: linear-gradient(125deg, transparent 0 48%, #a7d4b0 48.2% 48.5%, transparent 48.7% 100%), linear-gradient(35deg, transparent 0 64%, #a7d4b0 64.2% 64.5%, transparent 64.7% 100%); transform: rotate(-9deg) scale(1.15); }
.cover-orbit { position: absolute; border: 1px solid rgba(174, 220, 185, .35); border-radius: 50%; }
.cover-orbit-a { width: 190mm; height: 190mm; left: -95mm; top: 30mm; }.cover-orbit-b { width: 125mm; height: 125mm; right: -62mm; bottom: -35mm; }
.cover-header { display: flex; align-items: center; gap: 8mm; }.cover-logo { width: 45mm; max-height: 18mm; object-fit: contain; filter: brightness(0) invert(1); }.cover-logo-fallback { border: 1px solid #b9dfc0; padding: 4mm 7mm; font-weight: 800; font-size: 15pt; }.cover-brand { max-width: 70mm; color: #d9efde; font-weight: 800; font-size: 12pt; }.cover-line { flex: 1; height: 1px; background: rgba(217, 239, 222, .65); }
.cover-main { margin-top: 43mm; max-width: 150mm; }.micro-label { color: #b7dfc0; font: 700 9pt Arial, sans-serif; letter-spacing: .08em; direction: ltr; }.cover-main h1 { margin: 7mm 0 4mm; font-size: 32pt; line-height: 1.2; color: #fff; }.cover-main p { margin: 0; color: #e5f3e8; font-size: 16pt; line-height: 1.65; }.cover-badge { display: inline-block; margin-top: 9mm; border: 1px solid #a9d7b2; padding: 2mm 7mm; color: #f4fff5; font: 700 11pt Arial, sans-serif; direction: ltr; }
.cover-details { margin-top: auto; display: grid; grid-template-columns: 1fr 1fr; border-top: 1px solid rgba(217,239,222,.55); border-right: 1px solid rgba(217,239,222,.55); background: rgba(4, 27, 22, .34); }.cover-details > div { min-height: 19mm; padding: 3mm 4mm; border-left: 1px solid rgba(217,239,222,.55); border-bottom: 1px solid rgba(217,239,222,.55); }.cover-details span { display: block; color: #b7dfc0; font-size: 9.5pt; font-weight: 700; }.cover-details strong { display: block; margin-top: 1mm; color: #fff; font-size: 11pt; line-height: 1.45; }.cover-footer { display: flex; justify-content: space-between; margin-top: 7mm; color: #cbe7d0; font-size: 9.5pt; }
.page-break { break-after: page; page-break-after: always; }.toc-page { min-height: 245mm; padding-top: 8mm; }.eyebrow { color: #2d7659; font-size: 10pt; font-weight: 800; letter-spacing: .04em; }.toc-page h1 { margin: 2mm 0 12mm; color: #143f33; font-size: 23pt; }.toc-list { border-top: 2px solid #31755b; }.toc-row { display: flex; align-items: baseline; gap: 7px; padding: 4mm 0; border-bottom: 1px solid #d9e7dc; font-size: 12pt; }.toc-number { color: #2d7659; font-weight: 800; min-width: 12mm; }.toc-title { white-space: nowrap; }.toc-dots { flex: 1; border-bottom: 1px dotted #9cb7a7; transform: translateY(-3px); }.toc-page-number { min-width: 9mm; color: #2d7659; font-weight: 800; text-align: left; }.toc-note { margin-top: 12mm; color: #526e60; font-size: 10pt; }
.report-section { margin: 0 0 11mm; }.keep-section { break-inside: auto; page-break-inside: auto; }.chapter-title { margin: 0 0 7mm; padding: 0 0 3mm; border-bottom: 2px solid #31755b; color: #123d32; font-size: 17pt; line-height: 1.35; font-weight: 900; }.chapter-number { display: inline-block; min-width: 18mm; color: #31755b; direction: ltr; }.section-marker { display: inline; color: transparent; font: 1px Arial; }.subheading { margin: 8mm 0 3mm; color: #23664d; font-size: 13pt; }.lead { margin: 0 0 5mm; line-height: 1.9; }.data-table, .requirements-table, .design-table, .engineering-data-table, .system-table, .reference-table { width: 100%; border-collapse: collapse; table-layout: fixed; margin: 4mm 0 7mm; font-size: 10.2pt; line-height: 1.55; }.data-table th, .data-table td, .requirements-table th, .requirements-table td, .design-table th, .design-table td, .engineering-data-table th, .engineering-data-table td, .system-table th, .system-table td, .reference-table th, .reference-table td { border: 1px solid #b8d0c0; padding: 2.7mm 3mm; vertical-align: top; text-align: right; overflow-wrap: anywhere; unicode-bidi: plaintext; }.data-table th, .requirements-table th, .design-table th, .engineering-data-table th, .system-table th, .reference-table th { background: #e0efe4; color: #153f32; font-weight: 800; }.data-table th:first-child { width: 28%; }.requirements-table th:first-child, .design-table th:first-child, .engineering-data-table th:first-child { width: 24%; }.requirements-table th:nth-child(2) { width: 18%; }.requirements-table th:nth-child(3) { width: 20%; }.design-table th:nth-child(3) { width: 20%; }.engineering-data-table th:last-child { width: 25%; }.data-table td:last-child, .data-table th:last-child { width: 28%; }.source-cell { color: #4e6e5e; font-size: 9.2pt; }.empty-cell, .empty-note { color: #5a7164; background: #f7faf8; }.empty-note { margin: 5mm 0; padding: 4mm; border: 1px solid #d4e2d7; }.system-block { margin: 0 0 9mm; }.system-heading { display: flex; justify-content: space-between; align-items: baseline; gap: 8mm; border-bottom: 1px solid #b8d0c0; }.system-heading h3 { margin: 0; color: #123d32; font-size: 13pt; }.system-heading span { color: #557566; font-size: 9.5pt; }.system-table { margin: 3mm 0 5mm; }.system-table th { width: 30%; }.subcaption { margin: 4mm 0 2mm; color: #24654d; font-size: 10.5pt; font-weight: 800; }.reference-table { margin-top: 0; }.reference-table th:first-child { width: 27%; }.reference-table th:last-child { width: 29%; }.muted { color: #61776b; font-size: 9.5pt; }.recommendation-list { margin: 0; padding-inline-start: 8mm; }.recommendation-list li { margin: 0 0 5mm; padding: 3mm 4mm; border: 1px solid #d1e1d5; background: #f8fbf9; }.recommendation-list p { margin: 1mm 0 0; }.limitation-list { margin: 0; padding-inline-start: 7mm; }.summary-box { padding: 5mm; border: 1px solid #b9d2c1; background: #f4faf5; }.summary-box p { margin: 0 0 4mm; }.final-summary-box { min-height: 92mm; padding: 9mm 8mm; }.final-summary-box .limitation-list { line-height: 2; }.approval-page { min-height: 245mm; padding-top: 8mm; break-before: page; page-break-before: always; }.approval-meta { display: flex; gap: 8mm; flex-wrap: wrap; padding: 4mm 0; border-bottom: 1px solid #c9ddd0; }.approval-note { margin: 8mm 0; color: #516e60; }.signature-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 7mm; margin-top: 16mm; }.signature-box, .stamp-box { min-height: 47mm; padding: 5mm; border: 1px solid #abc8b5; }.signature-box { display: flex; flex-direction: column; gap: 4mm; }.signature-box strong { color: #1f6048; }.stamp-box { display: flex; align-items: center; justify-content: center; color: #6a8374; }.notes-box { grid-column: 1 / -1; min-height: 35mm; }.notes-box span { border-bottom: 1px solid #d3e1d6; }
@media print { .report-section, .system-block, .data-table, .requirements-table, .design-table, .engineering-data-table, .system-table, .reference-table, .signature-box, .stamp-box { break-inside: avoid; page-break-inside: avoid; } .requirements-table tr, .design-table tr, .engineering-data-table tr, .data-table tr, .system-table tr, .reference-table tr { break-inside: avoid; page-break-inside: avoid; } .cover { min-height: 297mm; } }
@media screen and (max-width: 600px) { .cover { margin: 0; min-height: 760px; }.cover-inner { min-height: 760px; padding: 28px 22px; }.cover-main { margin-top: 90px; }.cover-main h1 { font-size: 28px; }.cover-main p { font-size: 18px; }.cover-details { grid-template-columns: 1fr; }.toc-row { gap: 5px; font-size: 16px; }.data-table, .system-table, .reference-table { font-size: 13px; }.data-table th, .data-table td, .requirements-table th, .requirements-table td, .design-table th, .design-table td, .engineering-data-table th, .engineering-data-table td, .system-table th, .system-table td, .reference-table th, .reference-table td { padding: 9px 7px; }.system-heading { display: block; }.system-heading span { display: block; margin-top: 3px; } }
`;
}

export function buildUnderConstructionFinalTechnicalReportHtml(params: {
  model: UnderConstructionTechnicalReportModel;
  company: CompanyProfile;
  pageMap?: Record<string, number>;
}): string {
  const { model, company, pageMap } = params;
  const body = [
    renderSection(1, 'مقدمة ونطاق الدراسة', `<p class="lead">${tx(model.introduction)}</p><div class="summary-box"><strong>نطاق الدراسة</strong><p>${tx(model.study_scope)}</p></div>`, 'intro', pageMap),
    renderSection(2, 'بيانات المشروع والمالك', renderProjectReferences(model), 'project', pageMap),
    renderSection(3, 'بيانات المبنى والتصنيف', `<p class="lead">تُعرض بيانات المبنى والتصنيف كما وردت في المصادر الكانونية للمشروع، دون استنتاج أو إعادة حساب.</p>${renderProjectReferences(model)}`, 'building', pageMap),
    renderSection(4, 'أساس التصميم والمراجع', `<p class="lead">تستند هذه الدراسة إلى مراجع المشروع والتصميم المسجلة صراحةً.</p>${renderCodes(model)}`, 'basis', pageMap),
    renderSection(5, 'متطلبات السلامة والوقاية من الحريق', `<p class="lead">يعرض هذا القسم المتطلبات والحالة والمرجع وملخص المتطلب فقط، دون إعادة عرض الحلول أو جداول المصدر الكاملة.</p>${renderRequirements(model.report_sections)}`, 'requirements', pageMap),
    renderSection(6, 'الأنظمة الهندسية المطلوبة', `<p class="lead">يعرض هذا القسم الحلول التصميمية المختارة للأنظمة المطلوبة فقط، مع مرجع المخطط وملاحظة التنفيذ.</p>${renderDesignSolutions(model.report_sections)}`, 'engineering', pageMap),
    renderSection(7, 'البيانات والحسابات الهندسية المرجعية', `<p class="lead">القيم التالية للعرض المرجعي من المصادر الكانونية الأصلية، ولا يعيد التقرير حسابها أو تخزين نسخة موازية منها.</p>${renderEngineeringDataSheet(model)}`, 'data', pageMap),
    renderSection(8, 'المتطلبات والتوصيات الفنية', renderRecommendations(model), 'recommendations', pageMap),
    renderSection(9, 'الملخص والخلاصة وحدود الدراسة', `<div class="summary-box final-summary-box"><p>يعرض هذا التقرير الدراسة الفنية ومتطلبات أنظمة السلامة والوقاية من الحريق وفق البيانات والمستندات المتاحة للمشروع، وتبقى مسؤولية استكمال المتطلبات والتنفيذ والاعتمادات وفق الإجراءات النظامية والجهات المختصة.</p><ul class="limitation-list">${model.limitations.map((item) => `<li>${tx(item)}</li>`).join('')}</ul></div>`, 'summary', pageMap),
  ].join('');
  return `<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="utf-8"/><title>${tx(model.project_information.project_name)}</title><style>${css()}</style></head><body><div class="report">${renderCover(model, company)}<main>${renderToc(pageMap)}${body}${renderApprovals(model, company, pageMap)}</main></div></body></html>`;
}
